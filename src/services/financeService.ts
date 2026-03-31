import { api } from "@/lib/api";
import { Transaction } from "@/lib/types";

export const financeService = {
  getTransactions: async (): Promise<Transaction[]> => {
    const { data } = await api.get("/transactions");
    return data;
  },

  createTransaction: async (transaction: Omit<Transaction, "id">): Promise<Transaction> => {
    const { data } = await api.post("/transactions", transaction);
    return data;
  },

  updateTransaction: async (transaction: Transaction): Promise<Transaction> => {
    const { data } = await api.put(`/transactions/${transaction.id}`, transaction);
    return data;
  },

  deleteTransaction: async (id: string): Promise<void> => {
    await api.delete(`/transactions/${id}`);
  },
};
