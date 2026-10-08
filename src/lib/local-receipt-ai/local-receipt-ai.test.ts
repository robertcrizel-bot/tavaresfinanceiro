import { describe, expect, it, vi } from "vitest";
import type { ParsedReceipt } from "@/lib/receipt";
import {
  buildLocalReceiptPrompt,
  interpretReceiptLocally,
  normalizeLocalReceiptResponse,
  toLocalReceiptInput,
  type LocalReceiptInput,
} from "@/lib/local-receipt-ai";

function bakeryInput(): LocalReceiptInput {
  return {
    regions: [
      { text: "PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO", confidence: 0.99, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] },
      { text: "001 3917 PAO FRANCES", confidence: 0.99, bbox: [[0, 10], [10, 10], [10, 15], [0, 15]] },
      { text: "0,274KG X 21,99 T12 6,03", confidence: 0.99, bbox: [[0, 20], [10, 20], [10, 25], [0, 25]] },
      { text: "002 3904 PAO DE QUEIJO", confidence: 0.99, bbox: [[0, 30], [10, 30], [10, 35], [0, 35]] },
      { text: "0,052KG X 35,00 T18 1,82", confidence: 0.99, bbox: [[0, 40], [10, 40], [10, 45], [0, 45]] },
      { text: "QTDE. TOTAL DE ITENS 002", confidence: 0.99, bbox: [[0, 50], [10, 50], [10, 55], [0, 55]] },
      { text: "VALOR TOTAL R$ 7,85", confidence: 0.99, bbox: [[0, 60], [10, 60], [10, 65], [0, 65]] },
      { text: "Emissao 07/10/2026 07:09:53", confidence: 0.99, bbox: [[0, 70], [10, 70], [10, 75], [0, 75]] },
    ],
    groupedLines: [
      { index: 0, text: "PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO", regions: [] },
      { index: 1, text: "001 3917 PAO FRANCES", regions: [] },
      { index: 2, text: "0,274KG X 21,99 T12 6,03", regions: [] },
      { index: 3, text: "002 3904 PAO DE QUEIJO", regions: [] },
      { index: 4, text: "0,052KG X 35,00 T18 1,82", regions: [] },
      { index: 5, text: "QTDE. TOTAL DE ITENS 002", regions: [] },
      { index: 6, text: "VALOR TOTAL R$ 7,85", regions: [] },
      { index: 7, text: "Emissao 07/10/2026 07:09:53", regions: [] },
    ],
    rawText: "PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO\n001 3917 PAO FRANCES\n0,274KG X 21,99 T12 6,03",
    categories: ["Alimentação", "Outros"],
    accounts: [],
  };
}

function fallbackReceipt(): ParsedReceipt {
  return {
    is_receipt: true,
    type: "expense",
    amount: 7.85,
    date: null,
    time: null,
    counterparty: null,
    institution: null,
    payment_method: "",
    category_hint: null,
    receipt_id: null,
    merchant_name: "PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO",
    tax_id: null,
    fiscal_document_number: null,
    card_brand: null,
    card_last_four: null,
    title: null,
    notes: null,
    purchased_items: [],
    low_confidence_fields: ["date"],
  };
}

function validModelJson(): string {
  return JSON.stringify({
    is_receipt: true,
    type: "expense",
    amount: 7.85,
    date: "2026-10-07",
    time: "07:09:53",
    counterparty: null,
    institution: null,
    payment_method: "",
    category_hint: "Alimentação",
    receipt_id: null,
    merchant_name: "PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO",
    tax_id: null,
    fiscal_document_number: null,
    card_brand: null,
    card_last_four: null,
    title: "PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO",
    notes: null,
    purchased_items: [
      { name: "PAO FRANCES", quantity: 0.274, unit_price: 21.99, total: 6.03 },
      { name: "PAO DE QUEIJO", quantity: 0.052, unit_price: 35.0, total: 1.82 },
    ],
    low_confidence_fields: [],
  });
}

