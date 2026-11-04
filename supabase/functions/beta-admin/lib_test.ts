import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler, type Deps, type Entitlement } from "./lib.ts";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-11-04T00:00:00Z");

function setup(opts: { ent?: Entitlement | null; hasReq?: boolean; slowUpsert?: boolean } = {}) {
  const calls: string[] = [];
  const deps: Deps = {
    getCallerId: (t) => Promise.resolve(t === "admin" ? ADMIN : t === "user" ? USER : null),
    isAdmin: (id) => Promise.resolve(id === ADMIN),
    userExists: () => Promise.resolve(true),
    getPerson: () => Promise.resolve({ email: "x@y.z", name: null }),
    hasRequest: () => Promise.resolve(opts.hasReq ?? true),
    getEntitlement: () => Promise.resolve(opts.ent ?? null),
    listRequests: () => Promise.resolve([]),
    listEntitlements: () => Promise.resolve([]),
    upsertEntitlement: async (id, s, e) => {
      if (opts.slowUpsert) await new Promise((r) => setTimeout(r, 20));
      calls.push(`upsert:${id}:${s}:${e}`);
    },
    revokeEntitlement: (id) => { calls.push(`revoke:${id}`); return Promise.resolve(); },
    approvePendingRequest: (id) => { calls.push(`approve:${id}`); return Promise.resolve(); },
    now: () => NOW,
  };
  return { handler: createHandler(deps), calls };
}
const post = (token: string | null, body: unknown) =>
  new Request("http://x", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("sem token → 401", async () => {
  assertEquals((await setup().handler(post(null, { action: "whoami" }))).status, 401);
});
Deno.test("token inválido → 401", async () => {
  assertEquals((await setup().handler(post("bad", { action: "list" }))).status, 401);
});
Deno.test("whoami retorna só booleano", async () => {
  const { handler } = setup();
  assertEquals(await (await handler(post("user", { action: "whoami" }))).json(), { isAdmin: false });
  assertEquals(await (await handler(post("admin", { action: "whoami" }))).json(), { isAdmin: true });
});
Deno.test("não-admin → 403 em list/grant/renew/block", async () => {
  const { handler, calls } = setup();
  for (const action of ["list", "grant", "renew", "block"]) {
    assertEquals((await handler(post("user", { action, userId: ADMIN }))).status, 403);
  }
  assertEquals(calls, []);
});
Deno.test("payloads inválidos → 400", async () => {
  const { handler, calls } = setup();
  for (const b of ["{oops", "[]", "null", { action: "drop" }, { action: "grant" }, { action: "grant", userId: "abc" }, { action: "grant", userId: 5 }]) {
    assertEquals((await handler(post("admin", b))).status, 400);
  }
  assertEquals(calls, []);
});
Deno.test("GET → 405", async () => {
  assertEquals((await setup().handler(new Request("http://x"))).status, 405);
});
Deno.test("admin não altera o próprio acesso", async () => {
  const { handler, calls } = setup();
  assertEquals((await handler(post("admin", { action: "grant", userId: ADMIN }))).status, 403);
  assertEquals(calls, []);
});
Deno.test("grant cria trial de 30 dias e aprova pedido", async () => {
  const { handler, calls } = setup();
  assertEquals((await handler(post("admin", { action: "grant", userId: USER }))).status, 200);
  assertEquals(calls, [`upsert:${USER}:trial:2026-12-04T00:00:00.000Z`, `approve:${USER}`]);
});
Deno.test("grant em acesso válido → 409", async () => {
  const { handler, calls } = setup({ ent: { status: "trial", expires_at: "2026-11-20T00:00:00Z" } });
  assertEquals((await handler(post("admin", { action: "grant", userId: USER }))).status, 409);
  assertEquals(calls, []);
});
Deno.test("renew soma 30 dias ao vencimento atual", async () => {
  const { handler, calls } = setup({ ent: { status: "trial", expires_at: "2026-11-20T00:00:00.000Z" }, hasReq: false });
  assertEquals((await handler(post("admin", { action: "renew", userId: USER }))).status, 200);
  assertEquals(calls, [`upsert:${USER}:trial:2026-12-20T00:00:00.000Z`]);
});
Deno.test("block repetido → 409", async () => {
  const { handler, calls } = setup({ ent: { status: "revoked", expires_at: "2026-11-20T00:00:00Z" } });
  assertEquals((await handler(post("admin", { action: "block", userId: USER }))).status, 409);
  assertEquals(calls, []);
});
Deno.test("usuário sem pedido nem acesso → 404", async () => {
  const { handler } = setup({ hasReq: false });
  assertEquals((await handler(post("admin", { action: "grant", userId: USER }))).status, 404);
});
Deno.test("operação simultânea no mesmo usuário → 409", async () => {
  const { handler, calls } = setup({ slowUpsert: true });
  const [a, b] = await Promise.all([
    handler(post("admin", { action: "grant", userId: USER })),
    handler(post("admin", { action: "grant", userId: USER })),
  ]);
  assertEquals([a.status, b.status].sort(), [200, 409]);
  assertEquals(calls.filter((c) => c.startsWith("upsert")).length, 1);
});
Deno.test("erro no banco → 500 sem vazar detalhes", async () => {
  const { handler } = setup();
  const h = createHandler({ ...({} as Deps), getCallerId: () => Promise.reject(new Error("secret db detail")) });
  const r = await h(post("admin", { action: "whoami" }));
  assertEquals(r.status, 500);
  assertEquals(await r.json(), { error: "server_error" });
  void handler;
});
