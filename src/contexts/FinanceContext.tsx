import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { ReceiptDetails, Transaction } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { isBillPaymentTransaction } from "@/lib/transaction-classification";

interface FinanceContextType {
  transactions: Transaction[];
  loading: boolean;
  addTransaction: (t: Omit<Transaction, "id">, options?: { installments?: number; attachments?: File[]; receiptRef?: string }) => Promise<void>;
  updateTransaction: (t: Transaction, options?: { attachments?: File[] }) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  payCardBill: (creditCardId: string, accountId: string, amount: number, date?: string, paymentMethod?: string) => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    if (!user) { setTransactions([]); setLoading(false); return; }
    setLoading(true);
    const [txRes, attRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("transaction_attachments")
        .select("transaction_id"),
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
          isPaid: r.is_paid ?? false,
          hasAttachment: attSet.has(r.id),
          receiptRef: r.receipt_ref || undefined,
          receiptDetails: r.receipt_details && typeof r.receipt_details === "object" && !Array.isArray(r.receipt_details)
            ? r.receipt_details as ReceiptDetails
            : undefined,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const addTransaction = useCallback(async (t: Omit<Transaction, "id">, options?: { installments?: number; attachments?: File[]; receiptRef?: string }) => {
    if (!user) return;
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
        receipt_ref: options?.receiptRef || null,
        receipt_details: t.receiptDetails || null,
      }).select("id").single();
      if (error || !inserted) {
        toast({ title: "Erro ao criar registro", description: error?.message, variant: "destructive" });
        return;
      }
      if (attachments.length > 0) {
        await uploadAttachments(user.id, inserted.id, attachments);
      }
      toast({ title: "Registro criado", description: t.title });
      fetchTransactions();
      return;
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
      installments,
      installment_number: 1,
      receipt_ref: options?.receiptRef || null,
      receipt_details: t.receiptDetails || null,
    }).select("id").single();

    if (parentErr || !parent) {
      toast({ title: "Erro ao criar parcelas", description: parentErr?.message, variant: "destructive" });
      return;
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
        installments,
        installment_number: i,
        parent_transaction_id: parent.id,
      });
    }
    const { error: childErr } = await supabase.from("transactions").insert(rows);
    if (childErr) {
      toast({ title: "Erro nas parcelas", description: childErr.message, variant: "destructive" });
      return;
    }
    if (attachments.length > 0) {
      await uploadAttachments(user.id, parent.id, attachments);
    }
    toast({ title: "Compra parcelada", description: `${installments}x de ${perInstallment.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
    fetchTransactions();
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
      return;
    }
    if (user && options?.attachments && options.attachments.length > 0) {
      await uploadAttachments(user.id, t.id, options.attachments);
    }
    toast({ title: "Registro atualizado", description: t.title });
    fetchTransactions();
  }, [user, fetchTransactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    const transaction = transactions.find((t) => t.id === id);

    if (transaction && isBillPaymentTransaction(transaction)) {
      const { data: paidRows, error: fetchErr } = await supabase
        .from("transactions")
        .select("id")
        .eq("credit_card_id", transaction.creditCardId)
        .eq("is_paid", true)
        .neq("id", id)
        .order("date", { ascending: false })
        .limit(1000);

      if (fetchErr) {
        toast({ title: "Erro ao reabrir fatura", description: fetchErr.message, variant: "destructive" });
        return;
      }

      const idsToReopen: string[] = [];
      let remaining = transaction.amount;
      for (const row of paidRows || []) {
        const paidTransaction = transactions.find((t) => t.id === row.id);
        if (!paidTransaction || isBillPaymentTransaction(paidTransaction)) continue;
        idsToReopen.push(row.id);
        remaining = +(remaining - paidTransaction.amount).toFixed(2);
        if (remaining <= 0.001) break;
      }

      if (idsToReopen.length > 0) {
        const { error: reopenErr } = await supabase
          .from("transactions")
          .update({ is_paid: false })
          .in("id", idsToReopen);
        if (reopenErr) {
          toast({ title: "Erro ao reabrir fatura", description: reopenErr.message, variant: "destructive" });
          return;
        }
      }
    }

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro excluído", variant: "destructive" });
      fetchTransactions();
    }
  }, [fetchTransactions]);

  const payCardBill = useCallback(async (creditCardId: string, accountId: string, amount: number, date?: string, paymentMethod?: string) => {
    if (!user) return;

    // Fetch unpaid card transactions ordered by date asc to apply payment FIFO
    const { data: unpaid, error: fetchErr } = await supabase
      .from("transactions")
      .select("id, amount, date")
      .eq("credit_card_id", creditCardId)
      .eq("is_paid", false)
      .order("date", { ascending: true });

    if (fetchErr) {
      toast({ title: "Erro ao buscar fatura", description: fetchErr.message, variant: "destructive" });
      return;
    }

    const totalUnpaid = (unpaid || []).reduce((s, r) => s + Number(r.amount), 0);
    let remaining = Math.min(amount, totalUnpaid);

    // Mark transactions paid until remaining is exhausted; split last one if partial
    const idsToMark: string[] = [];
    for (const row of unpaid || []) {
      const v = Number(row.amount);
      if (remaining >= v - 0.001) {
        idsToMark.push(row.id);
        remaining = +(remaining - v).toFixed(2);
      } else if (remaining > 0.001) {
        // Partial payment of this transaction: reduce its amount by `remaining` and mark the paid portion
        const paidPortion = +remaining.toFixed(2);
        const leftover = +(v - paidPortion).toFixed(2);
        // Update existing row to leftover (keeps unpaid)
        await supabase.from("transactions").update({ amount: leftover }).eq("id", row.id);
        // Insert a paid sibling for the paid portion
        await supabase.from("transactions").insert({
          user_id: user.id,
          title: "Parcial fatura",
          amount: paidPortion,
          type: "expense",
          category: "Fatura Cartão",
          date: row.date,
          description: "Parte paga de lançamento da fatura",
          credit_card_id: creditCardId,
          is_paid: true,
        });
        remaining = 0;
        break;
      } else {
        break;
      }
    }

    if (idsToMark.length > 0) {
      const { error: updErr } = await supabase
        .from("transactions")
        .update({ is_paid: true })
        .in("id", idsToMark);
      if (updErr) {
        toast({ title: "Erro ao quitar lançamentos", description: updErr.message, variant: "destructive" });
        return;
      }
    }

    // Debit the account: register a transfer-like expense tied to the account, NOT counted as expense in dashboards.
    // We store with a special category "Pagamento Fatura" and link to creditCardId so dashboards can exclude it.
    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: user.id,
      title: "Pagamento de Fatura",
      amount,
      type: "expense",
      category: "Pagamento Fatura",
      date: date || new Date().toISOString().split("T")[0],
      description: "Pagamento de fatura de cartão de crédito",
      payment_method: paymentMethod || "Transferência",
      account_id: accountId,
      credit_card_id: creditCardId,
      is_paid: true,
    });

    if (insertError) {
      toast({ title: "Erro ao registrar pagamento", description: insertError.message, variant: "destructive" });
    } else {
      toast({ title: "Fatura paga!", description: `Pagamento de ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} registrado.` });
      fetchTransactions();
    }
  }, [user, fetchTransactions]);

  return (
    <FinanceContext.Provider value={{ transactions, loading, addTransaction, updateTransaction, deleteTransaction, payCardBill, refetch: fetchTransactions }}>
      {children}
    </FinanceContext.Provider>
  );
};