describe("local-receipt-ai", () => {
  it("builds a prompt with grouped lines, regions, categories and fiscal-marker rules", () => {
    const prompt = buildLocalReceiptPrompt(bakeryInput());
    expect(prompt).toContain("[2] 0,274KG X 21,99 T12 6,03");
    expect(prompt).toContain("T12 and T18 are fiscal markers");
    expect(prompt).toContain("Alimentação");
    expect(prompt).toContain("purchased_items");
  });

  it("accepts valid JSON with multiline bakery items", () => {
    const parsed = normalizeLocalReceiptResponse(validModelJson(), bakeryInput());
    expect(parsed.amount).toBe(7.85);
    expect(parsed.date).toBe("2026-10-07");
    expect(parsed.time).toBe("07:09:53");
    expect(parsed.purchased_items).toEqual([
      { name: "PAO FRANCES", quantity: 0.274, unit_price: 21.99, total: 6.03 },
      { name: "PAO DE QUEIJO", quantity: 0.052, unit_price: 35.0, total: 1.82 },
    ]);
  });

  it("drops fiscal markers used as prices and keeps nulls as null", () => {
    const response = JSON.stringify({
      is_receipt: true,
      type: "expense",
      amount: 7.85,
      date: null,
      time: null,
      counterparty: null,
      institution: null,
      payment_method: "",
      category_hint: null,
      receipt_id: null,
      merchant_name: "PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO",
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: null,
      notes: null,
      purchased_items: [
        { name: "PAO FRANCES", quantity: 12, unit_price: 18, total: 6.03 },
      ],
      low_confidence_fields: [],
    });
    const parsed = normalizeLocalReceiptResponse(response, bakeryInput());
    expect(parsed.purchased_items).toEqual([
      { name: "PAO FRANCES", quantity: null, unit_price: null, total: 6.03 },
    ]);
    expect(parsed.date).toBeNull();
    expect(parsed.time).toBeNull();
  });

  it("never accepts invented products, values or merchants", () => {
    const response = JSON.stringify({
      is_receipt: true,
      type: "expense",
      amount: 999.99,
      date: "2025-01-01",
      time: "23:59:59",
      counterparty: "Loja Fantasma",
      institution: "Banco Fantasma",
      payment_method: "Pix",
      category_hint: "Alimentação",
      receipt_id: "FANTASMA-1",
      merchant_name: "Mercado Fantasma",
      tax_id: "00.000.000/0001-00",
      fiscal_document_number: "999",
      card_brand: "Visa",
      card_last_four: "9999",
      title: "Compra Fantasma",
      notes: "nota fantasma",
      purchased_items: [
        { name: "PRODUTO FANTASMA", quantity: 9, unit_price: 99, total: 891 },
        { name: "PAO FRANCES", quantity: 0.274, unit_price: 21.99, total: 6.03 },
      ],
      low_confidence_fields: [],
    });
    const parsed = normalizeLocalReceiptResponse(response, bakeryInput());
    expect(parsed.amount).toBeNull();
    expect(parsed.date).toBeNull();
    expect(parsed.merchant_name).toBeNull();
    expect(parsed.payment_method).toBe("");
    expect(parsed.purchased_items).toEqual([
      { name: "PAO FRANCES", quantity: 0.274, unit_price: 21.99, total: 6.03 },
    ]);
  });

  it("falls back to the deterministic parser when inference fails", async () => {
    const fallback = fallbackReceipt();
    const onMetrics = vi.fn();
    const parsed = await interpretReceiptLocally(bakeryInput(), {
      fallback,
      infer: async () => {
        throw new Error("modelo indisponível");
      },
      onMetrics,
    });
    expect(parsed).toBe(fallback);
    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ fallbackUsed: true }));
  });

  it("falls back to the deterministic parser when the model JSON is invalid", async () => {
    const fallback = fallbackReceipt();
    const parsed = await interpretReceiptLocally(bakeryInput(), {
      fallback,
      infer: async () => ({
        text: "não é json",
        metrics: { modelId: "test", backend: "wasm", initializationMs: 1, inferenceMs: 1, totalMs: 2 },
      }),
    });
    expect(parsed).toBe(fallback);
  });

  it("uses mocked inference without network and reports metrics on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    const onMetrics = vi.fn();
    const onProgress = vi.fn();
    try {
      const parsed = await interpretReceiptLocally(bakeryInput(), {
        fallback: fallbackReceipt(),
        infer: async (prompt, onStatus) => {
          expect(prompt).toContain("PAO FRANCES");
          onStatus?.("teste");
          return {
            text: validModelJson(),
            metrics: { modelId: "test", backend: "wasm", initializationMs: 1, inferenceMs: 2, totalMs: 3 },
          };
        },
        onMetrics,
        onProgress,
      });
      expect(parsed.amount).toBe(7.85);
      expect(parsed.purchased_items).toHaveLength(2);
      expect(onProgress).toHaveBeenCalledWith("teste");
      expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ fallbackUsed: false }));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("builds grouped lines and raw text from OCR regions without a second Paddle run", () => {
    const input = toLocalReceiptInput(bakeryInput().regions, ["Alimentação"], []);
    expect(input.groupedLines.length).toBeGreaterThan(0);
    expect(input.rawText).toContain("PAO FRANCES");
    expect(input.regions).toHaveLength(8);
  });
});
