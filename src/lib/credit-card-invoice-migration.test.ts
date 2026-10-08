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
const reopenMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007170000_reopen_closed_credit_card_invoice.sql"),
  "utf8",
);
const reversePaymentMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007180000_reverse_credit_card_invoice_payment.sql"),
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

  it("reopens only an unpaid CLOSED invoice atomically", () => {
    expect(reopenMigration).toContain("CREATE OR REPLACE FUNCTION public.reopen_credit_card_invoice");
    expect(reopenMigration).toContain("FOR UPDATE");
    expect(reopenMigration).toContain("v_invoice.user_id <> auth.uid()");
    expect(reopenMigration).toContain("v_invoice.status <> 'CLOSED'");
    expect(reopenMigration).toContain("Fatura paga nao pode ser reaberta");
    expect(reopenMigration).toContain("status = 'OPEN'");
  });

  it("removes only the obligation securely linked to the reopened invoice", () => {
    expect(reopenMigration).toContain("v_invoice.obligation_transaction_id");
    expect(reopenMigration).toContain("v_obligation.credit_card_invoice_id IS DISTINCT FROM v_invoice.id");
    expect(reopenMigration).toMatch(/DELETE FROM public\.transactions\s+WHERE id = v_obligation\.id/);
    expect(reopenMigration).toContain("AND credit_card_invoice_id = v_invoice.id");
    expect(reopenMigration).toContain("AND financial_kind = 'card_invoice_obligation'");
    expect(reopenMigration).toContain("obligation.id <> v_obligation.id");
  });

  it("clears the closing snapshot without moving or deleting purchases", () => {
    expect(reopenMigration).toContain("closed_total = NULL");
    expect(reopenMigration).toContain("closed_at = NULL");
    expect(reopenMigration).toContain("actual_closed_at = NULL");
    expect(reopenMigration).not.toContain("SET credit_card_invoice_id");
    expect(reopenMigration).not.toMatch(/financial_kind\s+IN\s*\(\s*'card_purchase'/);
  });

  it("keeps invalid reopen attempts transactional", () => {
    expect(reopenMigration).toContain("BEGIN;");
    expect(reopenMigration).toContain("IF NOT FOUND THEN");
    expect(reopenMigration).toContain("RAISE EXCEPTION 'Fatura nao pode ser reaberta'");
    expect(reopenMigration).toContain("COMMIT;");
  });

  it("reverses only a structurally valid PAID invoice payment", () => {
    expect(reversePaymentMigration).toContain("CREATE OR REPLACE FUNCTION public.reverse_credit_card_invoice_payment");
    expect(reversePaymentMigration).toContain("FOR UPDATE");
    expect(reversePaymentMigration).toContain("v_invoice.user_id <> auth.uid()");
    expect(reversePaymentMigration).toContain("v_invoice.status <> 'PAID'");
    expect(reversePaymentMigration).toContain("v_invoice.payment_transaction_id IS NULL");
    expect(reversePaymentMigration).toContain("v_invoice.paid_at IS NULL");
    expect(reversePaymentMigration).toContain("payment_account.user_id = v_invoice.user_id");
    expect(reversePaymentMigration).toContain("v_payment.credit_card_invoice_id IS DISTINCT FROM v_invoice.id");
    expect(reversePaymentMigration).toContain("v_payment.financial_kind <> 'card_invoice_payment'");
    expect(reversePaymentMigration).toContain("v_payment.account_id IS DISTINCT FROM v_invoice.payment_account_id");
  });

  it("removes only the invoice payment and restores its obligation", () => {
    expect(reversePaymentMigration).toMatch(/DELETE FROM public\.transactions\s+WHERE id = v_payment\.id/);
    expect(reversePaymentMigration).toContain("AND credit_card_invoice_id = v_invoice.id");
    expect(reversePaymentMigration).toContain("AND financial_kind = 'card_invoice_payment'");
    expect(reversePaymentMigration).toContain("SET is_paid = false");
    expect(reversePaymentMigration).toContain("WHERE id = v_obligation.id");
    expect(reversePaymentMigration).toContain("v_obligation.credit_card_invoice_id IS DISTINCT FROM v_invoice.id");
    expect(reversePaymentMigration).toContain("v_obligation.financial_kind <> 'card_invoice_obligation'");
    expect(reversePaymentMigration).toContain("obligation.id <> v_obligation.id");
  });

  it("returns the invoice to CLOSED and preserves its closing snapshot", () => {
    expect(reversePaymentMigration).toContain("SET status = 'CLOSED'");
    expect(reversePaymentMigration).toContain("paid_at = NULL");
    expect(reversePaymentMigration).toContain("payment_account_id = NULL");
    expect(reversePaymentMigration).toContain("payment_transaction_id = NULL");
    expect(reversePaymentMigration).not.toContain("closed_total =");
    expect(reversePaymentMigration).not.toContain("closed_at =");
    expect(reversePaymentMigration).not.toContain("actual_closed_at =");
    expect(reversePaymentMigration).not.toContain("due_date =");
    expect(reversePaymentMigration).not.toContain("obligation_transaction_id =");
  });

  it("leaves the reversed invoice eligible for payment or reopening", () => {
    expect(reversePaymentMigration).toContain("SET status = 'CLOSED'");
    expect(reversePaymentMigration).toContain("SET is_paid = false");
    expect(migration).toContain("IF v_invoice.status <> 'CLOSED' THEN RAISE EXCEPTION 'Somente fatura fechada pode ser paga'");
    expect(reopenMigration).toContain("IF v_invoice.status <> 'CLOSED' THEN");
    expect(reopenMigration).toContain("OR v_obligation.is_paid THEN");
  });

  it("does not reassign or remove purchases while reversing payment", () => {
    expect(reversePaymentMigration).not.toContain("SET credit_card_invoice_id");
    expect(reversePaymentMigration).not.toMatch(/DELETE FROM public\.transactions[\s\S]*financial_kind = 'card_purchase'/);
    expect(reversePaymentMigration).toContain("payment.id <> v_payment.id");
  });

  it("keeps invalid payment reversals atomic and protected", () => {
    expect(reversePaymentMigration).toContain("PERFORM set_config('app.invoice_operation', 'reverse_payment', true)");
    expect(reversePaymentMigration).toContain("v_operation IN ('pay', 'reverse_payment')");
    expect(reversePaymentMigration).toContain("OLD.financial_kind = 'card_invoice_payment' AND v_operation = 'reverse_payment'");
    expect(reversePaymentMigration).toContain("RAISE EXCEPTION 'Pagamento da fatura invalido'");
    expect(reversePaymentMigration).toContain("RAISE EXCEPTION 'Fatura possui pagamentos inconsistentes'");
    expect(reversePaymentMigration).toContain("BEGIN;");
    expect(reversePaymentMigration).toContain("COMMIT;");
  });
});
