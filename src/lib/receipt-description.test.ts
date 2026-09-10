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
  it("lists each purchased item with its value", () => {
    expect(
      formatReceiptDescription(
        receipt({
          purchased_items: [
            { name: "Leite integral 1L", quantity: 2, unit_price: 4.9, total: 9.8 },
            { name: "Arroz 5kg", quantity: 1, unit_price: 24.99, total: 24.99 },
          ],
          notes: "Compra no débito",
          receipt_id: "ABC123",
        }),
      ),
    ).toBe(
      "Itens:\n2x Leite integral 1L — R$ 9,80\nArroz 5kg — R$ 24,99\nCompra no débito\nID do comprovante: ABC123",
    );
  });

  it("falls back to quantity times unit price when the total is missing", () => {
    expect(
      formatReceiptDescription(
        receipt({ purchased_items: [{ name: "Refrigerante 2L", quantity: 3, unit_price: 8.99, total: null }] }),
      ),
    ).toBe("Itens:\n3x Refrigerante 2L — R$ 26,97");
  });

  it("keeps the item without a value when no price is readable", () => {
    expect(
      formatReceiptDescription(
        receipt({ purchased_items: [{ name: "Pão francês", quantity: null, unit_price: null, total: null }] }),
      ),
    ).toBe("Itens:\nPão francês");
  });

  it("preserves the previous description when no items are available", () => {
    expect(formatReceiptDescription(receipt({ notes: "Pix enviado", receipt_id: "XYZ" }))).toBe(
      "Pix enviado\nID do comprovante: XYZ",
    );
  });

  it("ignores empty item names", () => {
    expect(
      formatReceiptDescription(
        receipt({
          purchased_items: [
            { name: "  ", quantity: null, unit_price: null, total: null },
            { name: "Café 500g", quantity: 1, unit_price: 18.5, total: 18.5 },
          ],
        }),
      ),
    ).toBe("Itens:\nCafé 500g — R$ 18,50");
  });
});
