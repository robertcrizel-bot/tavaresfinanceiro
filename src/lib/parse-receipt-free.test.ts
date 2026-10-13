import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FREE_AI_IMAGE,
  FREE_AI_MESSAGES,
  FREE_AI_MODEL_ID,
  GEMINI_API_URL,
  GEMINI_RESPONSE_SCHEMA,
  buildFreeReceiptInstruction,
  createFreeAiHandler,
  extractGeminiErrorInfo,
  mapGeminiHttpError,
  normalizeGeminiReceipt,
  parseImageDataUrl,
  sanitizeGoogleMessage,
  type FreeAiHandlerDeps,
} from "../../supabase/functions/parse-receipt-free/lib";

const API_KEY = "gemini-free-key-abc123";
const IMAGE_DATA_URL = "data:image/jpeg;base64,Y29ycmVjdGVk";

/** Simulated Supabase Auth: only tokens minted by the auth server resolve. */
const MINTED_TOKENS = new Map<string, string>([
  ["tok-user-1", "user-1"],
  ["tok-user-2", "user-2"],
]);
async function fakeVerifyUser(token: string): Promise<string | null> {
  return MINTED_TOKENS.get(token) ?? null;
}

function authHeader(sub = "user-1") {
  const token = [...MINTED_TOKENS.entries()].find(([, id]) => id === sub)?.[0] ?? "tok-user-1";
  return `Bearer ${token}`;
}

function geminiJsonResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function fullGeminiPayload() {
  return {
    is_receipt: true,
    type: "expense",
    amount: 92.58,
    date: "2026-10-12",
    time: "19:42:11",
    counterparty: null,
    institution: null,
    payment_method: "Pix",
    category_hint: "Alimentação",
    receipt_id: "E12345678901234567890",
    merchant_name: "MERCADO TRADICAO LTDA",
    tax_id: "12.345.678/0001-90",
    fiscal_document_number: "55111",
    card_brand: null,
    card_last_four: null,
    title: "Mercado Tradição",
    notes: "Item cancelado conforme cupom.",
    purchased_items: [
      { name: "PAO FRANCES Kg", quantity: 0.274, unit_price: 21.99, total: 6.03 },
      { name: "QUEIJO MINAS Kg", quantity: 0.4, unit_price: 49.9, total: 19.96 },
      { name: "REFRIGERANTE 2L (CANCELADO)", quantity: 1, unit_price: 8.99, total: -8.99 },
    ],
    low_confidence_fields: [],
  };
}

function makeHandler(overrides: Partial<FreeAiHandlerDeps> = {}, env: Record<string, string | undefined> = { GEMINI_API_KEY: API_KEY }) {
  const deps: FreeAiHandlerDeps = {
    envGet: (name) => env[name],
    verifyUser: fakeVerifyUser,
    log: () => undefined,
    ...overrides,
  };
  return createFreeAiHandler(deps);
}

