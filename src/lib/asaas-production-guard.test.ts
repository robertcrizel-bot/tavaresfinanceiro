import { describe, expect, it, vi } from "vitest";
import { productionConfig, AsaasProduction } from "../../supabase/functions/_shared/asaas-production/gateway";
import { safeHostedUrl } from "../../supabase/functions/_shared/asaas-production/domain";

const liveDb = "https://onhmpgevkttysbfllhjq.supabase.co";
const values: Record<string, string> = {
  SUPABASE_URL: liveDb,
  ASAAS_PRODUCTION_SUPABASE_URL: liveDb,
  ASAAS_PRODUCTION_APP_ORIGIN: "https://finvision2026.lovable.app",
  ASAAS_PRODUCTION_API_KEY: "$aact_prod_" + "x".repeat(50),
  ASAAS_PRODUCTION_WEBHOOK_TOKEN: "w".repeat(40),
  ASAAS_PRODUCTION_WORKER_TOKEN: "z".repeat(40),
  ASAAS_PRODUCTION_ENABLED: "true",
};
const config = (override: Record<string, string> = {}) =>
  productionConfig((name) => ({ ...values, ...override })[name]);

describe("Asaas production remains fail-closed", () => {
  it("requires an explicit live enable switch", () => {
    expect(() => config({ ASAAS_PRODUCTION_ENABLED: "false" })).toThrow();
    expect(() => config({ ASAAS_PRODUCTION_ENABLED: "" })).toThrow();
  });
  it("requires the exact live Supabase and excludes the isolated Sandbox", () => {
    expect(() => config({ SUPABASE_URL: "https://qnqljdsxtdakrbsqecly.supabase.co" })).toThrow();
    expect(() => config({ ASAAS_PRODUCTION_SUPABASE_URL: "https://qnqljdsxtdakrbsqecly.supabase.co" })).toThrow();
  });
  it("rejects a Sandbox key and missing or repeated webhook secrets", () => {
    expect(() => config({ ASAAS_PRODUCTION_API_KEY: "$aact_hmlg_test" })).toThrow();
    expect(() => config({ ASAAS_PRODUCTION_WEBHOOK_TOKEN: "short" })).toThrow();
    expect(() => config({ ASAAS_PRODUCTION_WORKER_TOKEN: "w".repeat(40) })).toThrow();
  });
  it("refuses an unsafe return origin", () => {
    expect(() => config({ ASAAS_PRODUCTION_APP_ORIGIN: "http://finvision2026.lovable.app" })).toThrow();
    expect(() => config({ ASAAS_PRODUCTION_APP_ORIGIN: "https://evil.example.com/redirect" })).toThrow();
  });
  it("accepts only production hosted checkout URLs", () => {
    expect(safeHostedUrl("https://www.asaas.com/i/verified")).toContain("asaas.com");
    expect(safeHostedUrl("https://asaas.com/checkoutSession/show?id=valid")).toContain("asaas.com");
    expect(() => safeHostedUrl("https://sandbox.asaas.com/i/unsafe")).toThrow();
    expect(() => safeHostedUrl("https://asaas.com.evil.example/i/unsafe")).toThrow();
  });
  it("creates a boleto-with-Pix recurring subscription only against production", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.billingType).toBe("BOLETO");
      expect(body.value).toBe(14.9);
      expect(body.cycle).toBe("MONTHLY");
      return new Response(JSON.stringify({
        id: "sub_test", customer: "cus_test", value: 14.9,
        cycle: "MONTHLY", billingType: "BOLETO", status: "ACTIVE",
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const gateway = new AsaasProduction(config(), fetcher as unknown as typeof fetch);
    const sub = await gateway.subscribe({
      id: "contract-id", method: "BOLETO", user_id: "user",
      creation_token: "token", state: "creating", provider_billing_type: null,
      customer_id: "cus_test", checkout_id: null, subscription_id: null,
      checkout_url: null, expires_at: null, cancelled: false,
    }, { id: "financecontrol-monthly", name: "FinanceControl Mensal", price_cents: 1490, currency: "BRL", cycle: "MONTHLY" }, "cus_test");
    expect(sub).toBe("sub_test");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://api.asaas.com/v3/subscriptions");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("sandbox");
  });
});
