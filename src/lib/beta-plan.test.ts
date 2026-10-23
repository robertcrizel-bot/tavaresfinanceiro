import { describe, expect, it } from "vitest";
import { BETA_MONTHLY_PRICE_CENTS, BETA_MONTHLY_PRICE_LABEL } from "@/lib/beta-plan";
import { getBetaCheckoutUrl } from "@/lib/beta-checkout";

describe("approved introductory beta price", () => {
  it("shows the approved price in Brazilian reais", () => {
    expect(BETA_MONTHLY_PRICE_CENTS).toBe(2490);
    expect(BETA_MONTHLY_PRICE_LABEL.replace(/\s/g, " ")).toBe("R$ 24,90");
  });

  it("does not enable payment just because the price is defined", () => {
    expect(BETA_MONTHLY_PRICE_LABEL).toBeTruthy();
    expect(getBetaCheckoutUrl(undefined)).toBeNull();
  });
});
