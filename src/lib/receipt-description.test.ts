import { describe, expect, it } from "vitest";
import type { ParsedReceipt } from "@/lib/receipt";
import { cleanPurchasedItemName, formatReceiptDescription } from "@/lib/receipt-description";

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
  merchant_name: null,
  tax_id: null,
  fiscal_document_number: null,
  card_brand: null,
  card_last_four: null,
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
      "Itens:\nLeite integral 1L — 2 un · R$ 4,90/un · Total R$ 9,80\nArroz 5kg — R$ 24,99\nCompra no débito",
    );
  });

  it("falls back to quantity times unit price when the total is missing", () => {
    expect(
      formatReceiptDescription(
        receipt({ purchased_items: [{ name: "Refrigerante 2L", quantity: 3, unit_price: 8.99, total: null }] }),
      ),
    ).toBe("Itens:\nRefrigerante 2L — 3 un · R$ 8,99/un · Total R$ 26,97");
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

  describe("item_values_are_final", () => {
    const items = [
      { name: "FEIJAO CARIOCA 1KG", quantity: 2, unit_price: 8.49, total: 16.98 },
      { name: "MACARRAO ESPAGUETE 500G", quantity: 2, unit_price: 4.29, total: 8.58 },
    ];

    it("true → mostra valores individuais", () => {
      const result = formatReceiptDescription({
        purchased_items: items,
        item_values_are_final: true,
      });
      expect(result).toContain("R$ 16,98");
      expect(result).toContain("R$ 8,58");
      expect(result).toContain("FEIJAO CARIOCA 1KG — 2 un · R$ 8,49/un · Total R$ 16,98");
      expect(result).toContain("MACARRAO ESPAGUETE 500G — 2 un · R$ 4,29/un · Total R$ 8,58");
    });

    it("false → NÃO mostra valores individuais", () => {
      const result = formatReceiptDescription({
        purchased_items: items,
        item_values_are_final: false,
      });
      expect(result).toContain("FEIJAO CARIOCA 1KG — 2 un");
      expect(result).toContain("MACARRAO ESPAGUETE 500G — 2 un");
      expect(result).not.toContain("R$");
      expect(result).not.toContain("16,98");
      expect(result).not.toContain("8,58");
    });

    it("undefined → mantém comportamento atual e mostra valores", () => {
      const result = formatReceiptDescription({
        purchased_items: items,
      });
      expect(result).toContain("R$ 16,98");
      expect(result).toContain("R$ 8,58");
    });
  });
});