function postRequest(body: unknown, headers: Record<string, string> = { Authorization: authHeader() }) {
  return new Request("https://example.test/parse-receipt-free", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(headers: Record<string, string> = { Authorization: authHeader() }) {
  return new Request("https://example.test/parse-receipt-free", { method: "GET", headers });
}

const validBody = { imageDataUrl: IMAGE_DATA_URL, categories: ["Alimentação"], accounts: [] };

describe("parse-receipt-free handler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports availability on GET for authenticated users without exposing the API key", async () => {
    const handler = makeHandler();
    const response = await handler(getRequest());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ available: true });
    expect(body).not.toContain(API_KEY);

    const disabled = makeHandler({}, {});
    const off = await disabled(getRequest());
    expect(await off.json()).toEqual({ available: false });
  });

  it("rejects GET without a token (status is not public)", async () => {
    const handler = makeHandler();
    const response = await handler(getRequest({}));
    expect(response.status).toBe(401);
  });

  it("answers OPTIONS with CORS headers", async () => {
    const handler = makeHandler();
    const response = await handler(new Request("https://example.test/parse-receipt-free", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects POST without an Authorization header", async () => {
    const handler = makeHandler();
    const response = await handler(postRequest(validBody, {}));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.unauthorized);
  });

  it("rejects forged tokens the auth server does not recognize (a self-decoded sub is never trusted)", async () => {
    const handler = makeHandler();
    const forgedJwt = "Bearer header.eyJzdWIiOiJ4In0.forged";
    const forged = await handler(postRequest(validBody, { Authorization: forgedJwt }));
    expect(forged.status).toBe(401);
    expect((await forged.json()).error).toBe(FREE_AI_MESSAGES.unauthorized);

    const garbage = await handler(postRequest(validBody, { Authorization: "Bearer <script>alert(1)</script>" }));
    expect(garbage.status).toBe(401);
  });

  it("fails closed when no verifier is configured and never reaches Gemini", async () => {
    const fetchImpl = vi.fn();
    const handler = makeHandler({ verifyUser: undefined, fetchImpl });
    expect((await handler(postRequest(validBody))).status).toBe(401);
    expect((await handler(getRequest())).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects when the auth verifier throws and never reaches Gemini", async () => {
    const fetchImpl = vi.fn();
    const handler = makeHandler({
      fetchImpl,
      verifyUser: async () => { throw new Error("auth server down"); },
    });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 503 when GEMINI_API_KEY is not configured and never calls Gemini", async () => {
    const fetchImpl = vi.fn();
    const handler = makeHandler({ fetchImpl }, {});
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.unconfigured);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects payloads without a data:image URL", async () => {
    const handler = makeHandler();
    const missing = await handler(postRequest({ categories: [] }));
    expect(missing.status).toBe(400);
    const wrongType = await handler(postRequest({ imageDataUrl: "https://example.test/x.jpg" }));
    expect(wrongType.status).toBe(400);
  });

  it("rejects unsupported image mime types and oversized images before calling Gemini", async () => {
    const fetchImpl = vi.fn();
    const handler = makeHandler({ fetchImpl });

    const badType = await handler(postRequest({ imageDataUrl: "data:image/svg+xml;base64,YQ==" }));
    expect(badType.status).toBe(415);
    expect((await badType.json()).error).toBe(FREE_AI_MESSAGES.invalidImageType);

    const oversize = await handler(
      postRequest({ imageDataUrl: `data:image/jpeg;base64,${"A".repeat(FREE_AI_IMAGE.maxDecodedBytes * 2)}` }),
    );
    expect(oversize.status).toBe(413);
    expect((await oversize.json()).error).toBe(FREE_AI_MESSAGES.imageTooLarge);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects request bodies larger than the hard cap (content-length and actual)", async () => {
    const fetchImpl = vi.fn();
    const handler = makeHandler({ fetchImpl });
    const huge = `{"imageDataUrl":"data:image/jpeg;base64,${"A".repeat(9 * 1024 * 1024)}"}`;
    const response = await handler(postRequest(huge));
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.imageTooLarge);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("truncates categories/accounts lists and entries instead of forwarding anything", async () => {
    const fetchImpl = vi.fn(async () => geminiJsonResponse(JSON.stringify(fullGeminiPayload())));
    const handler = makeHandler({ fetchImpl });
    const longEntry = "x".repeat(500);
    const response = await handler(
      postRequest({
        ...validBody,
        categories: Array.from({ length: 200 }, () => longEntry),
        accounts: [1, 2, 3, longEntry],
      }),
    );
    expect(response.status).toBe(200);
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    const instruction = requestBody.contents[0].parts[0].text as string;
    expect(instruction.length).toBeLessThan(60_000);
    expect(instruction).not.toContain("x".repeat(201));
  });

  it("converts a valid Gemini response into a full ParsedReceipt without leaking the key", async () => {
    const fetchImpl = vi.fn(async () => geminiJsonResponse(JSON.stringify(fullGeminiPayload())));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));

    expect(response.status).toBe(200);
    const parsed = await response.json();
    expect(parsed).toMatchObject({
      is_receipt: true,
      type: "expense",
      amount: 92.58,
      date: "2026-10-12",
      payment_method: "Pix",
      merchant_name: "MERCADO TRADICAO LTDA",
      fiscal_document_number: "55111",
      title: "Mercado Tradição",
    });
    expect(parsed.purchased_items).toEqual([
      { name: "PAO FRANCES Kg", quantity: 0.274, unit_price: 21.99, total: 6.03 },
      { name: "QUEIJO MINAS Kg", quantity: 0.4, unit_price: 49.9, total: 19.96 },
      { name: "REFRIGERANTE 2L (CANCELADO)", quantity: 1, unit_price: 8.99, total: -8.99 },
    ]);

    // Request went only to the official Gemini endpoint with the key in a header.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GEMINI_API_URL);
    expect(url).not.toContain(API_KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(API_KEY);
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.contents[0].parts[0].text).toContain("quilo");
    expect(requestBody.contents[0].parts[0].text).toContain("CANCELADO");
    expect(requestBody.contents[0].parts[0].text).toContain("VALOR TOTAL EFETIVAMENTE PAGO");
    expect(requestBody.generationConfig.responseSchema).toBeTruthy();

    // The response body never contains the API key.
    const rawBody = JSON.stringify(parsed);
    expect(rawBody).not.toContain(API_KEY);
  });

  it("fills missing fields with nulls when the model returns incomplete JSON", async () => {
    const fetchImpl = vi.fn(async () => geminiJsonResponse('{"is_receipt":true,"type":"expense","amount":10.5}'));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(200);
    const parsed = await response.json();
    expect(parsed.amount).toBe(10.5);
    expect(parsed.payment_method).toBe("unknown");
    expect(parsed.date).toBeNull();
    expect(parsed.merchant_name).toBeNull();
    expect(parsed.purchased_items).toEqual([]);
    expect(parsed.low_confidence_fields).toEqual([]);
  });

  it("maps free-quota exhaustion (429) to a clear message without any paid fallback", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }), { status: 429 }));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.quotaExceeded);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0][0] as string)).toBe(GEMINI_API_URL);
  });

  it("maps Gemini auth failures to a configuration error without leaking the key", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key." } }), { status: 400 }));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body).error).toBe(FREE_AI_MESSAGES.invalidApiKey);
    expect(body).not.toContain(API_KEY);
  });

  it("refuses to continue when billing would be required, without charging anything", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 403, message: "Billing account required for this model." } }), { status: 403 }));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.billingRequired);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when the model output cannot be understood", async () => {
    const fetchImpl = vi.fn(async () => geminiJsonResponse("desculpe, não consegui ler isso"));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.unreadable);
  });

  it("enforces the provisional per-user sliding-window rate limit", async () => {
    let clock = 1_000_000;
    const fetchImpl = vi.fn(async () => geminiJsonResponse(JSON.stringify(fullGeminiPayload())));
    const handler = makeHandler({ fetchImpl, now: () => clock });
    for (let i = 0; i < 8; i += 1) {
      const ok = await handler(postRequest(validBody));
      expect(ok.status).toBe(200);
    }
    const blocked = await handler(postRequest(validBody));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe(FREE_AI_MESSAGES.rateLimited);

    clock += 11 * 60_000;
    const afterWindow = await handler(postRequest(validBody));
    expect(afterWindow.status).toBe(200);
  });

  it("rate-limits different authenticated users independently", async () => {
    const fetchImpl = vi.fn(async () => geminiJsonResponse(JSON.stringify(fullGeminiPayload())));
    const handler = makeHandler({ fetchImpl });
    for (let i = 0; i < 8; i += 1) {
      expect((await handler(postRequest(validBody))).status).toBe(200);
    }
    const other = await handler(postRequest(validBody, { Authorization: authHeader("user-2") }));
    expect(other.status).toBe(200);
  });

  it("surfaces transient Gemini outages as a retryable message", async () => {
    const fetchImpl = vi.fn(async () => new Response("upstream", { status: 503 }));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.unavailable);
  });

  it("maps a Gemini HTTP 400 (invalid request/schema) to a distinct config error, not the generic outage", async () => {
    const logs: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid JSON payload received." } }),
        { status: 400 },
      ));
    const handler = makeHandler({ fetchImpl, log: (entry) => logs.push(entry) });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe(FREE_AI_MESSAGES.invalidRequest);
    expect(body.error).not.toBe(FREE_AI_MESSAGES.unavailable);
    expect(logs).toEqual([
      {
        scope: "gemini-http",
        httpStatus: 400,
        googleStatus: "INVALID_ARGUMENT",
        googleCode: 400,
        googleMessage: "Invalid JSON payload received.",
        mappedStatus: 503,
      },
    ]);
  });

  it("maps a Gemini HTTP 404 (model unavailable) to a configuration error", async () => {
    const logs: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "models/gemini-2.5-flash is not found." } }),
        { status: 404 },
      ));
    const handler = makeHandler({ fetchImpl, log: (entry) => logs.push(entry) });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.modelUnavailable);
    expect(logs[0].googleStatus).toBe("NOT_FOUND");
  });

  it("maps HTTP 403 with 'API not enabled' to the enable-API message", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            message: "Generative Language API has not been used in project 123456 or it is disabled.",
          },
        }),
        { status: 403 },
      ));
    const handler = makeHandler({ fetchImpl });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.apiDisabled);
  });

  it("maps plain HTTP 401/403 to the key configuration error", async () => {
    const make = (status: number) => vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: status, message: "denied" } }), { status }));
    const handler401 = makeHandler({ fetchImpl: make(401) });
    expect((await (await handler401(postRequest(validBody))).json()).error).toBe(FREE_AI_MESSAGES.invalidApiKey);
    const handler403 = makeHandler({ fetchImpl: make(403) });
    expect((await (await handler403(postRequest(validBody))).json()).error).toBe(FREE_AI_MESSAGES.invalidApiKey);
  });

  it("keeps 500/504 as the real transient outage message", async () => {
    for (const status of [500, 504]) {
      const fetchImpl = vi.fn(async () => new Response("oops", { status }));
      const handler = makeHandler({ fetchImpl });
      const response = await handler(postRequest(validBody));
      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe(FREE_AI_MESSAGES.unavailable);
    }
  });

  it("maps network failures to the outage message and logs the error name only", async () => {
    const logs: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const handler = makeHandler({ fetchImpl, log: (entry) => logs.push(entry) });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.unavailable);
    expect(logs).toEqual([{ scope: "gemini-network", errorName: "TypeError" }]);
  });

  it("redacts API keys from Google messages in diagnostics and never logs the image", async () => {
    const logs: Record<string, unknown>[] = [];
    const leakedKey = "AIzaSyA-1234567890abcdefghijkmnopqrstuv";
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: `Bad key ${leakedKey} supplied` } }),
        { status: 400 },
      ));
    const handler = makeHandler({ fetchImpl, log: (entry) => logs.push(entry) });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(503);
    const rawLog = JSON.stringify(logs);
    expect(rawLog).not.toContain(leakedKey);
    expect(rawLog).toContain("[REDACTED]");
    expect(rawLog).not.toContain("Y29ycmVjdGVk"); // never the image payload
    expect(rawLog).not.toContain(API_KEY);
  });

  it("maps Gemini safety refusals (promptFeedback.blockReason) to a specific message", async () => {
    const logs: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] }), { status: 200 }));
    const handler = makeHandler({ fetchImpl, log: (entry) => logs.push(entry) });
    const response = await handler(postRequest(validBody));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.blockedBySafety);
    expect(logs[0]).toMatchObject({ scope: "gemini-response", blockReason: "SAFETY" });
  });

  it("sends a Gemini-compatible wire payload (nullable schema, inline_data, x-goog-api-key)", async () => {
    const fetchImpl = vi.fn(async () => geminiJsonResponse(JSON.stringify(fullGeminiPayload())));
    const handler = makeHandler({ fetchImpl });
    await handler(postRequest(validBody));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GEMINI_API_URL);
    const wire = JSON.parse(String(init.body));
    expect(wire.generationConfig.responseMimeType).toBe("application/json");
    expect(wire.generationConfig.responseSchema.properties.amount.nullable).toBe(true);
    expect(wire.generationConfig.responseSchema.properties.purchased_items.items.properties.quantity.nullable).toBe(true);
    expect(wire.contents[0].parts[1].inline_data.mime_type).toBe("image/jpeg");
    expect(wire.contents[0].parts[1].inline_data.data).toBe("Y29ycmVjdGVk");
  });
});

