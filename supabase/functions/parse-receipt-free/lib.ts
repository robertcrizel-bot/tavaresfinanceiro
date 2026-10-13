/**
 * Pure, Deno-free logic for the free receipt reader backed by Google Gemini.
 * The thin Deno glue lives in index.ts; everything here is unit-tested with
 * vitest.
 *
 * Billing honesty: pinning gemini-2.5-flash does NOT guarantee free tier.
 * The operator MUST use a Google project WITHOUT billing enabled. If Gemini
 * reports quota exhaustion or requires billing, the request STOPS here with a
 * clear message — there is NO fallback to any paid provider or model.
 *
 * Auth: GET and POST are verified against Supabase Auth via the injected
 * `verifyUser` (fail-closed: a token with a `sub` claim alone is NEVER
 * trusted; a missing verifier rejects everything).
 *
 * Rate limiting: the in-memory sliding window is PROVISIONAL best-effort per
 * instance (Edge isolates do not share memory). It is not a durable control
 * plane; the real backstops are the no-billing project key and Gemini's own
 * free-quota enforcement (429 stops the reading).
 */
import type { ParsedReceipt, PurchasedItem } from "./types.ts";

export const FREE_AI_MODEL_ID = "gemini-2.5-flash";
export const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${FREE_AI_MODEL_ID}:generateContent`;
export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

/**
 * Cleans the stored secret before use. Paste artifacts (surrounding quotes,
 * whitespace, newlines) must never reach the x-goog-api-key header: a newline
 * makes fetch throw before any Google response, which surfaces as a generic
 * outage instead of a configuration error.
 */
export function normalizeGeminiApiKey(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  let key = raw.replace(/^\uFEFF/, "").trim();
  if (
    key.length >= 2 &&
    ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

export const FREE_AI_RATE_LIMIT = { limit: 8, windowMs: 10 * 60_000 } as const;

/** Image hard limits (decoded bytes). Client compresses to JPEG before sending. */
export const FREE_AI_IMAGE = {
  maxDecodedBytes: 5 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
} as const;

export const FREE_AI_LIST_LIMITS = { maxEntries: 50, maxEntryLength: 200 } as const;

export const FREE_AI_MESSAGES = {
  unconfigured: "A leitura com IA grátis ainda não está configurada no servidor.",
  unauthorized: "Sessão inválida ou ausente para usar a leitura com IA grátis.",
  rateLimited: "Muitas leituras grátis seguidas. Aguarde alguns minutos e tente de novo.",
  quotaExceeded: "A cota gratuita de IA foi atingida no momento. Aguarde alguns minutos e tente de novo.",
  invalidApiKey: "A leitura com IA grátis não está configurada corretamente no servidor.",
  billingRequired: "O plano gratuito do Gemini não está disponível para esta chave. Nenhuma cobrança será feita; configure uma chave de um projeto Google SEM faturamento.",
  apiDisabled: "A API do Gemini não está habilitada no projeto Google desta chave. Habilite a Generative Language API SEM ativar faturamento.",
  invalidRequest: "O Gemini recusou a requisição de leitura (erro de configuração no servidor). Tente mais tarde ou contate o suporte.",
  modelUnavailable: "O modelo de IA grátis não está disponível para esta configuração do servidor. Verifique a chave (projeto Google sem faturamento).",
  unavailable: "O serviço gratuito de IA está temporariamente indisponível. Tente novamente.",
  invalidImage: "Imagem inválida.",
  invalidImageType: "Tipo de imagem não suportado. Envie JPEG, PNG, WebP ou HEIC.",
  imageTooLarge: "Imagem muito grande para a leitura grátis. Envie uma foto menor (até 5 MB).",
  unreadable: "Não consegui entender esse comprovante.",
  blockedBySafety: "O Gemini bloqueou essa imagem pela política de segurança do serviço.",
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

/** Safe-to-log facts about a Gemini HTTP failure (never contains the key, image or receipt data). */
export interface GeminiErrorInfo {
  httpStatus: number;
  googleStatus?: string;
  googleCode?: number;
  googleMessage?: string;
}

export class FreeAiError extends Error {
  status: number;
  diagnostic?: GeminiErrorInfo;
  constructor(status: number, message: string, diagnostic?: GeminiErrorInfo) {
    super(message);
    this.name = "FreeAiError";
    this.status = status;
    if (diagnostic) this.diagnostic = diagnostic;
  }
}

/** Strips API keys and heavy whitespace from Google error messages before logging. */
export function sanitizeGoogleMessage(message: unknown): string | undefined {
  if (typeof message !== "string" || !message.trim()) return undefined;
  const cleaned = message
    .replace(/AIza[0-9A-Za-z_-]{35}/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return cleaned || undefined;
}

/** Parses the Google error JSON body into safe diagnostic fields. */
export function extractGeminiErrorInfo(httpStatus: number, bodyText: string): GeminiErrorInfo {
  const info: GeminiErrorInfo = { httpStatus };
  try {
    const parsed = JSON.parse(bodyText || "") as {
      error?: { status?: unknown; code?: unknown; message?: unknown };
    };
    const err = parsed?.error;
    if (err && typeof err === "object") {
      if (typeof err.status === "string") info.googleStatus = err.status.slice(0, 64);
      if (typeof err.code === "number" && Number.isFinite(err.code)) info.googleCode = err.code;
      const message = sanitizeGoogleMessage(err.message);
      if (message) info.googleMessage = message;
    }
  } catch {
    // Non-JSON body: keep httpStatus only.
  }
  return info;
}

/** Structured backend diagnostic — safe fields only, injectable for tests. */
export type FreeAiLogger = (entry: Record<string, unknown>) => void;

export const defaultFreeAiLogger: FreeAiLogger = (entry) => {
  try {
    console.warn("[parse-receipt-free]", JSON.stringify(entry));
  } catch {
    // Logging must never break the request.
  }
};

/**
 * Gemini responseSchema (subset). Numeric fields are explicitly nullable so
 * the model reports "not legible" as null instead of inventing values; the
 * normalizer still fills every missing value with null.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_receipt: { type: "BOOLEAN" },
    type: { type: "STRING", enum: [...RECEIPT_TYPE_ENUM] },
    amount: { type: "NUMBER", nullable: true },
    date: { type: "STRING", nullable: true },
    time: { type: "STRING", nullable: true },
    counterparty: { type: "STRING", nullable: true },
    institution: { type: "STRING", nullable: true },
    payment_method: { type: "STRING", enum: [...PAYMENT_METHOD_ENUM] },
    category_hint: { type: "STRING", nullable: true },
    receipt_id: { type: "STRING", nullable: true },
    merchant_name: { type: "STRING", nullable: true },
    tax_id: { type: "STRING", nullable: true },
    fiscal_document_number: { type: "STRING", nullable: true },
    card_brand: { type: "STRING", nullable: true },
    card_last_four: { type: "STRING", nullable: true },
    title: { type: "STRING", nullable: true },
    notes: { type: "STRING", nullable: true },
    purchased_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER", nullable: true },
          unit_price: { type: "NUMBER", nullable: true },
          total: { type: "NUMBER", nullable: true },
        },
        required: ["name"],
      },
    },
    low_confidence_fields: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["is_receipt", "type", "payment_method"],
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
    "- Cada objeto tem: name (descrição impressa do produto, fielmente transcrita, com marca, sabor, peso e unidade quando houver), quantity (quantidade comprada), unit_price (preço unitário) e total (valor pago naquele item). Use null (não um número inventado) quando um desses valores realmente não estiver legível no documento.",
    "- Produtos vendidos por quilo: quantity em quilos com fração (ex: 1.246) e unit_price com o preço por quilo.",
    "- Itens cancelados ou devolvidos: inclua em purchased_items com total NEGATIVO e o sufixo ' (CANCELADO)' no name. Se o valor cancelado não estiver legível, use total null e ainda assim marque o sufixo.",
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

export function parseImageDataUrl(
  imageDataUrl: string,
  limits: { maxDecodedBytes: number; allowedMimeTypes: readonly string[] } = FREE_AI_IMAGE,
): { mimeType: string; base64: string } {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    throw new FreeAiError(400, FREE_AI_MESSAGES.invalidImage);
  }
  const comma = imageDataUrl.indexOf(",");
  if (comma < 0) throw new FreeAiError(400, FREE_AI_MESSAGES.invalidImage);
  const header = imageDataUrl.slice("data:".length, comma);
  const mimeType = (header.split(";")[0] || "image/jpeg").trim().toLowerCase();
  if (!limits.allowedMimeTypes.includes(mimeType)) {
    throw new FreeAiError(415, FREE_AI_MESSAGES.invalidImageType);
  }
  const base64 = imageDataUrl.slice(comma + 1);
  if (!base64) throw new FreeAiError(400, FREE_AI_MESSAGES.invalidImage);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new FreeAiError(400, FREE_AI_MESSAGES.invalidImage);
  }
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const decodedBytes = Math.floor((base64.length * 3) / 4) - padding;
  if (decodedBytes > limits.maxDecodedBytes) {
    throw new FreeAiError(413, FREE_AI_MESSAGES.imageTooLarge);
  }
  return { mimeType, base64 };
}

/**
 * Maps a Gemini HTTP failure to a user-safe FreeAiError, preserving the
 * precise cause (request/schema, model, auth, quota, outage) instead of a
 * single generic message. The original status/code travels in
 * `error.diagnostic` for backend logs only.
 */
export function mapGeminiHttpError(status: number, bodyText: string): FreeAiError {
  const diagnostic = extractGeminiErrorInfo(status, bodyText);
  const body = (bodyText || "").toLowerCase();
  const fail = (clientStatus: number, message: string): FreeAiError =>
    new FreeAiError(clientStatus, message, diagnostic);

  // API_KEY_INVALID often arrives as HTTP 400 — check the message before the generic 400 branch.
  if (
    body.includes("api_key_invalid") ||
    body.includes("api key not valid") ||
    diagnostic.googleStatus === "API_KEY_INVALID"
  ) {
    return fail(503, FREE_AI_MESSAGES.invalidApiKey);
  }
  // Billing / free-tier gating (project has billing, or free tier unavailable for the key).
  if (
    body.includes("billing") ||
    body.includes("free_tier") ||
    body.includes("free tier") ||
    (diagnostic.googleStatus === "FAILED_PRECONDITION" && body.includes("billing"))
  ) {
    return fail(503, FREE_AI_MESSAGES.billingRequired);
  }
  // Generative Language API not enabled / permission denied (typical first-setup failure).
  if (
    status === 403 &&
    (body.includes("has not been used") ||
      body.includes("is disabled") ||
      body.includes("permission_denied") ||
      diagnostic.googleStatus === "PERMISSION_DENIED")
  ) {
    return fail(503, FREE_AI_MESSAGES.apiDisabled);
  }
  if (status === 429) return fail(429, FREE_AI_MESSAGES.quotaExceeded);
  if (status === 401 || status === 403) return fail(503, FREE_AI_MESSAGES.invalidApiKey);
  // 400: our request/schema was rejected — a server-side configuration problem.
  if (status === 400) return fail(503, FREE_AI_MESSAGES.invalidRequest);
  // 404: the model id is not available for this key/project.
  if (status === 404) return fail(503, FREE_AI_MESSAGES.modelUnavailable);
  // Real upstream unavailability (including timeouts).
  if (status === 408 || (status >= 500 && status <= 599)) {
    return fail(503, FREE_AI_MESSAGES.unavailable);
  }
  return fail(502, FREE_AI_MESSAGES.unavailable);
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
      // Skip hidden thinking segments — only the answer text is the JSON payload.
      if ((part as { thought?: unknown }).thought === true) continue;
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
  imageLimits?: { maxDecodedBytes: number; allowedMimeTypes: readonly string[] };
  log?: FreeAiLogger;
}

/** Calls Gemini. Throws FreeAiError on any HTTP failure. Never falls back to a paid model. */
export async function requestGeminiReceipt(input: GeminiRequestInput): Promise<Record<string, unknown>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const log = input.log ?? defaultFreeAiLogger;
  const { mimeType, base64 } = parseImageDataUrl(input.imageDataUrl, input.imageLimits);
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
          // Thinking off: keeps the free call fast and inside edge-function /
          // gateway timeouts (a timeout surfaces as a generic outage).
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (networkError) {
    log({
      scope: "gemini-network",
      errorName: networkError instanceof Error ? networkError.name : "unknown",
    });
    throw new FreeAiError(503, FREE_AI_MESSAGES.unavailable);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const mapped = mapGeminiHttpError(response.status, bodyText);
    // Safe backend diagnostic: HTTP status + Google status/code/message only.
    log({
      scope: "gemini-http",
      httpStatus: mapped.diagnostic?.httpStatus ?? response.status,
      googleStatus: mapped.diagnostic?.googleStatus,
      googleCode: mapped.diagnostic?.googleCode,
      googleMessage: mapped.diagnostic?.googleMessage,
      mappedStatus: mapped.status,
    });
    throw mapped;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    log({ scope: "gemini-response", httpStatus: response.status, reason: "invalid-json" });
    throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
  }

  // Safety refusal (no candidates + promptFeedback.blockReason) — distinct cause.
  const blockReason = (payload as { promptFeedback?: { blockReason?: unknown } })?.promptFeedback?.blockReason;
  if (typeof blockReason === "string" && blockReason) {
    log({ scope: "gemini-response", httpStatus: response.status, blockReason: blockReason.slice(0, 64) });
    throw new FreeAiError(422, FREE_AI_MESSAGES.blockedBySafety);
  }

  const text = extractGeminiText(payload);
  return parseGeminiJsonText(text);
}

export interface FreeAiRateBucket {
  timestamps: number[];
}

/**
 * Sliding-window limiter; pure and clock-injectable for tests.
 *
 * PROVISIONAL: this bucket map lives in a single isolate's memory. Edge
 * isolates do not share it, so it is best-effort anti-spam only — NOT a
 * durable per-user quota across instances or restarts. Durable protection
 * comes from (1) mandatory Supabase Auth, (2) a Google project key WITHOUT
 * billing, and (3) Gemini's own free-quota 429s, which halt the reading.
 */
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
  /** Overrides for image validation (defaults to FREE_AI_IMAGE). */
  imageLimits?: { maxDecodedBytes: number; allowedMimeTypes: readonly string[] };
  /** Safe backend diagnostics sink (defaults to console.warn). */
  log?: FreeAiLogger;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...FREE_AI_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/**
 * Short correlation id shared by server logs and the error body. Lets the
 * operator (and, via the app, the user) relate an on-screen failure to the
 * exact backend log entry without exposing anything sensitive.
 */
export function newRequestId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/** Deno-free HTTP handler shared by the edge function and the unit tests. */
export function createFreeAiHandler(deps: FreeAiHandlerDeps) {
  const buckets = deps.rateBuckets ?? new Map<string, FreeAiRateBucket>();
  const now = deps.now ?? (() => Date.now());
  const imageLimits = deps.imageLimits ?? FREE_AI_IMAGE;
  const log = deps.log ?? defaultFreeAiLogger;

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
      const available = Boolean(normalizeGeminiApiKey(deps.envGet(GEMINI_API_KEY_ENV)));
      return jsonResponse(200, { available });
    }

    const apiKey = normalizeGeminiApiKey(deps.envGet(GEMINI_API_KEY_ENV));
    if (!apiKey) {
      return jsonResponse(503, { error: FREE_AI_MESSAGES.unconfigured });
    }

    // Per-instance limiter only (best effort, not global).
    const rate = checkFreeAiRateLimit(buckets, userId, now());
    if (!rate.allowed) {
      return jsonResponse(429, {
        error: FREE_AI_MESSAGES.rateLimited,
        retryAfterSeconds: Math.ceil(rate.retryAfterMs / 1000),
      });
    }

    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > FREE_AI_MAX_BODY_BYTES) {
      return jsonResponse(413, { error: FREE_AI_MESSAGES.imageTooLarge });
    }

    let body: { imageDataUrl?: unknown; categories?: unknown; accounts?: unknown };
    try {
      const rawText = await req.text();
      if (rawText.length > FREE_AI_MAX_BODY_BYTES) {
        return jsonResponse(413, { error: FREE_AI_MESSAGES.imageTooLarge });
      }
      body = JSON.parse(rawText);
    } catch {
      return jsonResponse(400, { error: FREE_AI_MESSAGES.invalidImage });
    }
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.imageDataUrl !== "string" ||
      !body.imageDataUrl.startsWith("data:image/")
    ) {
      return jsonResponse(400, { error: FREE_AI_MESSAGES.invalidImage });
    }

    const sanitizeList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.slice(0, FREE_AI_LIST_LIMITS.maxEntryLength))
            .slice(0, FREE_AI_LIST_LIMITS.maxEntries)
        : [];

    const requestId = newRequestId();
    const scopedLog: FreeAiLogger = (entry) => log({ requestId, ...entry });

    try {
      const raw = await requestGeminiReceipt({
        apiKey,
        imageDataUrl: body.imageDataUrl,
        categories: sanitizeList(body.categories),
        accounts: sanitizeList(body.accounts),
        fetchImpl: deps.fetchImpl,
        imageLimits,
        log: scopedLog,
      });
      const parsed = normalizeGeminiReceipt(raw);
      return jsonResponse(200, parsed);
    } catch (error) {
      if (error instanceof FreeAiError) {
        return jsonResponse(error.status, { error: error.message, requestId });
      }
      log({ scope: "handler", requestId, reason: "unexpected" });
      return jsonResponse(500, { error: FREE_AI_MESSAGES.unexpected, requestId });
    }
  };
}
