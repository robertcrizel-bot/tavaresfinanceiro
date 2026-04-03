import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Transaction } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface FinanceContextType {
  transactions: Transaction[];
  loading: boolean;
  addTransaction: (t: Omit<Transaction, "id">) => Promise<void>;
  updateTransaction: (t: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  payCardBill: (creditCardId: string, accountId: string, amount: number) => Promise<void>;
  refetch: () => void;
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
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar registros", description: error.message, variant: "destructive" });
    } else {
      setTransactions(
        (data || []).map((r) => ({
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
          isPaid: (r as any).is_paid ?? false,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const addTransaction = useCallback(async (t: Omit<Transaction, "id">) => {
    if (!user) return;
    const { error } = await supabase.from("transactions").insert({
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
    });
    if (error) {
      toast({ title: "Erro ao criar registro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro criado", description: t.title });
      fetchTransactions();
    }
  }, [user, fetchTransactions]);

  const updateTransaction = useCallback(async (t: Transaction) => {
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
    }).eq("id", t.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro atualizado", description: t.title });
      fetchTransactions();
    }
  }, [fetchTransactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro excluído", variant: "destructive" });
      fetchTransactions();
    }
  }, [fetchTransactions]);

  const payCardBill = useCallback(async (creditCardId: string, accountId: string, amount: number) => {
    if (!user) return;

    // 1. Mark all unpaid transactions for this card as paid
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ is_paid: true })
      .eq("credit_card_id", creditCardId)
      .eq("is_paid", false);

    if (updateError) {
      toast({ title: "Erro ao pagar fatura", description: updateError.message, variant: "destructive" });
      return;
    }

    // 2. Create an expense transaction from the account
    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: user.id,
      title: "Pagamento de Fatura",
      amount,
      type: "expense",
      category: "Fatura Cartão",
      date: new Date().toISOString().split("T")[0],
      description: "Pagamento automático de fatura de cartão de crédito",
      payment_method: "Transferência",
      account_id: accountId,
      credit_card_id: null,
      is_paid: true,
    });

    if (insertError) {
      toast({ title: "Erro ao registrar pagamento", description: insertError.message, variant: "destructive" });
    } else {
      toast({ title: "Fatura paga!", description: "O saldo do cartão foi zerado." });
      fetchTransactions();
    }
  }, [user, fetchTransactions]);

  return (
    <FinanceContext.Provider value={{ transactions, loading, addTransaction, updateTransaction, deleteTransaction, payCardBill, refetch: fetchTransactions }}>
      {children}
    </FinanceContext.Provider>
  );
};
