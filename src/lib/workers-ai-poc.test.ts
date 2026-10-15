import { describe, expect, it, vi } from "vitest";
import worker, { createPocHandler, MODEL, type PocEnv } from "../../cloudflare/financecontrol-workers-ai-poc/index";

const origin = "https://tavares1989finance.lovable.app";
function setup(authStatus = 200) {
  const run = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({
    is_receipt: true, type: "expense", amount: 12.34, date: "2026-10-14", payment_method: "Pix",
  }) } }] }));
  const userId = crypto.randomUUID();
  const auth = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url) !== "https://example.supabase.co/auth/v1/user") throw new Error("Unexpected external request");
    return Response.json({ id: userId }, { status: authStatus });
  });
  const env: PocEnv = { AI: { run }, SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "test-only" };
  return { run, auth, env, handle: createPocHandler(env, auth as typeof fetch) };
}
function request(body: unknown = { imageDataUrl: "data:image/jpeg;base64,YWJj", categories: [], accounts: [] }) {
  return new Request("https://poc.invalid/", { method: "POST", headers: {
    Origin: origin, Authorization: "Bearer test-session", "Content-Type": "application/json",
  }, body: JSON.stringify(body) });
}
describe("authenticated Workers AI reader (local regression tests)", () => {
  it("exposes only deployment metadata without authentication or inference", async () => {
    const { env, auth, run } = setup();
    const response = await createPocHandler({ ...env, BUILD_COMMIT: "test-commit" }, auth as typeof fetch)(new Request("https://poc.invalid/version"));
    expect(await response.json()).toEqual({ commit: "test-commit", model: MODEL, maxCompletionTokens: 2048 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(auth).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("passes image to Gemma and preserves the financial response contract", async () => {
    const { handle, run, auth } = setup();
    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ amount: 12.34, payment_method: "Pix", date: "2026-10-14", purchased_items: [] });
    expect(auth).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(MODEL, expect.objectContaining({ store: false, stream: false,
      messages: [expect.objectContaining({ content: [expect.objectContaining({ type: "text" }),
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,YWJj" } }] })] }));
  });
  it("rejects unauthorized sessions before inference", async () => {
    const { handle, run } = setup(401);
    expect((await handle(request())).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects malformed images before inference", async () => {
    const { handle, run } = setup();
    expect((await handle(request({ imageDataUrl: "invalid" }))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
  it("fails closed without an AI binding", async () => {
    const { env, auth, run } = setup();
    expect((await createPocHandler({ ...env, AI: undefined }, auth as typeof fetch)(request())).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
  it("stops on quota errors and never falls back", async () => {
    const { handle, run, auth } = setup();
    run.mockRejectedValueOnce({ status: 429 });
    expect((await handle(request())).status).toBe(429);
    expect(run).toHaveBeenCalledTimes(1);
    expect(auth).toHaveBeenCalledTimes(1);
  });
  it("rejects requests without a Supabase session", async () => {
    const { handle, run, auth } = setup();
    const unauthenticated = new Request(request(), { headers: { Origin: origin } });
    expect((await handle(unauthenticated)).status).toBe(401);
    expect(auth).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("requires auth configuration even when AI is available", async () => {
    const { env, run, auth } = setup();
    expect((await createPocHandler({ ...env, SUPABASE_URL: undefined }, auth as typeof fetch)(request())).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects unlisted origins before authentication or inference", async () => {
    const { handle, run, auth } = setup();
    expect((await handle(new Request(request(), { headers: { Origin: "https://untrusted.invalid" } }))).status).toBe(403);
    expect(auth).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("allows production preflight without executing inference", async () => {
    const { handle, run } = setup();
    const response = await handle(new Request("https://poc.invalid/", { method: "OPTIONS", headers: { Origin: origin } }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(run).not.toHaveBeenCalled();
  });
  it("reports availability only after authentication and from the AI binding", async () => {
    const { env, auth, run, handle } = setup();
    const get = () => new Request("https://poc.invalid/", { headers: { Authorization: "Bearer test-session", Origin: origin } });
    expect(await (await handle(get())).json()).toEqual({ available: true });
    expect(await (await createPocHandler({ ...env, AI: undefined }, auth as typeof fetch)(get())).json()).toEqual({ available: false });
    expect(run).not.toHaveBeenCalled();
  });
  it("removes the temporary test route even with credentials", async () => {
    const { env, run, auth } = setup();
    const blocked = new Request("https://poc.invalid/__synthetic-test", {
      method: "POST", headers: { Authorization: "Bearer test-session", Origin: origin },
      body: JSON.stringify({ imageDataUrl: "data:image/jpeg;base64,YWJj" }),
    });
    expect((await worker.fetch(blocked, env)).status).toBe(404);
    expect(auth).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("enforces the shared per-user rate limit", async () => {
    const { handle, run } = setup();
    for (let i = 0; i < 8; i++) expect((await handle(request())).status).toBe(200);
    expect((await handle(request())).status).toBe(429);
    expect(run).toHaveBeenCalledTimes(8);
  });
  it("rejects unsupported image MIME types before inference", async () => {
    const { handle, run } = setup();
    expect((await handle(request({ imageDataUrl: "data:image/svg+xml;base64,YWJj" }))).status).toBe(415);
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects oversized declared request bodies", async () => {
    const { handle, run } = setup();
    const oversized = request();
    oversized.headers.set("content-length", String(9 * 1024 * 1024));
    expect((await handle(oversized)).status).toBe(413);
    expect(run).not.toHaveBeenCalled();
  });
  it("returns a correlated safe failure without leaking provider input or falling back", async () => {
    const { handle, run, auth } = setup();
    run.mockRejectedValueOnce({ status: 403, code: 5035, message: "private provider message" });
    const response = await handle(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.requestId).toMatch(/^[a-z0-9]{8}$/);
    expect(JSON.stringify(body)).not.toContain("private provider message");
    expect(run).toHaveBeenCalledTimes(1);
    expect(auth).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed model JSON without producing financial data", async () => {
    const { handle, run } = setup();
    run.mockResolvedValueOnce({ choices: [{ message: { content: "not JSON" } }] });
    const response = await handle(request());
    expect(response.status).toBe(422);
    expect(await response.json()).not.toHaveProperty("amount");
  });
});
