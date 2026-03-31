import React, { createContext, useContext, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Transaction } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { financeService } from "@/services/financeService";

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
  const queryClient = useQueryClient();

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: financeService.getTransactions,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1, // Only retry once before giving up and showing toast interceptor
  });

  const createTransactionMutation = useMutation({
    mutationFn: financeService.createTransaction,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Registro criado", description: data.title });
    },
  });

  const updateTransactionMutation = useMutation({
    mutationFn: financeService.updateTransaction,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Registro atualizado", description: data.title });
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: financeService.deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Registro excluído", variant: "destructive" });
    },
  });

  const addTransaction = useCallback((t: Omit<Transaction, "id">) => createTransactionMutation.mutate(t), [createTransactionMutation]);
  const updateTransaction = useCallback((t: Transaction) => updateTransactionMutation.mutate(t), [updateTransactionMutation]);
  const deleteTransaction = useCallback((id: string) => deleteTransactionMutation.mutate(id), [deleteTransactionMutation]);

  return (
    <FinanceContext.Provider value={{ transactions, addTransaction, updateTransaction, deleteTransaction }}>
      {children}
    </FinanceContext.Provider>
  );
};
