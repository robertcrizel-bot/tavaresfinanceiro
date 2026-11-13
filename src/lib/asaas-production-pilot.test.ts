import { describe, expect, it } from "vitest";
import { isProductionPilotRouteEnabled, verifiedAsaasProductionPaymentUrl } from "./asaas-production-pilot";
const prod = "https://onhmpgevkttysbfllhjq.supabase.co";
describe("production billing pilot", () => {
  it("exposes the pilot route only on verified production origin and allows an explicit kill switch", () => {
    expect(isProductionPilotRouteEnabled(undefined, "finvision2026.lovable.app", prod)).toBe(true);
    expect(isProductionPilotRouteEnabled("false", "finvision2026.lovable.app", prod)).toBe(false);
    expect(isProductionPilotRouteEnabled("true", "localhost", prod)).toBe(false);
    expect(isProductionPilotRouteEnabled("true", "finvision2026.lovable.app", "https://qnqljdsxtdakrbsqecly.supabase.co")).toBe(false);
    expect(isProductionPilotRouteEnabled("true", "finvision2026.lovable.app", prod)).toBe(true);
  });
  it("accepts production hosted payment URLs and rejects Sandbox or fake domains", () => {
    expect(verifiedAsaasProductionPaymentUrl("https://asaas.com/checkoutSession/show?id=abc")).toContain("asaas.com");
    expect(verifiedAsaasProductionPaymentUrl("https://www.asaas.com/i/abc")).toContain("asaas.com");
    expect(verifiedAsaasProductionPaymentUrl("https://sandbox.asaas.com/i/abc")).toBeNull();
    expect(verifiedAsaasProductionPaymentUrl("https://asaas.com.evil.example/i")).toBeNull();
    expect(verifiedAsaasProductionPaymentUrl("http://asaas.com/i/abc")).toBeNull();
    expect(verifiedAsaasProductionPaymentUrl(null)).toBeNull();
  });
});
