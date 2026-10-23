import { describe, expect, it } from "vitest";
import { getBetaCheckoutUrl } from "@/lib/beta-checkout";

describe("Beta checkout link validation", () => {
  it("does not show a paid subscription link unless configured", () => {
    expect(getBetaCheckoutUrl(undefined)).toBeNull();
    expect(getBetaCheckoutUrl("")).toBeNull();
    expect(getBetaCheckoutUrl("payment-not-set")).toBeNull();
  });
  it("accepts HTTPS hosted payment links from supported processors", () => {
    expect(getBetaCheckoutUrl("https://asaas.com/c123")).toBe("https://asaas.com/c123");
    expect(getBetaCheckoutUrl(" https://www.pagbank.com.br/pagamento/123 ")).toBe("https://www.pagbank.com.br/pagamento/123");
  });
  it("rejects lookalike hosts, insecure urls and embedded credentials", () => {
    for (const url of [
      "http://asaas.com/c123", "https://asaas.com.evil.test/c123",
      "https://attacker.example/asaas.com", "https://user:pass@asaas.com/c123",
      "javascript:alert(1)",
    ]) expect(getBetaCheckoutUrl(url)).toBeNull();
  });
});