describe("mapGeminiHttpError / diagnostics helpers", () => {
  it("prefers Google status codes over naive status mapping", () => {
    expect(mapGeminiHttpError(400, '{"error":{"status":"API_KEY_INVALID","message":"x"}}').message)
      .toBe(FREE_AI_MESSAGES.invalidApiKey);
    expect(mapGeminiHttpError(403, '{"error":{"status":"FAILED_PRECONDITION","message":"billing required"}}').message)
      .toBe(FREE_AI_MESSAGES.billingRequired);
    expect(mapGeminiHttpError(429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"quota"}}').status)
      .toBe(429);
    expect(mapGeminiHttpError(404, "").message).toBe(FREE_AI_MESSAGES.modelUnavailable);
    expect(mapGeminiHttpError(400, "").message).toBe(FREE_AI_MESSAGES.invalidRequest);
  });

  it("attaches safe diagnostics to every mapped error", () => {
    const mapped = mapGeminiHttpError(400, '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"nope"}}');
    expect(mapped.diagnostic).toEqual({
      httpStatus: 400,
      googleStatus: "INVALID_ARGUMENT",
      googleCode: 400,
      googleMessage: "nope",
    });
    const nonJson = mapGeminiHttpError(502, "<html>bad gateway</html>");
    expect(nonJson.diagnostic).toEqual({ httpStatus: 502 });
  });

  it("sanitizes keys and truncates long Google messages", () => {
    expect(sanitizeGoogleMessage(`key AIzaSyA-1234567890abcdefghijkmnopqrstuv here`)).toBe("key [REDACTED] here");
    expect(sanitizeGoogleMessage("x".repeat(500))?.length).toBe(240);
    expect(sanitizeGoogleMessage(42)).toBeUndefined();
    expect(sanitizeGoogleMessage("   ")).toBeUndefined();
    expect(extractGeminiErrorInfo(500, "not json").httpStatus).toBe(500);
  });
});

