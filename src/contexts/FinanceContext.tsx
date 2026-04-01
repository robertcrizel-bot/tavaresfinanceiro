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

  return (
    <FinanceContext.Provider value={{ transactions, loading, addTransaction, updateTransaction, deleteTransaction, refetch: fetchTransactions }}>
      {children}
    </FinanceContext.Provider>
  );
};
