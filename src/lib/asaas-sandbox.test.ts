// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  BillingError,
  type Contract,
  type InboxEvent,
  type Payment,
  paymentState,
  type Plan,
  safeHostedUrl,
  type Snapshot,
  type Store,
} from "../../supabase/functions/_shared/asaas-sandbox/domain";
import {
  AsaasSandbox,
  sandboxConfig,
} from "../../supabase/functions/_shared/asaas-sandbox/gateway";
import {
  parseEvent,
  SandboxBilling,
} from "../../supabase/functions/_shared/asaas-sandbox/service";
import { handler } from "../../supabase/functions/_shared/asaas-sandbox/http";
const USER = "10000000-0000-0000-0000-000000000001",
  CHECKOUT = "20000000-0000-0000-0000-000000000001";
const PLAN: Plan = {
  id: "financecontrol-monthly",
  name: "FinanceControl Mensal",
  price_cents: 1490,
  currency: "BRL",
  cycle: "MONTHLY",
};
const config = {
  key: "$aact_hmlg_mock",
  webhookToken: "mock-webhook-token".repeat(3),
  workerToken: "mock-worker-token".repeat(3),
  origin: "http://localhost:8080",
};
// Records snapshots, not a substitute for the actual SQL projection tests.
class MemoryStore implements Store {
  contract: Contract | null = null;
  events = new Map<string, InboxEvent>();
  applied: Snapshot[] = [];
  async allow(user: string) {
    if (user !== USER) throw new BillingError("USER_NOT_ALLOWED", 403);
  }
  async plan() {
    return PLAN;
  }
  async claim(user: string, method: Contract["method"]) {
    await this.allow(user);
    if (this.contract) {
      if (
        ["creating", "reconciliation_required"].includes(this.contract.state) ||
        this.contract.method !== method
      ) throw new BillingError("CONTRACT_REQUIRES_RECONCILIATION");
      return { contract: { ...this.contract }, plan: PLAN, fresh: false };
    }
    this.contract = {
      id: crypto.randomUUID(),
      user_id: user,
      method,
      state: "creating",
      creation_token: crypto.randomUUID(),
      customer_id: null,
      subscription_id: null,
      checkout_id: null,
      checkout_url: null,
      expires_at: null,
      cancelled: false,
    };
    return { contract: { ...this.contract }, plan: PLAN, fresh: true };
  }
  async progress(
    _c: Contract,
    customer: string,
    subscription?: string,
    checkout?: string,
    url?: string,
  ) {
    Object.assign(this.contract!, {
      customer_id: customer,
      ...(subscription ? { subscription_id: subscription } : {}),
      ...(checkout ? { checkout_id: checkout } : {}),
      ...(url ? { checkout_url: url, state: "pending" } : {}),
    });
  }
  async uncertain() {
    this.contract!.state = "reconciliation_required";
  }
  async byUser(id: string) {
    return this.contract?.user_id === id ? { ...this.contract } : null;
  }
  async bySubscription(id: string) {
    return this.contract?.subscription_id === id ? { ...this.contract } : null;
  }
  async byCustomer(id: string) {
    return this.contract?.customer_id === id ? { ...this.contract } : null;
  }
  async byCheckout(id: string) {
    return this.contract?.checkout_id === id ? { ...this.contract } : null;
  }
  async cancel(user: string) {
    await this.allow(user);
    this.contract!.cancelled = true;
    this.contract!.state = "cancelled";
  }
  async enqueue(event: Omit<InboxEvent, "attempts">) {
    const old = this.events.get(event.event_id);
    if (
      old &&
      (old.resource_id !== event.resource_id ||
        old.event_type !== event.event_type)
    ) throw Error("collision");
    if (!old) this.events.set(event.event_id, { ...event, attempts: 0 });
  }
  async lease() {
    return true;
  }
  async pending() {
    return [...this.events.values()].filter((e) => e.attempts < 10);
  }
  async apply(
    event: InboxEvent,
    _token: string,
    _contract: Contract | null,
    snapshot: Snapshot | null,
  ) {
    if (snapshot) {
      this.applied.push(snapshot);
      this.contract!.subscription_id = snapshot.subscription_id;
    }
    this.events.delete(event.event_id);
  }
  async retry(event: InboxEvent) {
    this.events.get(event.event_id)!.attempts++;
  }
  async refresh() {}
}
function setup() {
  const store = new MemoryStore();
  let payment: Payment = {
    id: "pay_1",
    customer: "cus_1",
    subscription: "sub_1",
    billingType: "PIX",
    value: 14.9,
    status: "PENDING",
    dueDate: new Date().toISOString().slice(0, 10),
    invoiceUrl: "https://sandbox.asaas.com/i/test",
  };
  const gateway = {
    customer: vi.fn(async () => "cus_1"),
    checkout: vi.fn(async () => ({
      id: CHECKOUT,
      url: `https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}`,
    })),
    subscribe: vi.fn(async () => "sub_1"),
    subscription: vi.fn(async () => ({
      id: "sub_1",
      customer: "cus_1",
      value: 14.9,
      cycle: "MONTHLY",
      billingType: store.contract!.method,
      status: "ACTIVE",
    })),
    payment: vi.fn(async () => ({ ...payment })),
    payments: vi.fn(async () => [{ ...payment }]),
    cancelSubscription: vi.fn(async () => {}),
    cancelCheckout: vi.fn(async () => {}),
  };
  const service = new SandboxBilling(store, gateway);
  const request = handler(
    "checkout",
    config,
    store,
    service,
    async (token) =>
      token === "valid" ? USER : token === "foreign" ? "other" : null,
  );
  const post = (body: unknown, token = "valid") =>
    request(
      new Request("http://local?success=true", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
  const event = (
    type = "PAYMENT_CONFIRMED",
    id = "evt_1",
    resource = "pay_1",
  ) =>
    store.enqueue({
      event_id: id,
      event_type: type,
      resource_kind: "payment",
      resource_id: resource,
    });
  return {
    store,
    gateway,
    service,
    post,
    event,
    setPayment: (patch: Partial<Payment>) => {
      payment = { ...payment, ...patch };
    },
  };
}
describe("Sandbox service and HTTP using mocks, not live Asaas", () => {
  it("requires authentication and refuses foreign users", async () => {
    const t = setup();
    expect((await t.post({ action: "status" }, "bad")).status).toBe(401);
    expect((await t.post({ action: "status" }, "foreign")).status).toBe(403);
  });
  it.each([
    "price",
    "value",
    "plan_id",
    "cycle",
    "customer",
    "subscription_id",
    "user_id",
    "callback",
  ])("rejects browser override %s", async (field) => {
    const t = setup();
    expect(
      (await t.post({
        action: "start",
        method: "PIX",
        name: "Teste",
        cpfCnpj: "12345678909",
        [field]: "tampered",
      })).status,
    ).toBe(400);
    expect(t.gateway.customer).not.toHaveBeenCalled();
  });
  it("creates one Pix subscription and hides privileged identifiers", async () => {
    const t = setup();
    const start = {
      action: "start",
      method: "PIX",
      name: "Teste",
      cpfCnpj: "12345678909",
    };
    const r = await t.post(start);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.plan).toEqual(PLAN);
    expect(JSON.stringify(data)).not.toContain("creation_token");
    expect(JSON.stringify(data)).not.toContain("customer_id");
    await t.post(start);
    expect(t.gateway.subscribe).toHaveBeenCalledTimes(1);
    expect(t.gateway.checkout).not.toHaveBeenCalled();
  });
  it("serializes simultaneous contracts", async () => {
    const t = setup();
    const r = await Promise.all([
      t.service.start(USER, "PIX", "Teste", "12345678909"),
      t.service.start(USER, "PIX", "Teste", "12345678909").catch((e) => e.code),
    ]);
    expect(r[1]).toBe("CONTRACT_REQUIRES_RECONCILIATION");
    expect(t.gateway.subscribe).toHaveBeenCalledTimes(1);
  });
  it("does not retry an ambiguous creation", async () => {
    const t = setup();
    t.gateway.checkout.mockRejectedValueOnce(
      Error("sensitive-provider-payload"),
    );
    for (let i = 0; i < 2; i++) {
      await expect(t.service.start(USER, "CREDIT_CARD", "Teste", "12345678909"))
        .rejects.toThrow("CONTRACT_REQUIRES_RECONCILIATION");
    }
    expect(t.gateway.checkout).toHaveBeenCalledTimes(1);
  });
  it("grants only when canonical Pix status confirms payment", async () => {
    const t = setup();
    await t.service.start(USER, "PIX", "Teste", "12345678909");
    await t.event();
    await t.service.drain();
    expect(t.store.applied[0].status).toBe("pending");
    t.setPayment({ status: "RECEIVED" });
    await t.event("PAYMENT_RECEIVED", "evt_2");
    await t.service.drain();
    expect(t.store.applied[1]).toMatchObject({
      status: "paid",
      value_cents: 1490,
    });
  });
  it("requires checkout payment linkage before binding a card subscription", async () => {
    const t = setup();
    await t.service.start(USER, "CREDIT_CARD", "Teste", "12345678909");
    t.setPayment({ billingType: "CREDIT_CARD", status: "CONFIRMED" });
    t.gateway.payments.mockResolvedValueOnce([]);
    await t.event();
    await t.service.drain();
    expect(t.store.applied).toHaveLength(0);
    await t.service.drain();
    expect(t.store.applied[0]).toMatchObject({
      status: "paid",
      checkout_verified: true,
      subscription_id: "sub_1",
    });
  });
  it("handles a refused card without paid access", async () => {
    const t = setup();
    await t.service.start(USER, "CREDIT_CARD", "Teste", "12345678909");
    t.setPayment({ billingType: "CREDIT_CARD" });
    await t.event("PAYMENT_CREDIT_CARD_CAPTURE_REFUSED");
    await t.service.drain();
    expect(t.store.applied[0].status).toBe("failed");
  });
  it("handles monthly renewal and exposes the next unpaid Pix invoice", async () => {
    const t = setup();
    await t.service.start(USER, "PIX", "Teste", "12345678909");
    t.setPayment({
      id: "pay_2",
      status: "RECEIVED",
      dueDate: "2030-02-28",
      invoiceUrl: "https://sandbox.asaas.com/i/renewal",
    });
    await t.event("PAYMENT_RECEIVED", "evt_renewal", "pay_2");
    await t.service.drain();
    expect(t.store.applied[0]).toMatchObject({
      payment_id: "pay_2",
      due_date: "2030-02-28",
      status: "paid",
    });
    t.setPayment({ status: "PENDING" });
    expect((await t.service.status(USER)).contract.checkout_url).toContain(
      "renewal",
    );
  });
  it("handles overdue, refund and a delayed paid event safely", async () => {
    const t = setup();
    await t.service.start(USER, "PIX", "Teste", "12345678909");
    t.setPayment({ status: "OVERDUE" });
    await t.event("PAYMENT_OVERDUE");
    await t.service.drain();
    expect(t.store.applied[0].status).toBe("overdue");
    t.setPayment({ status: "REFUNDED" });
    await t.event("PAYMENT_CONFIRMED", "late");
    await t.service.drain();
    expect(t.store.applied[1].status).toBe("reversed");
  });
  it("cancels only the authenticated contract, idempotently", async () => {
    const t = setup();
    await t.service.start(USER, "PIX", "Teste", "12345678909");
    expect(
      (await t.post({ action: "cancel", subscription_id: "foreign" })).status,
    ).toBe(400);
    await t.service.cancel(USER);
    await t.service.cancel(USER);
    expect(t.gateway.cancelSubscription).toHaveBeenCalledTimes(1);
    expect((await t.service.status(USER)).contract.state).toBe("cancelled");
  });
  it.each([{ customer: "foreign" }, { subscription: "foreign" }, {
    value: 0.01,
  }])("rejects altered payment %o", async (patch) => {
    const t = setup();
    await t.service.start(USER, "PIX", "Teste", "12345678909");
    t.setPayment({ status: "RECEIVED", ...patch });
    await t.event();
    await t.service.drain();
    expect(t.store.applied).toHaveLength(0);
  });
  it("does not let stale checkout expiry cancel a subscription", async () => {
    const t = setup();
    await t.service.start(USER, "CREDIT_CARD", "Teste", "12345678909");
    await t.store.enqueue({
      event_id: "expiry",
      event_type: "CHECKOUT_EXPIRED",
      resource_kind: "checkout",
      resource_id: CHECKOUT,
    });
    await t.service.drain();
    expect(t.store.contract.cancelled).toBe(false);
    expect(t.store.applied).toHaveLength(0);
  });
  it("authenticates webhook, deduplicates minimal metadata, rejects ID collision", async () => {
    const t = setup();
    const h = handler("webhook", config, t.store, t.service, async () => null);
    const post = (token: string, id = "pay_1") =>
      h(
        new Request("http://local", {
          method: "POST",
          headers: { "asaas-access-token": token },
          body: JSON.stringify({
            id: "evt_1",
            event: "PAYMENT_RECEIVED",
            payment: { id, creditCard: "sensitive", value: 0.01 },
          }),
        }),
      );
    expect((await post("bad")).status).toBe(401);
    expect((await post(config.webhookToken)).status).toBe(200);
    expect((await post(config.webhookToken)).status).toBe(200);
    expect(t.store.events.size).toBe(1);
    expect(JSON.stringify([...t.store.events.values()])).not.toContain(
      "sensitive",
    );
    expect((await post(config.webhookToken, "different")).status).toBe(503);
    vi.spyOn(t.store, "enqueue").mockRejectedValue(Error("DB down"));
    expect((await post(config.webhookToken)).status).toBe(503);
  });
  it("does not grant access from a return URL or user status request", async () => {
    const t = setup();
    expect((await (await t.post({ action: "status" })).json()).contract)
      .toBeNull();
    expect(t.store.applied).toHaveLength(0);
  });
  it("requires independent worker credentials and bounds the request body", async () => {
    const t = setup();
    const w = handler("worker", config, t.store, t.service, async () => null);
    expect(
      (await w(
        new Request("http://local", {
          method: "POST",
          headers: { authorization: `Bearer ${config.webhookToken}` },
        }),
      )).status,
    ).toBe(401);
    expect((await t.post({ action: "status", data: "x".repeat(9000) })).status)
      .toBe(413);
  });
});
describe("Sandbox HTTP transport using mocks", () => {
  it("cancels a card subscription even before its first webhook binds it", async () => {
    const t = setup();
    await t.service.start(USER, "CREDIT_CARD", "Teste", "12345678909");
    t.setPayment({ billingType: "CREDIT_CARD", status: "CONFIRMED" });
    await t.service.cancel(USER);
    expect(t.gateway.cancelSubscription).toHaveBeenCalledWith("sub_1");
    expect(t.gateway.cancelCheckout).not.toHaveBeenCalled();
  });
  it("creates a fixed monthly Pix subscription, not a one-off checkout", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "sub_1", customer: "cus_1", value: 14.9, billingType: "PIX", cycle: "MONTHLY", status: "ACTIVE" })));
    const t = setup(); const { contract } = await t.store.claim(USER, "PIX");
    await new AsaasSandbox(config, f).subscribe(contract, PLAN, "cus_1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-sandbox.asaas.com/v3/subscriptions");
    expect(JSON.parse(init.body as string)).toMatchObject({ customer: "cus_1", billingType: "PIX", value: 14.9, cycle: "MONTHLY", externalReference: contract.id });
  });
  it("posts fixed server price and monthly card checkout to Sandbox", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: CHECKOUT })));
    const g = new AsaasSandbox(config, f);
    const t = setup();
    const { contract } = await t.store.claim(USER, "CREDIT_CARD");
    await g.checkout(contract, PLAN, "cus_1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-sandbox.asaas.com/v3/checkouts");
    expect(JSON.parse(init.body as string)).toMatchObject({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      customer: "cus_1",
      items: [{ value: 14.9, quantity: 1 }],
      subscription: { cycle: "MONTHLY" },
    });
  });
  it("reuses a customer and rejects duplicate externalReferences", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "cus_1" }], hasMore: false }))
    );
    const g = new AsaasSandbox(config, f);
    expect(await g.customer(USER, "Teste", "12345678909")).toBe("cus_1");
    expect(f).toHaveBeenCalledTimes(1);
    f.mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "a" }, { id: "b" }], hasMore: false }),
      ),
    );
    await expect(g.customer(USER, "Teste", "12345678909")).rejects.toThrow(
      "RECONCILIATION",
    );
  });
  it("sanitizes gateway errors and refuses production URLs", async () => {
    const g = new AsaasSandbox(
      config,
      async () => new Response("sensitive-token-cpf", { status: 400 }),
    );
    await expect(g.payment("pay_1")).rejects.toThrow("GATEWAY_REQUEST_FAILED");
    expect(() => safeHostedUrl("https://asaas.com/i/prod")).toThrow();
    expect(() =>
      parseEvent({
        id: "x",
        event: "PAYMENT_CONFIRMED",
        payment: { id: "../../foreign" },
      })
    ).toThrow();
  });
  it("ignores a paid event when canonical payment is still pending", () => {
    const p = { status: "PENDING" } as Payment;
    expect(paymentState(p, "PAYMENT_CONFIRMED")).toBe("pending");
  });
  it("blocks production project, production keys and disabled configuration", () => {
    const env: Record<string, string> = {
      ASAAS_SANDBOX_ENABLED: "true",
      SUPABASE_URL: "http://127.0.0.1:54321",
      ASAAS_SANDBOX_SUPABASE_URL: "http://127.0.0.1:54321",
      ASAAS_SANDBOX_API_KEY: config.key,
      ASAAS_SANDBOX_WEBHOOK_TOKEN: config.webhookToken,
      ASAAS_SANDBOX_WORKER_TOKEN: config.workerToken,
      ASAAS_SANDBOX_APP_ORIGIN: config.origin,
    };
    expect(sandboxConfig((k) => env[k]).origin).toBe(config.origin);
    for (
      const patch of [{ ASAAS_SANDBOX_ENABLED: "false" }, {
        ASAAS_SANDBOX_API_KEY: "$aact_prod_example",
      }, {
        SUPABASE_URL: "https://onhmpgevkttysbfllhjq.supabase.co",
        ASAAS_SANDBOX_SUPABASE_URL: "https://onhmpgevkttysbfllhjq.supabase.co",
      }]
    ) {
      expect(() => sandboxConfig((k) => ({ ...env, ...patch })[k])).toThrow(
        "SANDBOX_NOT_CONFIGURED",
      );
    }
  });
});
