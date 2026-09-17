import { describe, expect, it } from "vitest";
import { buildCardExportRows, type CreditCardExportContext } from "@/lib/credit-card-statement-export";
import type { CreditCardStatementEntry } from "@/lib/credit-card-statement";

const entry = (overrides: Partial<CreditCardStatementEntry> = {}): CreditCardStatementEntry => ({
  id: "tx-1",
  date: "2026-09-15",
  description: "Compra",
  amount: 100,
  direction: "charge",
  sourceType: "purchase",
  sourceId: "tx-1",
  category: "Alimentação",
  isPaid: false,
  ...overrides,
});

const makeCtx = (overrides: Partial<CreditCardExportContext> = {}): CreditCardExportContext => ({
  cardName: "Nubank Platinum",
  referenceMonth: "2026-09",
  currentInvoice: 450,
  committedAmount: 1200,
  availableAmount: 3800,
  limit: 5000,
  statement: {
    entries: [],
    summary: { totalPurchases: 0, totalCredits: 0, totalPayments: 0 },
  },
  ...overrides,
});

describe("buildCardExportRows", () => {
  it("purchase has correct type label and positive value", () => {
    const rows = buildCardExportRows([entry({ sourceType: "purchase", direction: "charge", amount: 200 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].Tipo).toBe("Compra");
    expect(rows[0].Valor).toBe(200);
  });

  it("payment has correct type label and negative value", () => {
    const rows = buildCardExportRows([
      entry({ sourceType: "payment", direction: "credit", amount: 500, description: "Pagamento de Fatura" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].Tipo).toBe("Pagamento");
    expect(rows[0].Valor).toBe(-500);
  });

  it("reversal has correct type label and negative value", () => {
    const rows = buildCardExportRows([
      entry({ sourceType: "reversal", direction: "credit", amount: 50, description: "Estorno" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].Tipo).toBe("Estorno");
    expect(rows[0].Valor).toBe(-50);
  });

  it("partial_record is excluded", () => {
    const rows = buildCardExportRows([
      entry({ sourceType: "purchase", direction: "charge", amount: 200 }),
      entry({ id: "tx-p", sourceType: "partial_record", direction: "neutral", amount: 80, description: "Parcial fatura" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].Tipo).toBe("Compra");
  });

  it("installment info is included", () => {
    const rows = buildCardExportRows([
      entry({ installmentInfo: "2/5" }),
    ]);
    expect(rows[0].Parcela).toBe("2/5");
  });

  it("empty category is empty string", () => {
    const rows = buildCardExportRows([entry({ category: undefined })]);
    expect(rows[0].Categoria).toBe("");
  });

  it("date is formatted as DD/MM/YYYY", () => {
    const rows = buildCardExportRows([entry({ date: "2026-09-05" })]);
    expect(rows[0].Data).toBe("05/09/2026");
  });

  it("mixed entries produce correct rows", () => {
    const rows = buildCardExportRows([
      entry({ id: "tx-1", sourceType: "purchase", direction: "charge", amount: 300, date: "2026-09-05" }),
      entry({ id: "tx-2", sourceType: "payment", direction: "credit", amount: 200, date: "2026-09-10" }),
      entry({ id: "tx-3", sourceType: "reversal", direction: "credit", amount: 50, date: "2026-09-08" }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.Tipo)).toEqual(["Compra", "Pagamento", "Estorno"]);
  });
});

describe("CreditCardExportContext", () => {
  it("accepts all required fields", () => {
    const ctx = makeCtx();
    expect(ctx.cardName).toBe("Nubank Platinum");
    expect(ctx.referenceMonth).toBe("2026-09");
    expect(ctx.currentInvoice).toBe(450);
    expect(ctx.committedAmount).toBe(1200);
    expect(ctx.availableAmount).toBe(3800);
    expect(ctx.limit).toBe(5000);
  });

  it("statement summary values are preserved", () => {
    const ctx = makeCtx({
      statement: {
        entries: [],
        summary: { totalPurchases: 900, totalPayments: 450, totalCredits: 50 },
      },
    });
    expect(ctx.statement.summary.totalPurchases).toBe(900);
    expect(ctx.statement.summary.totalPayments).toBe(450);
    expect(ctx.statement.summary.totalCredits).toBe(50);
  });
});
