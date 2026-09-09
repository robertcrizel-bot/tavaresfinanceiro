import { describe, expect, it } from "vitest";
import type { ParsedReceipt } from "@/lib/receipt";
import { formatReceiptDescription } from "@/lib/receipt-description";

const receipt = (overrides: Partial<ParsedReceipt> = {}): ParsedReceipt => ({
  is_receipt: true,
  type: "expense",
  amount: 42,
  date: "2026-09-09",
  time: null,
  counterparty: "Mercado",
  institution: null,
  payment_method: "Cartão de Débito",
  category_hint: "Alimentação",
  receipt_id: null,
  title: "Mercado",
  notes: null,
  low_confidence_fields: [],
  ...overrides,
});

describe("formatReceiptDescription", () => {
  it("includes purchased items in the transaction description", () => {
    expect(
      formatReceiptDescription(
        receipt({
          purchased_items: ["2x Leite integral 1L", "Arroz 5kg"],
          notes: "Compra no débito",
          receipt_id: "ABC123",
        }),
      ),
    ).toBe("Itens: 2x Leite integral 1L; Arroz 5kg | Compra no débito | ID do comprovante: ABC123");
  });

  it("preserves the previous description when no items are available", () => {
    expect(formatReceiptDescription(receipt({ notes: "Pix enviado", receipt_id: "XYZ" }))).toBe(
      "Pix enviado | ID do comprovante: XYZ",
    );
  });

  it("ignores empty item names", () => {
    expect(formatReceiptDescription(receipt({ purchased_items: [" ", "Café 500g"] }))).toBe("Itens: Café 500g");
  });
});
