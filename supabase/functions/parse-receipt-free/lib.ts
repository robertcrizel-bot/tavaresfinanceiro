/**
 * Pure, Deno-free logic for the free receipt reader backed by Google Gemini
 * (free tier only). The thin Deno glue lives in index.ts; everything here is
 * unit-tested with vitest.
 *
 * Billing guard: the model is pinned to gemini-2.5-flash (free-tier eligible)
 * and there is NO fallback to any paid provider. Quota/auth/billing failures
 * stop the request with a clear message.
 */
import type { ParsedReceipt, PurchasedItem } from "../../../src/lib/receipt";

export const FREE_AI_MODEL_ID = "gemini-2.5-flash";
export const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${FREE_AI_MODEL_ID}:generateContent`;
export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

export const FREE_AI_RATE_LIMIT = { limit: 8, windowMs: 10 * 60_000 } as const;

export const FREE_AI_MESSAGES = {
  unconfigured: "A leitura com IA grátis ainda não está configurada no servidor.",
  unauthorized: "Sessão necessária para usar a leitura com IA grátis.",
  rateLimited: "Muitas leituras grátis seguidas. Aguarde alguns minutos e tente de novo.",
  quotaExceeded: "A cota gratuita de IA foi atingida no momento. Aguarde alguns minutos e tente de novo.",
  invalidApiKey: "A leitura com IA grátis não está configurada corretamente no servidor.",
  billingRequired: "O plano gratuito do Gemini não está disponível para esta chave. Nenhuma cobrança será feita; configure uma chave gratuita do Google AI Studio.",
  unavailable: "O serviço gratuito de IA está temporariamente indisponível. Tente novamente.",
  invalidImage: "Imagem inválida.",
  unreadable: "Não consegui entender esse comprovante.",
  unexpected: "Erro inesperado ao ler o comprovante com IA grátis.",
} as const;

export const PAYMENT_METHOD_ENUM = [
  "Pix",
  "Boleto",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Dinheiro",
  "Transferência",
  "Outro",
  "unknown",
] as const;

export const RECEIPT_TYPE_ENUM = ["income", "expense", "unknown"] as const;

export class FreeAiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FreeAiError";
    this.status = status;
  }
}

/**
 * Gemini responseSchema (subset). Optional fields are simply omitted from
 * `required`; the normalizer fills every missing value with null.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_receipt: { type: "BOOLEAN" },
    type: { type: "STRING", enum: [...RECEIPT_TYPE_ENUM] },
    amount: { type: "NUMBER" },
    date: { type: "STRING" },
    time: { type: "STRING" },
    counterparty: { type: "STRING" },
    institution: { type: "STRING" },
    payment_method: { type: "STRING", enum: [...PAYMENT_METHOD_ENUM] },
    category_hint: { type: "STRING" },
    receipt_id: { type: "STRING" },
    merchant_name: { type: "STRING" },
    tax_id: { type: "STRING" },
    fiscal_document_number: { type: "STRING" },
    card_brand: { type: "STRING" },
    card_last_four: { type: "STRING" },
    title: { type: "STRING" },
    notes: { type: "STRING" },
    purchased_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit_price: { type: "NUMBER" },
          total: { type: "NUMBER" },
        },
        required: ["name", "quantity", "unit_price", "total"],
      },
    },
    low_confidence_fields: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["is_receipt", "type", "payment_method", "purchased_items", "low_confidence_fields"],
} as const;

/** Fiscal prompt reused from the paid reader, extended with kg/discount/cancellation rules. */
export function buildFreeReceiptInstruction(
  categories: string[],
  accounts: string[],
  today: string,
): string {
  return [
    "Você lê comprovantes financeiros brasileiros (Pix, boleto pago, comprovante de compra no cartão, cupom/nota fiscal, comprovante bancário).",
    "Extraia os dados exatamente como aparecem na imagem. Nunca invente valores.",
    "Regras:",
    "- type: 'income' quando o dono do comprovante RECEBEU o dinheiro (Pix recebido, depósito); 'expense' quando ele PAGOU (Pix enviado, boleto pago, compra).",
    "- amount: número em reais, ponto como separador decimal (ex: 1234.56), sempre correspondente ao VALOR TOTAL EFETIVAMENTE PAGO (já com descontos/acréscimos). Para cupom use o 'Valor a Pagar'/'Total a Pagar', nunca a soma bruta dos itens quando houver desconto.",
    "- date: formato YYYY-MM-DD. Hoje é " + today + ".",
    "- title: nome curto da outra parte ou do estabelecimento.",
    "- receipt_id: ID da transação / código de autenticação / chave, se houver.",
    "- merchant_name: razão social completa do estabelecimento, quando impressa.",
    "- tax_id: CNPJ ou CPF do estabelecimento/recebedor, mantendo a formatação impressa.",
    "- fiscal_document_number: número da NFC-e, NF-e, cupom fiscal ou documento equivalente, sem incluir série ou chave de acesso.",
    "- card_brand e card_last_four: bandeira e os quatro últimos dígitos do cartão usado, quando houver.",
    "- payment_method: exatamente um de: Pix, Boleto, Cartão de Crédito, Cartão de Débito, Dinheiro, Transferência, Outro, unknown.",
    "- purchased_items: somente para cupom/nota fiscal, percorra toda a seção de produtos, do primeiro item até antes dos totais, e devolva UM OBJETO por linha de produto, na mesma ordem do documento.",
    "- Cada objeto tem: name (descrição impressa do produto, fielmente transcrita, com marca, sabor, peso e unidade quando houver), quantity (quantidade comprada), unit_price (preço unitário) e total (valor pago naquele item). Use null apenas quando o número realmente não estiver legível no documento.",
    "- Produtos vendidos por quilo: quantity em quilos com fração (ex: 1.246) e unit_price com o preço por quilo.",
    "- Itens cancelados ou devolvidos: inclua em purchased_items com total NEGATIVO e o sufixo ' (CANCELADO)' no name.",
    "- Descontos por item ou globais aparecem nos totais; não virem produtos separados. O amount final já deve refletir os descontos.",
    "- NUNCA resuma a lista. É proibido devolver algo como 'cupom com 11 itens' ou uma contagem: cada produto impresso deve virar um objeto próprio.",
    "- notes: apenas observações que NÃO sejam produtos (divergências de valor, itens cancelados, bandeira/final do cartão, parcelamento). Nunca coloque a lista nem a contagem de itens em notes.",
    "- Códigos de barras/PLU podem aparecer junto ao produto, mas não são produtos separados. Linhas de quantidade, preço unitário ou continuação pertencem ao produto imediatamente anterior/seguinte e devem ser combinadas em um único elemento.",
    "- Nunca trate CNPJ, endereço, operador, subtotal, desconto, acréscimo, total, tributos, troco ou forma de pagamento como produto. Para Pix, boleto e comprovantes bancários use [].",
    "- Se parte da lista de produtos estiver cortada, borrada ou duvidosa, inclua 'purchased_items' em low_confidence_fields; mantenha somente os itens realmente legíveis.",
    "- category_hint: escolha uma destas categorias quando fizer sentido: " + (categories.join(", ") || "nenhuma"),
    "- institution: banco/instituição do comprovante. Contas cadastradas do usuário: " + (accounts.join(", ") || "nenhuma"),
    "- low_confidence_fields: liste os campos que você não conseguiu ler com certeza.",
    "- is_receipt: false se a imagem não for um comprovante financeiro.",
    "Use null quando o dado não existir no documento.",
  ].join("\n");
}

export function parseImageDataUrl(imageDataUrl: string): { mimeType: string; base64: string } {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    throw new FreeAiError(400, FREE_AI_MESSAGES.invalidImage);
  }
  const comma = imageDataUrl.indexOf(",");
  if (comma < 0) throw new FreeAiError(400, FREE_AI_MESSAGES.invalidImage);
  const header = imageDataUrl.slice("data:".length, comma);
  const mimeType = (header.split(";")[0] || "image/jpeg").trim();
  const base64 = imageDataUrl.slice(comma + 1);
  if (!base64) throw new FreeAiError(400, FREE_AI_MESSAGES.invalidImage);
  return { mimeType, base64 };
}

export function mapGeminiHttpError(status: number, bodyText: string): FreeAiError {
  const body = (bodyText || "").toLowerCase();
  if (status === 429) {
    return new FreeAiError(429, FREE_AI_MESSAGES.quotaExceeded);
  }
  if (
    body.includes("api_key_invalid") ||
    body.includes("api key not valid") ||
    body.includes("api_key_invalid")
  ) {
    return new FreeAiError(503, FREE_AI_MESSAGES.invalidApiKey);
  }
  if (
    body.includes("billing") ||
    body.includes("free_tier") ||
    body.includes("free tier") ||
    body.includes("quota") && body.includes("billing")
  ) {
    return new FreeAiError(503, FREE_AI_MESSAGES.billingRequired);
  }
  if (status === 401 || status === 403) {
    return new FreeAiError(503, FREE_AI_MESSAGES.invalidApiKey);
  }
  if (status === 503 || status === 502 || status === 500) {
    return new FreeAiError(503, FREE_AI_MESSAGES.unavailable);
  }
  return new FreeAiError(502, FREE_AI_MESSAGES.unavailable);
}

export function extractGeminiText(payload: unknown): string {
  const candidates = (payload as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
  }
  let text = "";
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: unknown[] } })?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const partText = (part as { text?: unknown })?.text;
      if (typeof partText === "string") text += partText;
    }
  }
  if (!text.trim()) throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
  return text;
}

export function parseGeminiJsonText(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
  }
  return parsed as Record<string, unknown>;
}

const asNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asNullableNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(/\.(?=\d{3}\D)/g, "").replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const asEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  return fallback;
};

const asDateString = (value: unknown): string | null => {
  const text = asNullableString(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

function normalizePurchasedItems(value: unknown): PurchasedItem[] {
  if (!Array.isArray(value)) return [];
  const items: PurchasedItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const name = asNullableString((entry as { name?: unknown }).name);
    if (!name) continue;
    items.push({
      name,
      quantity: asNullableNumber((entry as { quantity?: unknown }).quantity),
      unit_price: asNullableNumber((entry as { unit_price?: unknown }).unit_price),
      total: asNullableNumber((entry as { total?: unknown }).total),
    });
  }
  return items;
}

/** Validates and coerces whatever the model returned into a full ParsedReceipt. */
export function normalizeGeminiReceipt(raw: Record<string, unknown>): ParsedReceipt {
  const purchased_items = normalizePurchasedItems(raw.purchased_items);
  const amount = asNullableNumber(raw.amount);
  const rawIsReceipt = raw.is_receipt;
  const is_receipt =
    typeof rawIsReceipt === "boolean"
      ? rawIsReceipt
      : amount !== null || purchased_items.length > 0;

  const lowConfidenceRaw = Array.isArray(raw.low_confidence_fields)
    ? raw.low_confidence_fields.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];

  return {
    is_receipt,
    type: asEnum(raw.type, RECEIPT_TYPE_ENUM, "unknown"),
    amount,
    date: asDateString(raw.date),
    time: asNullableString(raw.time),
    counterparty: asNullableString(raw.counterparty),
    institution: asNullableString(raw.institution),
    payment_method: asEnum(raw.payment_method, PAYMENT_METHOD_ENUM, "unknown"),
    category_hint: asNullableString(raw.category_hint),
    receipt_id: asNullableString(raw.receipt_id),
    merchant_name: asNullableString(raw.merchant_name),
    tax_id: asNullableString(raw.tax_id),
    fiscal_document_number: asNullableString(raw.fiscal_document_number),
    card_brand: asNullableString(raw.card_brand),
    card_last_four: asNullableString(raw.card_last_four),
    title: asNullableString(raw.title),
    notes: asNullableString(raw.notes),
    purchased_items,
    low_confidence_fields: lowConfidenceRaw,
  };
}

export interface GeminiRequestInput {
  apiKey: string;
  imageDataUrl: string;
  categories: string[];
  accounts: string[];
  fetchImpl?: typeof fetch;
  today?: string;
}

/** Calls Gemini free tier only. Throws FreeAiError on any HTTP failure. */
export async function requestGeminiReceipt(input: GeminiRequestInput): Promise<Record<string, unknown>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const { mimeType, base64 } = parseImageDataUrl(input.imageDataUrl);
  const today = input.today ?? new Date().toISOString().split("T")[0];
  const instruction = buildFreeReceiptInstruction(input.categories, input.accounts, today);

  let response: Response;
  try {
    response = await fetchImpl(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The key travels only in this header — never in the URL, never logged.
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: instruction },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    });
  } catch {
    throw new FreeAiError(503, FREE_AI_MESSAGES.unavailable);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw mapGeminiHttpError(response.status, bodyText);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
  }
  const text = extractGeminiText(payload);
  return parseGeminiJsonText(text);
}

/** Best-effort user identity from a Supabase JWT payload (platform verifies it upstream). */
export function decodeJwtSub(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
    );
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

export interface FreeAiRateBucket {
  timestamps: number[];
}

/** Sliding-window limiter; pure and clock-injectable for tests. */
export function checkFreeAiRateLimit(
  buckets: Map<string, FreeAiRateBucket>,
  userId: string,
  now: number,
  limit = FREE_AI_RATE_LIMIT.limit,
  windowMs = FREE_AI_RATE_LIMIT.windowMs,
): { allowed: boolean; retryAfterMs: number } {
  const cutoff = now - windowMs;
  const bucket = buckets.get(userId) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    buckets.set(userId, bucket);
    return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }
  bucket.timestamps.push(now);
  buckets.set(userId, bucket);
  return { allowed: true, retryAfterMs: 0 };
}

export const FREE_AI_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

/** ~8 MB of JSON (base64 image ~6 MB). */
export const FREE_AI_MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface FreeAiHandlerDeps {
  envGet: (name: string) => string | undefined;
  /** Verifies the access token and returns the user id, or null. Required; missing = reject all. */
  verifyUser?: (token: string) => Promise<string | null>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  rateBuckets?: Map<string, FreeAiRateBucket>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...FREE_AI_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Deno-free HTTP handler shared by the edge function and the unit tests. */
export function createFreeAiHandler(deps: FreeAiHandlerDeps) {
  const buckets = deps.rateBuckets ?? new Map<string, FreeAiRateBucket>();
  const now = deps.now ?? (() => Date.now());

  const authenticate = async (req: Request): Promise<string | null> => {
    const authorization = req.headers.get("Authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match || !deps.verifyUser) return null; // fail closed
    try {
      return await deps.verifyUser(match[1]);
    } catch {
      return null;
    }
  };

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: FREE_AI_CORS_HEADERS });
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return jsonResponse(405, { error: "Método não permitido." });
    }

    // Cryptographically verified user (Supabase Auth); never trust a self-declared sub.
    const userId = await authenticate(req);
    if (!userId) {
      return jsonResponse(401, { error: FREE_AI_MESSAGES.unauthorized });
    }

    if (req.method === "GET") {
      const available = Boolean(deps.envGet(GEMINI_API_KEY_ENV));
      return jsonResponse(200, { available });
    }

    const apiKey = deps.envGet(GEMINI_API_KEY_ENV);
    if (!apiKey) {
      return jsonResponse(503, { error: FREE_AI_MESSAGES.unconfigured });
    }

    // Per-instance limiter only (best effort, not global).
    const rate = checkFreeAiRateLimit(buckets, userId, now());
    if (!rate.allowed) {
      return jsonResponse(429, { error: FREE_AI_MESSAGES.rateLimited });
    }

    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > FREE_AI_MAX_BODY_BYTES) {
      return jsonResponse(413, { error: FREE_AI_MESSAGES.invalidImage });
    }

    let body: { imageDataUrl?: unknown; categories?: unknown; accounts?: unknown };
    try {
      const rawText = await req.text();
      if (rawText.length > FREE_AI_MAX_BODY_BYTES) {
        return jsonResponse(413, { error: FREE_AI_MESSAGES.invalidImage });
      }
      body = JSON.parse(rawText);
    } catch {
      return jsonResponse(400, { error: FREE_AI_MESSAGES.invalidImage });
    }
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.imageDataUrl !== "string" ||
      !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.imageDataUrl)
    ) {
      return jsonResponse(400, { error: FREE_AI_MESSAGES.invalidImage });
    }

    const sanitizeList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string").slice(0, 100)
        : [];

    try {
      const raw = await requestGeminiReceipt({
        apiKey,
        imageDataUrl: body.imageDataUrl,
        categories: sanitizeList(body.categories),
        accounts: sanitizeList(body.accounts),
        fetchImpl: deps.fetchImpl,
      });
      const parsed = normalizeGeminiReceipt(raw);
      return jsonResponse(200, parsed);
    } catch (error) {
      if (error instanceof FreeAiError) {
        return jsonResponse(error.status, { error: error.message });
      }
      return jsonResponse(500, { error: FREE_AI_MESSAGES.unexpected });
    }
  };
}