describe("receipt-friendly per-kilo description", () => {
  it("removes GTIN and internal codes, keeping unit prices for meat bought by weight", () => {
    const output = formatReceiptDescription({
      purchased_items: [
        { name: "3006 COXA MOLE KG", quantity: 0.720, unit_price: 45.99, total: 33.11 },
        { name: "3276 COXINHA DA ASA KG", quantity: 0.775, unit_price: 15.99, total: 12.39 },
        { name: "3000 ACEM BOVINO KG", quantity: 0.566, unit_price: 37.99, total: 21.5 },
        { name: "3275 FILE DE PEITO DE FRANG", quantity: 1.010, unit_price: 23.99, total: 24.23 },
        { name: "3028 PERNIL SUINO SEM OSSO", quantity: 0.522, unit_price: 16.99, total: 8.87 },
        { name: "3277 LINGUICA TOSCANA SADIA", quantity: 0.510, unit_price: 12.99, total: 6.62 },
      ],
      receipt_id: "58841",
    });
    expect(output).toContain("COXA MOLE — 0,720 kg · R$ 45,99/kg · Total R$ 33,11");
    expect(output).toContain("COXINHA DA ASA — 0,775 kg · R$ 15,99/kg · Total R$ 12,39");
    expect(output).toContain("FILE DE PEITO DE FRANG — 1,010 kg · R$ 23,99/kg · Total R$ 24,23");
    expect(output).toContain("LINGUICA TOSCANA SADIA — 0,510 kg · R$ 12,99/kg · Total R$ 6,62");
    expect(output).not.toMatch(/3006|3275|3277|ID do comprovante/);
  });

  it("removes long product barcodes without dropping package sizes", () => {
    const output = formatReceiptDescription({
      purchased_items: [
        { name: "7896022207854 ROSQUINHA GALAO LEITE 3", quantity: 1, unit_price: 3.99, total: 3.99 },
        { name: "7891048050637 GELATINA DR OETKER FRA", quantity: 1, unit_price: 1.59, total: 1.59 },
        { name: "ARROZ BRANCO 5 KG", quantity: 1, unit_price: 21.50, total: 21.50 },
        { name: "FEIJAO CARIOCA 1KG", quantity: 2, unit_price: 8.49, total: 16.98 },
      ],
    });
    expect(output).toContain("ROSQUINHA GALAO LEITE 3 — R$ 3,99");
    expect(output).toContain("GELATINA DR OETKER FRA — R$ 1,59");
    expect(output).toContain("ARROZ BRANCO 5 KG — R$ 21,50");
    expect(output).toContain("FEIJAO CARIOCA 1KG — 2 un · R$ 8,49/un · Total R$ 16,98");
    expect(output).not.toContain("789");
    expect(output).not.toContain("ARROZ BRANCO 5 KG — 1,000 kg");
  });

  it("does not invent a kilogram price when unit price is missing", () => {
    const output = formatReceiptDescription({
      purchased_items: [
        { name: "BANANA PRATA KG", quantity: 0.750, unit_price: null, total: 4.5 },
      ],
    });
    expect(output).toBe("Itens:\nBANANA PRATA — 0,750 kg — R$ 4,50");
    expect(output).not.toContain("/kg");
  });

  it("does not assert uncertain item totals or fabricate weight units for measured liquids", () => {
    expect(formatReceiptDescription({
      purchased_items: [
        { name: "COMBUSTIVEL L", quantity: 0.75, unit_price: 6, total: 4.5 },
        { name: "TOMATE KG", quantity: 0.800, unit_price: 8.90, total: 7.12 },
      ],
      item_values_are_final: false,
    })).toBe("Itens:\nCOMBUSTIVEL — 0,750 L\nTOMATE — 0,800 kg");
  });

  it("shows an extracted price per kilo without pretending an uncertain total is final", () => {
    const output = formatReceiptDescription({
      purchased_items: [
        { name: "BANANA PRATA KG", quantity: 0.8, unit_price: 7.99, total: 6.39 },
      ],
      item_values_are_final: false,
    }, true);
    expect(output).toBe("Itens:\nBANANA PRATA — 0,800 kg · R$ 7,99/kg · Valor informado R$ 6,39");
  });

  it("keeps receipt identifiers for Pix without purchased items", () => {
    expect(formatReceiptDescription({
      purchased_items: [], notes: "Pix enviado", receipt_id: "E123",
    })).toBe("Pix enviado\nID do comprovante: E123");
  });
});