describe("parseImageDataUrl", () => {
  it("accepts the supported image types produced by the client pipeline", () => {
    expect(parseImageDataUrl(IMAGE_DATA_URL).mimeType).toBe("image/jpeg");
    expect(parseImageDataUrl("data:image/png;base64,YQ==").mimeType).toBe("image/png");
    expect(parseImageDataUrl("data:image/WEBP;base64,YQ==").mimeType).toBe("image/webp");
  });

  it("rejects unsupported types, malformed base64 and oversized payloads", () => {
    expect(() => parseImageDataUrl("data:image/tiff;base64,YQ==")).toThrow(FREE_AI_MESSAGES.invalidImageType);
    expect(() => parseImageDataUrl("data:image/jpeg;base64,!!!")).toThrow(FREE_AI_MESSAGES.invalidImage);
    const big = `data:image/jpeg;base64,${"A".repeat(FREE_AI_IMAGE.maxDecodedBytes * 2)}`;
    expect(() => parseImageDataUrl(big)).toThrow(FREE_AI_MESSAGES.imageTooLarge);
  });

  it("honors injected limits for tests and future tuning", () => {
    expect(() =>
      parseImageDataUrl("data:image/jpeg;base64,YWFhYQ==", { maxDecodedBytes: 2, allowedMimeTypes: ["image/jpeg"] }),
    ).toThrow(FREE_AI_MESSAGES.imageTooLarge);
  });
});

