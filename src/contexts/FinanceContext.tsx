import React, { createContext, useContext, useState, useCallback } from "react";
import { Transaction } from "@/lib/types";
import { initialTransactions } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";

interface FinanceContextType {
  transactions: Transaction[];
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
}

const FinanceContext = createContext<FinanceContextType | null>(null);

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be inside FinanceProvider");
  return ctx;
};

export const FinanceProvider = ({ children }: { children: React.ReactNode }) => {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);

  const addTransaction = useCallback((t: Omit<Transaction, "id">) => {
    const newT: Transaction = { ...t, id: String(Date.now()) };
    setTransactions((prev) => [newT, ...prev]);
    toast({ title: "Registro criado", description: t.title });
  }, []);

  const updateTransaction = useCallback((t: Transaction) => {
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    toast({ title: "Registro atualizado", description: t.title });
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((x) => x.id !== id));
    toast({ title: "Registro excluído", variant: "destructive" });
  }, []);

  return (
    <FinanceContext.Provider value={{ transactions, addTransaction, updateTransaction, deleteTransaction }}>
      {children}
    </FinanceContext.Provider>
  );
};
