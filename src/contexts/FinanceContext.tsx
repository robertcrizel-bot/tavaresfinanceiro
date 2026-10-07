import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CreditCardInvoice, ReceiptDetails, Transaction } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { isSystemInvoiceTransaction } from "@/lib/transaction-classification";

interface FinanceContextType {
  transactions: Transaction[];
  creditCardInvoices: CreditCardInvoice[];
  loading: boolean;
  addTransaction: (t: Omit<Transaction, "id">, options?: { installments?: number; attachments?: File[]; receiptRef?: string }) => Promise<boolean>;
  updateTransaction: (t: Transaction, options?: { attachments?: File[] }) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<void>;
  closeCardInvoice: (invoiceId: string) => Promise<boolean>;
  payCardInvoice: (invoiceId: string, accountId: string, date?: string, paymentMethod?: string) => Promise<boolean>;
  refetch: () => void;
}

async function uploadAttachments(userId: string, transactionId: string, files: File[]) {
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${transactionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("transaction-attachments")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) {
      toast({ title: "Erro ao anexar arquivo", description: upErr.message, variant: "destructive" });
      continue;
    }
    const { error: insErr } = await supabase.from("transaction_attachments").insert({
      user_id: userId,
      transaction_id: transactionId,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size: file.size,
    });
    if (insErr) {
      toast({ title: "Erro ao salvar anexo", description: insErr.message, variant: "destructive" });
    }
  }
}

const FinanceContext = createContext<FinanceContextType | null>(null);

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be inside FinanceProvider");
  return ctx;
};