describe("normalizeGeminiReceipt", () => {
  it("never invents missing amounts and keeps the effectively paid total", () => {
    const parsed = normalizeGeminiReceipt({
      is_receipt: true,
      type: "expense",
      amount: "92,58",
      payment_method: "Dinheiro",
    });
    expect(parsed.amount).toBe(92.58);
    expect(parsed.merchant_name).toBeNull();
    expect(parsed.receipt_id).toBeNull();
  });

  it("clamps unknown payment methods and types instead of trusting the model", () => {
    const parsed = normalizeGeminiReceipt({
      is_receipt: true,
      type: "paymente",
      payment_method: "Cartão mágico",
    });
    expect(parsed.type).toBe("unknown");
    expect(parsed.payment_method).toBe("unknown");
  });

  it("keeps per-kg quantities and negative cancelled items", () => {
    const parsed = normalizeGeminiReceipt({
      is_receipt: true,
      type: "expense",
      amount: 88.38,
      payment_method: "Pix",
      purchased_items: [
        { name: "BANANA NANICA Kg", quantity: "1,246", unit_price: "6,98", total: "8,70" },
        { name: "CEBOLA Kg (CANCELADO)", quantity: 0.464, unit_price: 6.79, total: -3.15 },
        { name: null, quantity: 1 },
      ],
    });
    expect(parsed.purchased_items).toEqual([
      { name: "BANANA NANICA Kg", quantity: 1.246, unit_price: 6.98, total: 8.7 },
      { name: "CEBOLA Kg (CANCELADO)", quantity: 0.464, unit_price: 6.79, total: -3.15 },
    ]);
  });

  it("keeps null quantity/unit_price/total when the model reports them illegible", () => {
    const parsed = normalizeGeminiReceipt({
      is_receipt: true,
      type: "expense",
      amount: 10,
      payment_method: "Dinheiro",
      purchased_items: [
        { name: "ITEM BORRADO", quantity: null, unit_price: null, total: null },
        { name: "ITEM SEM TOTAL", quantity: 2, unit_price: 4.5 },
      ],
    });
    expect(parsed.purchased_items).toEqual([
      { name: "ITEM BORRADO", quantity: null, unit_price: null, total: null },
      { name: "ITEM SEM TOTAL", quantity: 2, unit_price: 4.5, total: null },
    ]);
  });

  it("drops malformed item entries and invalid dates without crashing", () => {
    const parsed = normalizeGeminiReceipt({
      is_receipt: "yes",
      date: "12/10/2026",
      purchased_items: ["junk", { quantity: 2 }],
    });
    expect(parsed.is_receipt).toBe(false);
    expect(parsed.date).toBeNull();
    expect(parsed.purchased_items).toEqual([]);
  });

  it("preserves the ParsedReceipt shape consumed by the form (every key present)", () => {
    const parsed = normalizeGeminiReceipt({ is_receipt: true });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "amount",
        "card_brand",
        "card_last_four",
        "category_hint",
        "counterparty",
        "date",
        "fiscal_document_number",
        "institution",
        "is_receipt",
        "low_confidence_fields",
        "merchant_name",
        "notes",
        "payment_method",
        "purchased_items",
        "receipt_id",
        "tax_id",
        "time",
        "title",
        "type",
      ].sort(),
    );
  });
});