describe("fiscal receipt line numbers and clutter", () => {
  it("formats all nine products from the photographed R$ 113,89 receipt, preserving price/kg", () => {
    // Exact type of names returned by free AI in the user's phone screenshot:
    // 001 and 789... got concatenated, while weighted items have 004 3006.
    const result = formatReceiptDescription({
      purchased_items: [
        { name: "0017896022207854 ROSQUINHA GALAO LEITE 3", quantity: 1, unit_price: 3.99, total: 3.99 },
        { name: "0027891048050637 GELATINA DR OETKER FRA", quantity: 1, unit_price: 1.59, total: 1.59 },
        { name: "0037891048050682 GELATINA DR OETKER UVA", quantity: 1, unit_price: 1.59, total: 1.59 },
        { name: "004 3006 COXA MOLE KG", quantity: 0.720, unit_price: 45.99, total: 33.11 },
        { name: "005 3276 COXINHA DA ASA KG", quantity: 0.775, unit_price: 15.99, total: 12.39 },
        { name: "006 3000 ACEM BOVINO KG", quantity: 0.566, unit_price: 37.99, total: 21.50 },
        { name: "007 3275 FILE DE PEITO DE FRANG", quantity: 1.010, unit_price: 23.99, total: 24.23 },
        { name: "008 3028 PERNIL SUINO SEM OSSO", quantity: 0.522, unit_price: 16.99, total: 8.87 },
        { name: "009 3277 LINGUICA TOSCANA SADIA", quantity: 0.510, unit_price: 12.99, total: 6.62 },
      ],
      notes: "Forma de pagamento: TEF",
      receipt_id: "58841",
    });
    expect(result).toContain("ROSQUINHA GALAO LEITE 3 — R$ 3,99");
    expect(result).toContain("GELATINA DR OETKER FRA — R$ 1,59");
    expect(result).toContain("GELATINA DR OETKER UVA — R$ 1,59");
    expect(result).toContain("COXA MOLE — 0,720 kg · R$ 45,99/kg · Total R$ 33,11");
    expect(result).toContain("COXINHA DA ASA — 0,775 kg · R$ 15,99/kg · Total R$ 12,39");
    expect(result).toContain("ACEM BOVINO — 0,566 kg · R$ 37,99/kg · Total R$ 21,50");
    expect(result).toContain("FILE DE PEITO DE FRANG — 1,010 kg · R$ 23,99/kg · Total R$ 24,23");
    expect(result).toContain("PERNIL SUINO SEM OSSO — 0,522 kg · R$ 16,99/kg · Total R$ 8,87");
    expect(result).toContain("LINGUICA TOSCANA SADIA — 0,510 kg · R$ 12,99/kg · Total R$ 6,62");
    expect(result).not.toMatch(/(?:001789|002789|003789|004 3006|005 3276|006 3000|007 3275|008 3028|009 3277|Forma de pagamento|TEF|ID do comprovante)/);
    expect(result?.split("\n").filter(line => line !== "Itens:")).toHaveLength(9);
  });

  it("drops fiscal and payment-only note lines without losing real purchase notes", () => {
    expect(formatReceiptDescription({
      purchased_items: [{ name: "002 3006 BANANA PRATA KG", quantity: 0.750, unit_price: 8.99, total: 6.74 }],
      notes: "Observação: produto com desconto\nForma de pagamento: TEF\nCNPJ: 07.633.295/0003-44\nAtenção: consumir até amanhã",
    })).toBe(
      "Itens:\nBANANA PRATA — 0,750 kg · R$ 8,99/kg · Total R$ 6,74\nObservação: produto com desconto\nAtenção: consumir até amanhã",
    );
  });

  it("keeps product package size, numeric product names and non-item transfer notes", () => {
    expect(cleanPurchasedItemName("ARROZ 5 KG")).toBe("ARROZ 5 KG");
    expect(cleanPurchasedItemName("VITAMINA B12 1000 MCG")).toBe("VITAMINA B12 1000 MCG");
    expect(cleanPurchasedItemName("365 DIAS DE CAFÉ")).toBe("365 DIAS DE CAFÉ");
    expect(cleanPurchasedItemName("7891048050637 GELATINA UVA")).toBe("GELATINA UVA");
    expect(cleanPurchasedItemName("001 7891048050637 GELATINA UVA")).toBe("GELATINA UVA");
    expect(cleanPurchasedItemName("009 3277 LINGUICA TOSCANA")).toBe("LINGUICA TOSCANA");
    expect(formatReceiptDescription({
      purchased_items: [],
      notes: "Forma de pagamento: Pix\nPix enviado para fornecedor",
      receipt_id: "E456",
    })).toBe("Forma de pagamento: Pix\nPix enviado para fornecedor\nID do comprovante: E456");
  });

  it("does not alter declared receipt values or invent an unknown price/kg", () => {
    const result = formatReceiptDescription({
      purchased_items: [
        { name: "009 3277 LINGUICA TOSCANA KG", quantity: 0.510, unit_price: null, total: 6.62 },
      ],
      item_values_are_final: false,
      notes: "Forma de pagamento: TEF",
    }, true);
    expect(result).toBe("Itens:\nLINGUICA TOSCANA — 0,510 kg · Valor informado R$ 6,62");
    expect(result).not.toContain("/kg");
  });
});
