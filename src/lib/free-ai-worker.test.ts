import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  MAX_ACCESS_TOKEN_LENGTH,
  createWorkerHandler,
  resolveAllowedOrigins,
  verifySupabaseUser,
  type Env,
} from "../../cloudflare/financecontrol-gemini-free/src/index";
import { FREE_AI_MESSAGES, FREE_AI_MODEL_ID, GEMINI_API_URL } from "../../supabase/functions/parse-receipt-free/lib";

const SUPABASE_URL = "https://onhmpgevkttysbfllhjq.supabase.co";
const SUPABASE_ANON_KEY = "anon-key-for-tests";
const GEMINI_API_KEY = "AIzaSyA-1234567890abcdefghijkmnopqrstuv";
const PRODUCTION_ORIGIN = "https://tavares1989finance.lovable.app";

const ENV: Env = { GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY };

const IMAGE_DATA_URL = "data:image/jpeg;base64,Y29ycmVjdGVk";

function fullGeminiJson() {
  return {
    is_receipt: true,
    type: "expense",
    amount: 88.38,
    date: "2026-10-12",
    time: "18:37:44",
    counterparty: null,
    institution: "Nubank",
    payment_method: "Pix",
    category_hint: "Alimentação",
    receipt_id: "CU-000926212981",
    merchant_name: "FONSECA SUPERMERCADOS",
    tax_id: "05.703.242/0001-99",
    fiscal_document_number: "227045",
    card_brand: null,
    card_last_four: null,
    title: "Fonseca Supermercados",
    notes: null,
    purchased_items: [{ name: "BANANA NANICA Kg", quantity: 1.246, unit_price: 6.98, total: 8.7 }],
    low_confidence_fields: [],
  };
}

/** Frontend ParsedReceipt keys — the contract the app consumes. */
const PARSED_RECEIPT_KEYS = [
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
].sort();

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body?: string;
}

interface FakeBackend {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
}

/**
 * Simulates the only two hosts the Worker may talk to: Supabase Auth (token
 * validation) and the official Gemini endpoint. Any other host throws.
 */
function fakeBackend(options: { authStatus?: number; authBody?: unknown; gemini?: () => Response } = {}): FakeBackend {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers, body: typeof init.body === "string" ? init.body : undefined });
    if (url.startsWith(`${SUPABASE_URL}/`)) {
      return new Response(JSON.stringify(options.authBody ?? { id: "user-123" }), {
        status: options.authStatus ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === GEMINI_API_URL) {
      return options.gemini
        ? options.gemini()
        : new Response(
            JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fullGeminiJson()) }] } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
    }
    throw new Error(`unexpected outbound host: ${url}`);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

/** Fresh handler with an isolated rate-limit window (the shared map is for production). */
function makeHandler(backend: FakeBackend, env: Env = ENV, extra: { log?: (entry: Record<string, unknown>) => void } = {}) {
  return createWorkerHandler(env, { fetchImpl: backend.fetchImpl, rateBuckets: new Map(), ...extra });
}

function postRequest(headers: Record<string, string> = {}) {
  return new Request("https://financecontrol-gemini-free.workers.dev/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token", ...headers },
    body: JSON.stringify({ imageDataUrl: IMAGE_DATA_URL, categories: ["Alimentação"], accounts: ["Nubank (Banco)"] }),
  });
}

function getRequest(headers: Record<string, string> = {}) {
  return new Request("https://financecontrol-gemini-free.workers.dev/", {
    method: "GET",
    headers: { Authorization: "Bearer valid-token", ...headers },
  });
}

