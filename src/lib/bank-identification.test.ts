import { describe, expect, it } from "vitest";
import { formatCpfInput, isValidCpf, maskAccountNumber, normalizeCardLastFour, normalizeCpf } from "./bank-identification";

describe("bank identification input", () => {
  it("normalizes and formats a CPF without changing its digits", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(formatCpfInput("52998224725")).toBe("529.982.247-25");
    expect(formatCpfInput("5299822")).toBe("529.982.2");
  });

  it("rejects incorrect CPF or repeated-digit placeholders", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("000.000.000-00")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });

  it("masks bank-account identifiers and allows only last four credit-card digits", () => {
    expect(maskAccountNumber("001239-X")).toBe("••••39-X");
    expect(maskAccountNumber("")).toBe("");
    expect(normalizeCardLastFour("**** 4321")).toBe("4321");
    expect(normalizeCardLastFour("1234567890")).toBe("1234");
  });
});
