import { describe, expect, it } from "vitest";
import { paddleToParsedReceipt } from "./paddleToParsedReceipt";
import { buildPaddleReceiptResult } from "./receiptResult";
import type { PaddleReceiptItem, PaddleReceiptResult } from "./receiptResult";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";

function makeItem(overrides: Partial<PaddleReceiptItem> = {}): PaddleReceiptItem {
  return {
    description: "PRODUTO EXEMPLO",
    quantity: 2,
    unit: "UN",
    unitPrice: 5,
    originalTotal: 10,
    explicitFinalValue: null,
    effectiveValue: 10,
    classification: "strong",
    ...overrides,
  };
}

function makeResult(overrides: Partial<PaddleReceiptResult> = {}): PaddleReceiptResult {
  return {
    merchant: "MERCADO EXEMPLO LTDA",
    cnpj: "11.222.333/0001-81",
    date: "2026-09-20",
    time: "10:15:00",
    receiptTotal: 50,
    items: [makeItem()],
    warnings: [],
    sumKnownItemValues: 50,
    differenceFromReceiptTotal: 0,
    ...overrides,
  };
}

describe("paddleToParsedReceipt", () => {
  it("maps header evidence directly to ParsedReceipt fields", () => {
    const parsed = paddleToParsedReceipt(makeResult());
    expect(parsed.is_receipt).toBe(true);
    expect(parsed.counterparty).toBe("MERCADO EXEMPLO LTDA");
    expect(parsed.merchant_name).toBe("MERCADO EXEMPLO LTDA");
    expect(parsed.title).toBe("MERCADO EXEMPLO LTDA");
    expect(parsed.tax_id).toBe("11.222.333/0001-81");
    expect(parsed.date).toBe("2026-09-20");
    expect(parsed.time).toBe("10:15:00");
  });

  it("uses only an explicit receiptTotal as amount, never sumKnownItemValues", () => {
    const withTotal = paddleToParsedReceipt(
      makeResult({
        receiptTotal: 88.38,
        sumKnownItemValues: 67.54,
        differenceFromReceiptTotal: -20.84,
      }),
    );
    expect(withTotal.amount).toBe(88.38);

    const withoutTotal = paddleToParsedReceipt(
      makeResult({
        receiptTotal: null,
        sumKnownItemValues: 67.54,
        items: [makeItem({ effectiveValue: 67.54 })],
        differenceFromReceiptTotal: null,
      }),
    );
    expect(withoutTotal.amount).toBeNull();
    expect(withoutTotal.amount).not.toBe(67.54);
  });

  it("never fabricates an item value via quantity * unitPrice", () => {
    const parsed = paddleToParsedReceipt(
      makeResult({
        items: [
          makeItem({
            quantity: 0.464,
            unit: "KG",
            unitPrice: 6.79,
            originalTotal: null,
            explicitFinalValue: null,
            effectiveValue: null,
          }),
        ],
      }),
    );
    expect(parsed.purchased_items?.[0].quantity).toBe(0.464);
    expect(parsed.purchased_items?.[0].unit_price).toBe(6.79);
    expect(parsed.purchased_items?.[0].total).toBeNull();
  });

  it("preserves item description, quantity, unitPrice and effectiveValue", () => {
    const parsed = paddleToParsedReceipt(
      makeResult({
        items: [
          makeItem({
            description: "BANANA NANICA Kg",
            quantity: 1.246,
            unitPrice: 6.98,
            originalTotal: 8.7,
            effectiveValue: 8.7,
          }),
          makeItem({
            description: "SEM VALOR",
            quantity: null,
            unit: null,
            unitPrice: null,
            originalTotal: null,
            effectiveValue: null,
          }),
        ],
      }),
    );
    expect(parsed.purchased_items).toEqual([
      { name: "BANANA NANICA Kg", quantity: 1.246, unit_price: 6.98, total: 8.7 },
      { name: "SEM VALOR", quantity: null, unit_price: null, total: null },
    ]);
  });

  it("sets item_values_are_final only when every item has an explicit effectiveValue", () => {
    expect(paddleToParsedReceipt(makeResult()).item_values_are_final).toBe(true);
    const mixed = paddleToParsedReceipt(
      makeResult({
        items: [makeItem(), makeItem({ effectiveValue: null })],
      }),
    );
    expect(mixed.item_values_are_final).toBe(false);
  });

  it("requires OCR evidence to consider the image a receipt", () => {
    const empty = paddleToParsedReceipt(
      makeResult({
        merchant: null,
        cnpj: null,
        date: null,
        time: null,
        receiptTotal: null,
        items: [],
        sumKnownItemValues: 0,
        differenceFromReceiptTotal: null,
      }),
    );
    expect(empty.is_receipt).toBe(false);

    expect(
      paddleToParsedReceipt(makeResult({ merchant: null, cnpj: null, items: [] }))
        .is_receipt,
    ).toBe(true);
    expect(
      paddleToParsedReceipt(
        makeResult({ merchant: null, cnpj: null, receiptTotal: null }),
      ).is_receipt,
    ).toBe(true);
    expect(
      paddleToParsedReceipt(makeResult({ receiptTotal: null, items: [] }))
        .is_receipt,
    ).toBe(true);
  });

  it("fills unsupported fields with explicit non-fabricated defaults", () => {
    const parsed = paddleToParsedReceipt(makeResult());
    expect(parsed.type).toBe("expense");
    expect(parsed.institution).toBeNull();
    expect(parsed.payment_method).toBe("");
    expect(parsed.category_hint).toBeNull();
    expect(parsed.receipt_id).toBeNull();
    expect(parsed.fiscal_document_number).toBeNull();
    expect(parsed.card_brand).toBeNull();
    expect(parsed.card_last_four).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("flags low confidence only when evidence is missing", () => {
    expect(paddleToParsedReceipt(makeResult()).low_confidence_fields).toEqual([]);

    expect(
      paddleToParsedReceipt(
        makeResult({
          receiptTotal: null,
          differenceFromReceiptTotal: null,
          items: [makeItem({ effectiveValue: 50 })],
        }),
      ).low_confidence_fields,
    ).toContain("amount");

    expect(
      paddleToParsedReceipt(makeResult({ date: null })).low_confidence_fields,
    ).toContain("date");

    expect(
      paddleToParsedReceipt(makeResult({ merchant: null })).low_confidence_fields,
    ).toContain("counterparty");

    expect(
      paddleToParsedReceipt(
        makeResult({ differenceFromReceiptTotal: -20.84 }),
      ).low_confidence_fields,
    ).toContain("purchased_items");

    expect(
      paddleToParsedReceipt(
        makeResult({
          items: [makeItem({ effectiveValue: null })],
          differenceFromReceiptTotal: null,
        }),
      ).low_confidence_fields,
    ).toContain("purchased_items");
  });

  it("never prorates the difference into amount or items", () => {
    const parsed = paddleToParsedReceipt(
      makeResult({
        receiptTotal: 88.38,
        sumKnownItemValues: 67.54,
        differenceFromReceiptTotal: -20.84,
        items: [
          makeItem({
            description: "SEM VALOR",
            quantity: 1,
            unitPrice: null,
            originalTotal: null,
            effectiveValue: null,
          }),
        ],
      }),
    );
    expect(parsed.amount).toBe(88.38);
    expect(parsed.purchased_items?.[0].total).toBeNull();
  });
});

describe("paddleToParsedReceipt with the real Fonseca fixture", () => {
  const paddle = buildPaddleReceiptResult(fonsecaRegions);
  const parsed = paddleToParsedReceipt(paddle);

  it("converts the receipt with explicit evidence only", () => {
    expect(parsed.is_receipt).toBe(true);
    expect(parsed.type).toBe("expense");
    expect(parsed.amount).toBe(88.38);
    expect(parsed.amount).not.toBe(paddle.sumKnownItemValues);
    expect(parsed.amount).not.toBe(67.54);
    expect(parsed.counterparty).toContain("FONSECA");
    expect(parsed.merchant_name).toContain("FONSECA");
    expect(parsed.tax_id).toBe("57.032.427/0001-99");
    expect(parsed.date).toBe("2026-09-16");
    expect(parsed.time).toBe("18:37:44");
    expect(parsed.institution).toBeNull();
    expect(parsed.payment_method).toBe("");
    expect(parsed.receipt_id).toBeNull();
    expect(parsed.purchased_items).toHaveLength(21);
    expect(parsed.item_values_are_final).toBe(false);
    expect(parsed.low_confidence_fields).toContain("purchased_items");
  });

  it("keeps unsupported item values null (no quantity * unitPrice fabrication)", () => {
    const cebola = parsed.purchased_items?.find((item) =>
      item.name.includes("CEBOLA"),
    );
    expect(cebola).toBeDefined();
    expect(cebola?.quantity).toBe(0.464);
    expect(cebola?.unit_price).toBe(6.79);
    expect(cebola?.total).toBeNull();
    expect(parsed.purchased_items?.some((item) => item.total === 3.15)).toBe(false);

    const banana = parsed.purchased_items?.find((item) =>
      item.name.includes("BANANA NANICA"),
    );
    expect(banana?.quantity).toBe(1.246);
    expect(banana?.unit_price).toBe(6.98);
    expect(banana?.total).toBe(8.7);
  });
});
