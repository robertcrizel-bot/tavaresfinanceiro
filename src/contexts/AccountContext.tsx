import React, { createContext, useContext, useState, useCallback } from "react";
import { Account, CreditCard } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

const defaultAccounts: Account[] = [
  { id: "acc-1", name: "Conta Principal", bank: "Nubank", type: "checking", initialBalance: 5200, color: "purple" },
  { id: "acc-2", name: "Reserva", bank: "Inter", type: "savings", initialBalance: 12000, color: "orange" },
];

const defaultCards: CreditCard[] = [
  { id: "cc-1", name: "Nubank Platinum", bank: "Nubank", limit: 8000, closingDay: 20, dueDay: 27, color: "purple" },
  { id: "cc-2", name: "Inter Gold", bank: "Inter", limit: 5000, closingDay: 15, dueDay: 22, color: "orange" },
];

interface AccountContextType {
  accounts: Account[];
  creditCards: CreditCard[];
  addAccount: (a: Omit<Account, "id">) => void;
  updateAccount: (a: Account) => void;
  deleteAccount: (id: string) => void;
  addCreditCard: (c: Omit<CreditCard, "id">) => void;
  updateCreditCard: (c: CreditCard) => void;
  deleteCreditCard: (id: string) => void;
}

const AccountContext = createContext<AccountContextType | null>(null);

export const useAccounts = () => {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccounts must be inside AccountProvider");
  return ctx;
};

export const AccountProvider = ({ children }: { children: React.ReactNode }) => {
  const [accounts, setAccounts] = useState<Account[]>(defaultAccounts);
  const [creditCards, setCreditCards] = useState<CreditCard[]>(defaultCards);

  const addAccount = useCallback((a: Omit<Account, "id">) => {
    setAccounts((prev) => [{ ...a, id: `acc-${Date.now()}` }, ...prev]);
    toast({ title: "Conta criada", description: a.name });
  }, []);

  const updateAccount = useCallback((a: Account) => {
    setAccounts((prev) => prev.map((x) => (x.id === a.id ? a : x)));
    toast({ title: "Conta atualizada", description: a.name });
  }, []);

  const deleteAccount = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((x) => x.id !== id));
    toast({ title: "Conta excluída", variant: "destructive" });
  }, []);

  const addCreditCard = useCallback((c: Omit<CreditCard, "id">) => {
    setCreditCards((prev) => [{ ...c, id: `cc-${Date.now()}` }, ...prev]);
    toast({ title: "Cartão criado", description: c.name });
  }, []);

  const updateCreditCard = useCallback((c: CreditCard) => {
    setCreditCards((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    toast({ title: "Cartão atualizado", description: c.name });
  }, []);

  const deleteCreditCard = useCallback((id: string) => {
    setCreditCards((prev) => prev.filter((x) => x.id !== id));
    toast({ title: "Cartão excluído", variant: "destructive" });
  }, []);

  return (
    <AccountContext.Provider value={{ accounts, creditCards, addAccount, updateAccount, deleteAccount, addCreditCard, updateCreditCard, deleteCreditCard }}>
      {children}
    </AccountContext.Provider>
  );
};
