import { api } from "@/lib/api";
import { Account, CreditCard } from "@/lib/types";

export const accountService = {
  // Accounts
  getAccounts: async (): Promise<Account[]> => {
    const { data } = await api.get("/accounts");
    return data;
  },

  createAccount: async (account: Omit<Account, "id">): Promise<Account> => {
    const { data } = await api.post("/accounts", account);
    return data;
  },

  updateAccount: async (account: Account): Promise<Account> => {
    const { data } = await api.put(`/accounts/${account.id}`, account);
    return data;
  },

  deleteAccount: async (id: string): Promise<void> => {
    await api.delete(`/accounts/${id}`);
  },

  // Credit Cards
  getCreditCards: async (): Promise<CreditCard[]> => {
    const { data } = await api.get("/credit-cards");
    return data;
  },

  createCreditCard: async (card: Omit<CreditCard, "id">): Promise<CreditCard> => {
    const { data } = await api.post("/credit-cards", card);
    return data;
  },

  updateCreditCard: async (card: CreditCard): Promise<CreditCard> => {
    const { data } = await api.put(`/credit-cards/${card.id}`, card);
    return data;
  },

  deleteCreditCard: async (id: string): Promise<void> => {
    await api.delete(`/credit-cards/${id}`);
  },
};
