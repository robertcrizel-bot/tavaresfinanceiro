import { describe, expect, it } from "vitest";
import { isValidCpf, normalizeOptionalCpf, onlyDigits } from "@/lib/bank-details";
describe("optional banking CPF validation", () => {
  it("accepts blank CPF and normalizes formatted values", () => {
    expect(isValidCpf("")).toBe(true);
    expect(onlyDigits("529.982.247-25")).toBe("52998224725");
    expect(normalizeOptionalCpf("529.982.247-25")).toBe("52998224725");
  });
  it("validates check digits and rejects repeated digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
});
