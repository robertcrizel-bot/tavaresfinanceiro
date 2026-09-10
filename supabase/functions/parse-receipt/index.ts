const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_receipt: { type: "boolean" },
    type: { type: "string", enum: ["income", "expense", "unknown"] },
    amount: { type: ["number", "null"] },
    date: { type: ["string", "null"] },
    time: { type: ["string", "null"] },
    counterparty: { type: ["string", "null"] },
    institution: { type: ["string", "null"] },
    payment_method: {
      type: "string",
      enum: ["Pix", "Boleto", "Cartão de Crédito", "Cartão de Débito", "Dinheiro", "Transferência", "Outro", "unknown"],
    },
    category_hint: { type: ["string", "null"] },
    receipt_id: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    purchased_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          total: { type: ["number", "null"] },
        },
        required: ["name", "quantity", "unit_price", "total"],
      },
    },
    low_confidence_fields: { type: "array", items: { type: "string" } },
  },
  required: [
    "is_receipt",
    "type",
    "amount",
    "date",
    "time",
    "counterparty",
    "institution",
    "payment_method",
    "category_hint",
    "receipt_id",
    "title",
    "notes",
    "purchased_items",
    "low_confidence_fields",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Configuração de IA ausente." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageDataUrl, categories = [], accounts = [] } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "Imagem inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const instruction = [
      "Você lê comprovantes financeiros brasileiros (Pix, boleto pago, comprovante de compra no cartão, cupom/nota fiscal).",
      "Extraia os dados exatamente como aparecem na imagem. Nunca invente valores.",
      "Regras:",
      "- type: 'income' quando o dono do comprovante RECEBEU o dinheiro (Pix recebido, depósito); 'expense' quando ele PAGOU (Pix enviado, boleto pago, compra).",
      "- amount: número em reais, ponto como separador decimal (ex: 1234.56).",
      "- date: formato YYYY-MM-DD. Hoje é " + today + ".",
      "- title: nome curto da outra parte ou do estabelecimento.",
      "- receipt_id: ID da transação / código de autenticação / chave, se houver.",
      "- purchased_items: somente para cupom/nota fiscal, percorra toda a seção de produtos, do primeiro item até antes dos totais, e devolva UM OBJETO por linha de produto, na mesma ordem do documento.",
      "- Cada objeto tem: name (descrição impressa do produto, fielmente transcrita, com marca, sabor, peso e unidade quando houver), quantity (quantidade comprada), unit_price (preço unitário) e total (valor pago naquele item). Use null apenas quando o número realmente não estiver legível no documento.",
      "- NUNCA resuma a lista. É proibido devolver algo como 'cupom com 11 itens' ou uma contagem: cada produto impresso deve virar um objeto próprio.",
      "- notes: apenas observações que NÃO sejam produtos (divergências de valor, bandeira/final do cartão, parcelamento). Nunca coloque a lista nem a contagem de itens em notes.",
      "- Códigos de barras/PLU podem aparecer junto ao produto, mas não são produtos separados. Linhas de quantidade, preço unitário ou continuação pertencem ao produto imediatamente anterior/seguinte e devem ser combinadas em um único elemento.",
      "- Nunca trate CNPJ, endereço, operador, subtotal, desconto, acréscimo, total, tributos, troco ou forma de pagamento como produto. Para outros comprovantes ou quando nenhum produto estiver legível, use [].",
      "- Se parte da lista de produtos estiver cortada, borrada ou duvidosa, inclua 'purchased_items' em low_confidence_fields; mantenha somente os itens realmente legíveis.",
      "- category_hint: escolha uma destas categorias quando fizer sentido: " + (categories.join(", ") || "nenhuma"),
      "- institution: banco/instituição do comprovante. Contas cadastradas do usuário: " + (accounts.join(", ") || "nenhuma"),
      "- low_confidence_fields: liste os campos que você não conseguiu ler com certeza.",
      "- is_receipt: false se a imagem não for um comprovante financeiro.",
      "Use null quando o dado não existir no documento.",
    ].join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        reasoning: { effort: "low" },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction },
              { type: "input_image", image_url: imageDataUrl },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "receipt",
            strict: false,
            schema: SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("gateway error", response.status, detail);
      let message = "Não foi possível ler o comprovante agora. Tente novamente.";
      if (response.status === 429) message = "Muitas leituras seguidas. Aguarde alguns segundos e tente de novo.";
      if (response.status === 402) message = "Os créditos de IA acabaram. Adicione créditos para continuar usando a leitura de comprovantes.";
      return new Response(JSON.stringify({ error: message }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read the SSE stream and accumulate the answer text.
    let text = "";
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload);
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            text += event.delta;
          } else if (event.type === "response.completed" && typeof event.response?.output_text === "string" && !text) {
            text = event.response.output_text;
          }
        } catch {
          /* ignore partial events */
        }
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text ?? "");
    } catch {
      const match = (text ?? "").match(/\{[\s\S]*\}/);
      if (!match) {
        return new Response(JSON.stringify({ error: "Não consegui entender esse comprovante." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      parsed = JSON.parse(match[0]);
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-receipt failure", e);
    return new Response(JSON.stringify({ error: "Erro inesperado ao ler o comprovante." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
