import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007120000_add_credit_card_invoice_lifecycle.sql"),
  "utf8",
);
const dueDateMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007150000_add_due_date_to_close_invoice.sql"),
  "utf8",
);
const closingReassignmentMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007160000_allow_invoice_reassignment_during_close.sql"),
  "utf8",
);

describe("credit card invoice database contract", () => {
  it("creates a persisted invoice model and safely backfills existing data", () => {
    expect(migration).toContain("CREATE TABLE public.credit_card_invoices");
    expect(migration).toContain("ADD COLUMN credit_card_invoice_id");
    expect(migration).toContain("UPDATE public.transactions");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE/);
  });

  it("closes with a snapshot and creates a neutral obligation", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.close_credit_card_invoice");
    expect(migration).toContain("closed_total = v_total");
    expect(migration).toContain("'card_invoice_obligation'");
    expect(migration).toContain("status = 'CLOSED'");
  });

  it("pays atomically, debits an account, and marks the obligation paid", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.pay_credit_card_invoice");
    expect(migration).toContain("account_id, credit_card_id, credit_card_invoice_id, financial_kind");
    expect(migration).toContain("UPDATE public.transactions SET is_paid = true");
    expect(migration).toContain("status = 'PAID'");
  });

  it("prevents duplicate payment and protects frozen purchases", () => {
    expect(migration).toContain("Fatura ja paga");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("FOR KEY SHARE");
    expect(migration).toContain("Nao e permitido alterar compra de fatura fechada");
    expect(migration).toContain("Compra deve pertencer a uma fatura aberta");
    expect(migration).toContain("Fatura futura ainda nao pode ser fechada");
  });

  it("keeps legacy payments editable and validates tenant ownership during backfill", () => {
    expect(migration).toContain("AND t.user_id = c.user_id");
    expect(migration).not.toContain("lower(category) IN ('pagamento fatura', 'pagamento de fatura')");
  });

  it("routes purchases to another cycle after the matching cycle was closed", () => {
    expect(migration).toContain("IF FOUND AND v_invoice.status = 'OPEN' THEN RETURN v_invoice.id");
    expect(migration).toContain("v_reference_date := v_cycle.cycle_end + 1");
    expect(migration).toContain("assign_credit_card_invoice_before_write");
  });

  it("persists an invoice-specific due date when closing", () => {
    expect(dueDateMigration).toContain("p_due_date DATE DEFAULT NULL");
    expect(dueDateMigration).toContain("due_date = v_due_date");
    expect(dueDateMigration).toContain("'Fatura Cartão', v_due_date");
    expect(dueDateMigration).not.toMatch(/UPDATE public\.credit_cards/);
  });

  it("allows the close RPC to move purchases between open invoices", () => {
    expect(closingReassignmentMigration).toContain("v_operation = 'close'");
    expect(closingReassignmentMigration).toContain("OLD.credit_card_invoice_id IS DISTINCT FROM NEW.credit_card_invoice_id");
    expect(closingReassignmentMigration).toContain("CREATE OR REPLACE FUNCTION public.assign_credit_card_invoice");
  });
});