export const FinanceProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [creditCardInvoices, setCreditCardInvoices] = useState<CreditCardInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    if (!user) { setTransactions([]); setCreditCardInvoices([]); setLoading(false); return; }
    setLoading(true);
    const [txRes, attRes, invoiceRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("transaction_attachments")
        .select("transaction_id"),
      supabase
        .from("credit_card_invoices")
        .select("*")
        .order("cycle_end", { ascending: true }),
    ]);

    if (txRes.error) {
      toast({ title: "Erro ao carregar registros", description: txRes.error.message, variant: "destructive" });
    } else {
      const attSet = new Set((attRes.data || []).map((a) => a.transaction_id));
      setTransactions(
        (txRes.data || []).map((r) => ({
          id: r.id,
          title: r.title,
          amount: Number(r.amount),
          type: r.type as Transaction["type"],
          category: r.category as Transaction["category"],
          date: r.date,
          description: r.description || undefined,
          paymentMethod: (r.payment_method as Transaction["paymentMethod"]) || undefined,
          accountId: r.account_id || undefined,
          creditCardId: r.credit_card_id || undefined,
          creditCardInvoiceId: r.credit_card_invoice_id || undefined,
          financialKind: r.financial_kind as Transaction["financialKind"],
          isPaid: r.is_paid ?? false,
          hasAttachment: attSet.has(r.id),
          receiptRef: r.receipt_ref || undefined,
          receiptDetails: r.receipt_details && typeof r.receipt_details === "object" && !Array.isArray(r.receipt_details)
            ? r.receipt_details as ReceiptDetails
            : undefined,
          createdAt: r.created_at,
        }))
      );
    }
    if (invoiceRes.error) {
      toast({ title: "Erro ao carregar faturas", description: invoiceRes.error.message, variant: "destructive" });
    } else {
      setCreditCardInvoices((invoiceRes.data || []).map((invoice) => ({
        id: invoice.id,
        creditCardId: invoice.credit_card_id,
        competence: invoice.competence,
        cycleStart: invoice.cycle_start,
        cycleEnd: invoice.cycle_end,
        dueDate: invoice.due_date,
        status: invoice.status as CreditCardInvoice["status"],
        closedTotal: invoice.closed_total == null ? undefined : Number(invoice.closed_total),
        closedAt: invoice.closed_at || undefined,
        paidAt: invoice.paid_at || undefined,
        paymentAccountId: invoice.payment_account_id || undefined,
        obligationTransactionId: invoice.obligation_transaction_id || undefined,
        paymentTransactionId: invoice.payment_transaction_id || undefined,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const addTransaction = useCallback(async (t: Omit<Transaction, "id">, options?: { installments?: number; attachments?: File[]; receiptRef?: string }) => {
    if (!user) return false;
    const installments = options?.installments && options.installments > 1 ? options.installments : 1;
    const attachments = options?.attachments || [];

    // Single (non-installment) insert
    if (installments === 1) {
      const { data: inserted, error } = await supabase.from("transactions").insert({
        user_id: user.id,
        title: t.title,
        amount: t.amount,
        type: t.type,
        category: t.category,
        date: t.date,
        description: t.description || null,
        payment_method: t.paymentMethod || null,
        account_id: t.accountId || null,
        credit_card_id: t.creditCardId || null,
        credit_card_invoice_id: t.creditCardInvoiceId || null,
        financial_kind: t.financialKind || (t.creditCardId ? (t.type === "income" ? "card_refund" : "card_purchase") : "regular"),
        is_paid: t.isPaid ?? false,
        receipt_ref: options?.receiptRef || null,
        receipt_details: t.receiptDetails || null,
      }).select("id").single();
      if (error || !inserted) {
        toast({ title: "Erro ao criar registro", description: error?.message, variant: "destructive" });
        return false;
      }
      if (attachments.length > 0) {
        await uploadAttachments(user.id, inserted.id, attachments);
      }
      toast({ title: "Registro criado", description: t.title });
      await fetchTransactions();
      return true;
    }

    // Installments: split into N monthly transactions on the credit card
    const baseDate = new Date(t.date + "T12:00:00");
    const perInstallment = +(t.amount / installments).toFixed(2);
    const { data: parent, error: parentErr } = await supabase.from("transactions").insert({
      user_id: user.id,
      title: `${t.title} (1/${installments})`,
      amount: perInstallment,
      type: t.type,
      category: t.category,
      date: baseDate.toISOString().split("T")[0],
      description: t.description || null,
      payment_method: t.paymentMethod || null,
      account_id: t.accountId || null,
      credit_card_id: t.creditCardId || null,
      credit_card_invoice_id: t.creditCardInvoiceId || null,
      financial_kind: t.financialKind || (t.creditCardId ? (t.type === "income" ? "card_refund" : "card_purchase") : "regular"),
      is_paid: t.isPaid ?? false,
      installments,
      installment_number: 1,
      receipt_ref: options?.receiptRef || null,
      ...(t.receiptDetails ? { receipt_details: t.receiptDetails } : {}),
    }).select("id").single();

    if (parentErr || !parent) {
      toast({ title: "Erro ao criar parcelas", description: parentErr?.message, variant: "destructive" });
      return false;
    }

    const rows = [];
    for (let i = 2; i <= installments; i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + (i - 1));
      rows.push({
        user_id: user.id,
        title: `${t.title} (${i}/${installments})`,
        amount: perInstallment,
        type: t.type,
        category: t.category,
        date: d.toISOString().split("T")[0],
        description: t.description || null,
        payment_method: t.paymentMethod || null,
        account_id: t.accountId || null,
        credit_card_id: t.creditCardId || null,
        financial_kind: t.financialKind || (t.creditCardId ? (t.type === "income" ? "card_refund" : "card_purchase") : "regular"),
        is_paid: t.isPaid ?? false,
        installments,
        installment_number: i,
        parent_transaction_id: parent.id,
      });
    }
    const { error: childErr } = await supabase.from("transactions").insert(rows);
    if (childErr) {
      const { error: cleanupErr } = await supabase.from("transactions").delete().eq("id", parent.id);
      toast({ title: "Erro nas parcelas", description: childErr.message, variant: "destructive" });
      if (cleanupErr) await fetchTransactions();
      return false;
    }
    if (attachments.length > 0) {
      await uploadAttachments(user.id, parent.id, attachments);
    }
    toast({ title: "Compra parcelada", description: `${installments}x de ${perInstallment.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
    await fetchTransactions();
    return true;
  }, [user, fetchTransactions]);

  const updateTransaction = useCallback(async (t: Transaction, options?: { attachments?: File[] }) => {
    const { error } = await supabase.from("transactions").update({
      title: t.title,
      amount: t.amount,
      type: t.type,
      category: t.category,
      date: t.date,
      description: t.description || null,
      payment_method: t.paymentMethod || null,
      account_id: t.accountId || null,
      credit_card_id: t.creditCardId || null,
      receipt_details: t.receiptDetails || null,
    }).eq("id", t.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return false;
    }
    if (user && options?.attachments && options.attachments.length > 0) {
      await uploadAttachments(user.id, t.id, options.attachments);
    }
    toast({ title: "Registro atualizado", description: t.title });
    await fetchTransactions();
    return true;
  }, [user, fetchTransactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    const transaction = transactions.find((t) => t.id === id);

    if (transaction && isSystemInvoiceTransaction(transaction)) {
      toast({
        title: "Registro protegido",
        description: "Obrigações e pagamentos de fatura só podem ser alterados pela operação financeira correspondente.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro excluído", variant: "destructive" });
      fetchTransactions();
    }
  }, [transactions, fetchTransactions]);

  const closeCardInvoice = useCallback(async (invoiceId: string) => {
    const { error } = await supabase.rpc("close_credit_card_invoice", { p_invoice_id: invoiceId });
    if (error) {
      toast({ title: "Erro ao fechar fatura", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Fatura fechada", description: "O valor do ciclo foi consolidado com sucesso." });
    await fetchTransactions();
    return true;
  }, [fetchTransactions]);

  const payCardInvoice = useCallback(async (invoiceId: string, accountId: string, date?: string, paymentMethod?: string) => {
    const { error } = await supabase.rpc("pay_credit_card_invoice", {
      p_invoice_id: invoiceId,
      p_account_id: accountId,
      p_payment_date: date || new Date().toISOString().split("T")[0],
      p_payment_method: paymentMethod || "Transferência",
    });
    if (error) {
      toast({ title: "Erro ao pagar fatura", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Fatura paga", description: "O valor foi debitado da conta selecionada." });
    await fetchTransactions();
    return true;
  }, [fetchTransactions]);

  return (
    <FinanceContext.Provider value={{ transactions, creditCardInvoices, loading, addTransaction, updateTransaction, deleteTransaction, closeCardInvoice, payCardInvoice, refetch: fetchTransactions }}>
      {children}
    </FinanceContext.Provider>
  );
};

