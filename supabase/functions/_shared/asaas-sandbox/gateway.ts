import {
  BillingError,
  cents,
  type Contract,
  fail,
  type Gateway,
  identifier,
  type Payment,
  type Plan,
  safeHostedUrl,
  type Subscription,
} from "./domain.ts";

export type SandboxConfig = {
  key: string;
  webhookToken: string;
  workerToken: string;
  origin: string;
};
export function sandboxConfig(
  env: (name: string) => string | undefined,
): SandboxConfig {
  const supabase = new URL(env("SUPABASE_URL") || "http://invalid");
  const expected = env("ASAAS_SANDBOX_SUPABASE_URL");
  const key = env("ASAAS_SANDBOX_API_KEY") || "";
  const webhookToken = env("ASAAS_SANDBOX_WEBHOOK_TOKEN") || "";
  const workerToken = env("ASAAS_SANDBOX_WORKER_TOKEN") || "";
  const origin = new URL(env("ASAAS_SANDBOX_APP_ORIGIN") || "http://invalid");
  if (
    env("ASAAS_SANDBOX_ENABLED") !== "true" || !expected ||
    supabase.origin !== new URL(expected).origin ||
    supabase.hostname === "onhmpgevkttysbfllhjq.supabase.co" ||
    (!supabase.hostname.endsWith(".supabase.co") &&
      !["localhost", "127.0.0.1", "kong"].includes(supabase.hostname)) ||
    !key.startsWith("$aact_hmlg_") || webhookToken.length < 32 ||
    workerToken.length < 32 ||
    new Set([key, webhookToken, workerToken]).size !== 3 ||
    (origin.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(origin.hostname)) ||
    origin.username || origin.password || origin.pathname !== "/" ||
    origin.search || origin.hash
  ) fail("SANDBOX_NOT_CONFIGURED", 503);
  return { key, webhookToken, workerToken, origin: origin.origin };
}

// Fixed host: no environment variable or request can switch this to production.
export class AsaasSandbox implements Gateway {
  constructor(
    private config: SandboxConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetcher(
      `https://api-sandbox.asaas.com/v3${path}`,
      {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          access_token: this.config.key,
          "Content-Type": "application/json",
          "User-Agent": "FinanceControl-Sandbox/1.0",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (!response.ok) {
      throw new BillingError(
        response.status === 404
          ? "GATEWAY_NOT_FOUND"
          : "GATEWAY_REQUEST_FAILED",
        response.status === 404 ? 404 : 503,
      );
    }
    // Never propagate the provider body (CPF, cardholder or key diagnostics).
    return response.status === 204
      ? undefined as T
      : await response.json() as T;
  }
  async customer(user: string, name: string, cpf: string) {
    const reference = `fc-sandbox-${identifier(user)}`;
    const found = await this.request<
      { data: { id: string }[]; hasMore: boolean }
    >(`/customers?externalReference=${encodeURIComponent(reference)}`);
    if (found.hasMore || found.data.length > 1) {
      fail("CUSTOMER_RECONCILIATION_REQUIRED");
    }
    if (found.data.length === 1) return identifier(found.data[0].id);
    const customer = await this.request<{ id: string }>("/customers", "POST", {
      name,
      cpfCnpj: cpf,
      externalReference: reference,
      notificationDisabled: true,
    });
    return identifier(customer.id);
  }
  private callbacks() {
    const url = `${this.config.origin}/assinatura-sandbox`;
    return {
      successUrl: `${url}?return=success`,
      cancelUrl: `${url}?return=cancelled`,
      expiredUrl: `${url}?return=expired`,
    };
  }
  async checkout(contract: Contract, plan: Plan, customer: string) {
    const checkout = await this.request<{ id: string }>("/checkouts", "POST", {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      customer,
      externalReference: contract.id,
      minutesToExpire: 60,
      callback: this.callbacks(),
      items: [{ name: plan.name, quantity: 1, value: plan.price_cents / 100 }],
      subscription: {
        cycle: plan.cycle,
        nextDueDate: new Date().toISOString().slice(0, 10),
      },
    });
    const id = identifier(checkout.id);
    if (!/^[a-f0-9-]{36}$/i.test(id)) fail("INVALID_CHECKOUT_ID");
    return {
      id,
      url: safeHostedUrl(
        `https://sandbox.asaas.com/checkoutSession/show?id=${id}`,
      ),
    };
  }
  async subscribe(contract: Contract, plan: Plan, customer: string) {
    const sub = await this.request<Subscription>("/subscriptions", "POST", {
      customer,
      billingType: "PIX",
      cycle: plan.cycle,
      value: plan.price_cents / 100,
      nextDueDate: new Date().toISOString().slice(0, 10),
      externalReference: contract.id,
      description: plan.name,
      callback: { ...this.callbacks(), autoRedirect: true },
    });
    if (
      sub.customer !== customer || cents(sub.value) !== plan.price_cents ||
      sub.cycle !== plan.cycle || sub.billingType !== "PIX"
    ) fail("SUBSCRIPTION_MISMATCH");
    return identifier(sub.id);
  }
  subscription(id: string) {
    return this.request<Subscription>(
      `/subscriptions/${encodeURIComponent(identifier(id))}`,
    );
  }
  payment(id: string) {
    return this.request<Payment>(
      `/payments/${encodeURIComponent(identifier(id))}`,
    );
  }
  async payments(filter: { subscription?: string; checkoutSession?: string }) {
    const query = new URLSearchParams(filter);
    const payments: Payment[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await this.request<{ data: Payment[]; hasMore: boolean }>(
        `/payments?${query}&limit=100&offset=${offset}`,
      );
      payments.push(...page.data);
      if (!page.hasMore) return payments;
    }
    return fail("PAYMENT_HISTORY_REQUIRES_RECONCILIATION");
  }
  async cancelSubscription(id: string) {
    try {
      await this.request(
        `/subscriptions/${encodeURIComponent(identifier(id))}`,
        "DELETE",
      );
    } catch (error) {
      if (
        !(error instanceof BillingError) || error.code !== "GATEWAY_NOT_FOUND"
      ) throw error;
    }
  }
  async cancelCheckout(id: string) {
    await this.request(
      `/checkouts/${encodeURIComponent(identifier(id))}/cancel`,
      "POST",
    );
  }
}