describe("GEMINI_RESPONSE_SCHEMA", () => {
  it("allows nulls for amount and item numbers so the model never invents values", () => {
    const schema = GEMINI_RESPONSE_SCHEMA as unknown as {
      required: string[];
      properties: {
        amount: { type: string; nullable?: boolean };
        purchased_items: { items: { properties: Record<string, { type: string; nullable?: boolean }>; required: string[] } };
      };
    };
    expect(schema.properties.amount.nullable).toBe(true);
    const item = schema.properties.purchased_items.items;
    expect(item.required).toEqual(["name"]);
    expect(item.properties.quantity.nullable).toBe(true);
    expect(item.properties.unit_price.nullable).toBe(true);
    expect(item.properties.total.nullable).toBe(true);
    // Only identity-ish fields stay required; nothing numeric is forced.
    expect(schema.required).toEqual(["is_receipt", "type", "payment_method"]);
  });
});

describe("buildFreeReceiptInstruction", () => {
  it("includes the fiscal accuracy rules for kg, discounts, cancellations and payment forms", () => {
    const instruction = buildFreeReceiptInstruction(["Alimentação"], ["Nubank (Banco)"], "2026-10-12");
    expect(instruction).toContain("quilo");
    expect(instruction).toContain("CANCELADO");
    expect(instruction).toContain("VALOR TOTAL EFETIVAMENTE PAGO");
    expect(instruction).toContain("Pix");
    expect(instruction).toContain("Nunca invente valores");
    expect(instruction).toContain("Alimentação");
    expect(instruction).toContain("Nubank (Banco)");
    expect(instruction).toContain("Use null (não um número inventado)");
  });

  it("pins the model to gemini-2.5-flash without claiming that guarantees free tier", () => {
    expect(FREE_AI_MODEL_ID).toBe("gemini-2.5-flash");
  });
});