describe("financecontrol-gemini-free worker", () => {
  it("rejects a request without a token with 401 and never calls Gemini", async () => {
    const backend = fakeBackend();
    const handler = makeHandler(backend);

    const response = await handler(postRequest({ Authorization: "" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.unauthorized);
    expect(backend.calls).toHaveLength(0);
  });

  it("rejects a token the auth server does not recognize with 401 and never calls Gemini", async () => {
    const backend = fakeBackend({ authStatus: 401, authBody: { message: "invalid JWT" } });
    const handler = makeHandler(backend);

    const response = await handler(postRequest({ Authorization: "Bearer forged.token.here" }));
    expect(response.status).toBe(401);
    expect(backend.calls).toHaveLength(1);
    expect(backend.calls[0].url).toBe(`${SUPABASE_URL}/auth/v1/user`);
    expect(backend.calls[0].headers.Authorization).toBe("Bearer forged.token.here");
    expect(backend.calls.some((call) => call.url === GEMINI_API_URL)).toBe(false);
  });

  it("fails closed when Supabase Auth is not configured", async () => {
    const backend = fakeBackend();
    const handler = makeHandler(backend, { GEMINI_API_KEY });
    expect((await handler(postRequest())).status).toBe(401);
    expect(backend.calls).toHaveLength(0);

    expect(await verifySupabaseUser({}, "token", backend.fetchImpl)).toBeNull();
    expect(backend.calls).toHaveLength(0);
  });

  it("accepts a valid token, then calls Gemini and returns a ParsedReceipt-compatible body", async () => {
    const logs: Record<string, unknown>[] = [];
    const backend = fakeBackend();
    const handler = makeHandler(backend, ENV, { log: (entry) => logs.push(entry) });

    const response = await handler(postRequest({ Origin: PRODUCTION_ORIGIN }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(PARSED_RECEIPT_KEYS);
    expect(body).toMatchObject({ is_receipt: true, type: "expense", amount: 88.38, payment_method: "Pix" });
    expect(body.purchased_items).toEqual([
      { name: "BANANA NANICA Kg", quantity: 1.246, unit_price: 6.98, total: 8.7 },
    ]);

    // Auth first, Gemini second — in that order.
    expect(backend.calls.map((call) => call.url)).toEqual([`${SUPABASE_URL}/auth/v1/user`, GEMINI_API_URL]);
    const geminiCall = backend.calls[1];
    expect(geminiCall.headers["x-goog-api-key"]).toBe(GEMINI_API_KEY);
    expect(geminiCall.url).not.toContain(GEMINI_API_KEY);
    const wire = JSON.parse(String(geminiCall.body));
    expect(wire.contents[0].parts[1].inline_data.mime_type).toBe("image/jpeg");
    expect(wire.generationConfig.responseSchema).toBeTruthy();

    // Availability (GET) reads the same Worker configuration as the reading.
    const status = await handler(getRequest({ Origin: PRODUCTION_ORIGIN }));
    expect(await status.json()).toEqual({ available: true });

    // Logs and bodies stay sanitized: no key, no token, no image.
    const rawLogs = JSON.stringify(logs);
    expect(rawLogs).not.toContain(GEMINI_API_KEY);
    expect(rawLogs).not.toContain("valid-token");
    expect(rawLogs).not.toContain("Y29ycmVjdGVk");
    expect(JSON.stringify(body)).not.toContain(GEMINI_API_KEY);
  });

  it("returns 503 without calling Gemini when the key is missing", async () => {
    const backend = fakeBackend();
    const handler = makeHandler(backend, { SUPABASE_URL, SUPABASE_ANON_KEY });

    const post = await handler(postRequest());
    expect(post.status).toBe(503);
    expect((await post.json()).error).toBe(FREE_AI_MESSAGES.unconfigured);

    const get = await handler(getRequest());
    expect(await get.json()).toEqual({ available: false });
    expect(backend.calls.some((call) => call.url === GEMINI_API_URL)).toBe(false);
  });

  it("keeps the reader on gemini-2.5-flash with no paid fallback when Google fails", async () => {
    const cases = [
      [400, 503, FREE_AI_MESSAGES.invalidRequest],
      [401, 503, FREE_AI_MESSAGES.invalidApiKey],
      [403, 503, FREE_AI_MESSAGES.billingRequired],
      [404, 503, FREE_AI_MESSAGES.modelUnavailable],
      [429, 429, FREE_AI_MESSAGES.quotaExceeded],
    ] as const;

    for (const [googleStatus, expectedStatus, expectedMessage] of cases) {
      const backend = fakeBackend({
        gemini: () =>
          new Response(
            JSON.stringify({
              error: {
                code: googleStatus,
                status: googleStatus === 403 ? "FAILED_PRECONDITION" : "ERROR",
                message: googleStatus === 403 ? "Billing account required for this model." : "google failure",
              },
            }),
            { status: googleStatus },
          ),
      });
      const handler = makeHandler(backend, ENV, { log: () => undefined });
      const response = await handler(postRequest());
      expect(response.status).toBe(expectedStatus);
      expect((await response.json()).error).toBe(expectedMessage);
      // Exactly one Gemini attempt: no second model, no paid fallback.
      expect(backend.calls.filter((call) => call.url.startsWith("https://generativelanguage.googleapis.com/"))).toHaveLength(1);
    }
    expect(FREE_AI_MODEL_ID).toBe("gemini-2.5-flash");
  });

  it("maps a Gemini network failure to a retryable outage with a request id", async () => {
    const logs: Record<string, unknown>[] = [];
    const backend = fakeBackend({
      gemini: () => {
        throw new TypeError("fetch failed");
      },
    });
    const handler = makeHandler(backend, ENV, { log: (entry) => logs.push(entry) });

    const response = await handler(postRequest());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe(FREE_AI_MESSAGES.unavailable);
    expect(typeof body.requestId).toBe("string");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((entry) => entry.requestId === body.requestId)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(GEMINI_API_KEY);
  });

  it("answers the CORS preflight only for allow-listed origins", async () => {
    const handler = makeHandler(fakeBackend());

    const allowed = await handler(
      new Request("https://financecontrol-gemini-free.workers.dev/", {
        method: "OPTIONS",
        headers: {
          Origin: PRODUCTION_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,content-type",
        },
      }),
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(PRODUCTION_ORIGIN);
    expect(allowed.headers.get("Vary")).toBe("Origin");
    expect(allowed.headers.get("Access-Control-Allow-Headers")).toContain("authorization");

    const dev = await handler(
      new Request("https://financecontrol-gemini-free.workers.dev/", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:8080", "Access-Control-Request-Method": "POST" },
      }),
    );
    expect(dev.status).toBe(204);
    expect(dev.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8080");

    const denied = await handler(
      new Request("https://financecontrol-gemini-free.workers.dev/", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
      }),
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("refuses a browser origin outside the allowlist before auth or Gemini", async () => {
    const backend = fakeBackend();
    const handler = makeHandler(backend);

    const response = await handler(postRequest({ Origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await response.json()).error).toBe(FREE_AI_MESSAGES.originNotAllowed);
    expect(backend.calls).toHaveLength(0);
  });

  it("never echoes a wildcard CORS origin when the allowlist is active", async () => {
    const handler = makeHandler(fakeBackend());
    const response = await handler(postRequest({ Origin: PRODUCTION_ORIGIN }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(PRODUCTION_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });

  it("rejects unsupported methods", async () => {
    const handler = makeHandler(fakeBackend());
    const response = await handler(new Request("https://financecontrol-gemini-free.workers.dev/", { method: "DELETE" }));
    expect(response.status).toBe(405);
  });

  it("exposes a default fetch handler that logs only sanitized request facts", async () => {
    const backend = fakeBackend();
    vi.stubGlobal("fetch", backend.fetchImpl);
    const printed: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      printed.push(args.map(String).join(" "));
    };
    try {
      const worker = (await import("../../cloudflare/financecontrol-gemini-free/src/index")).default;
      const response = await worker.fetch(postRequest({ Origin: PRODUCTION_ORIGIN }), ENV);
      expect(response.status).toBe(200);
    } finally {
      console.log = originalLog;
      vi.unstubAllGlobals();
    }

    expect(printed).toHaveLength(1);
    const entry = JSON.parse(printed[0]);
    expect(entry).toMatchObject({ scope: "worker", method: "POST", status: 200 });
    expect(typeof entry.ms).toBe("number");
    expect(printed[0]).not.toContain(GEMINI_API_KEY);
    expect(printed[0]).not.toContain("valid-token");
    expect(printed[0]).not.toContain("Y29ycmVjdGVk");
  });

  it("caps the token length accepted by the auth verifier", async () => {
    const backend = fakeBackend();
    expect(
      await verifySupabaseUser(
        { SUPABASE_URL, SUPABASE_ANON_KEY },
        "x".repeat(MAX_ACCESS_TOKEN_LENGTH + 1),
        backend.fetchImpl,
      ),
    ).toBeNull();
    expect(await verifySupabaseUser({ SUPABASE_URL, SUPABASE_ANON_KEY }, "", backend.fetchImpl)).toBeNull();
    expect(backend.calls).toHaveLength(0);
  });
});

describe("resolveAllowedOrigins", () => {
  it("always includes the production domain and the local dev origins", () => {
    expect(resolveAllowedOrigins()).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(resolveAllowedOrigins("")).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(DEFAULT_ALLOWED_ORIGINS).toContain(PRODUCTION_ORIGIN);
    expect(DEFAULT_ALLOWED_ORIGINS).toContain("http://localhost:8080");
    expect(DEFAULT_ALLOWED_ORIGINS).not.toContain("*");
  });

  it("merges extra origins without duplicates and never allows a wildcard", () => {
    const merged = resolveAllowedOrigins(`${PRODUCTION_ORIGIN}, https://preview.example,`);
    expect(merged).toContain("https://preview.example");
    expect(merged.filter((origin) => origin === PRODUCTION_ORIGIN)).toHaveLength(1);
    expect(merged).not.toContain("*");
  });
});
