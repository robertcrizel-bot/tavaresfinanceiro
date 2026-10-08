import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Account, CreditCard } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface AccountContextType {
  accounts: Account[];
  creditCards: CreditCard[];
  loading: boolean;
  addAccount: (a: Omit<Account, "id">) => Promise<void>;
  updateAccount: (a: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  addCreditCard: (c: Omit<CreditCard, "id">) => Promise<void>;
  updateCreditCard: (c: CreditCard) => Promise<void>;
  deleteCreditCard: (id: string) => Promise<void>;
}

const AccountContext = createContext<AccountContextType | null>(null);

export const useAccounts = () => {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccounts must be inside AccountProvider");
  return ctx;
};

export const AccountProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    if (!user) { setAccounts([]); setCreditCards([]); setLoading(false); return; }
    setLoading(true);
    const [accRes, ccRes] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("credit_cards").select("*").order("created_at", { ascending: false }),
    ]);
    if (accRes.data) {
      setAccounts(accRes.data.map((r) => ({
        id: r.id,
        name: r.name,
        bank: r.bank,
        type: r.type as Account["type"],
        initialBalance: Number(r.initial_balance),
        color: r.color,
      })));
    }
    if (ccRes.data) {
      setCreditCards(ccRes.data.map((r) => ({
        id: r.id,
        name: r.name,
        bank: r.bank,
        limit: Number(r.credit_limit),
        closingDay: r.closing_day,
        dueDay: r.due_day,
        color: r.color,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const addAccount = useCallback(async (a: Omit<Account, "id">) => {
    if (!user) return;
    const { error } = await supabase.from("accounts").insert({
      user_id: user.id, name: a.name, bank: a.bank, type: a.type,
      initial_balance: a.initialBalance, color: a.color,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Conta criada", description: a.name }); fetchAccounts(); }
  }, [user, fetchAccounts]);

  const updateAccount = useCallback(async (a: Account) => {
    const { error } = await supabase.from("accounts").update({
      name: a.name, bank: a.bank, type: a.type,
      initial_balance: a.initialBalance, color: a.color,
    }).eq("id", a.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Conta atualizada", description: a.name }); fetchAccounts(); }
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Conta excluída", variant: "destructive" }); fetchAccounts(); }
  }, [fetchAccounts]);

  const addCreditCard = useCallback(async (c: Omit<CreditCard, "id">) => {
    if (!user) return;
    const { error } = await supabase.from("credit_cards").insert({
      user_id: user.id, name: c.name, bank: c.bank, credit_limit: c.limit,
      closing_day: c.closingDay, due_day: c.dueDay, color: c.color,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Cartão criado", description: c.name }); fetchAccounts(); }
  }, [user, fetchAccounts]);

  const updateCreditCard = useCallback(async (c: CreditCard) => {
    const { error } = await supabase.from("credit_cards").update({
      name: c.name, bank: c.bank, credit_limit: c.limit,
      closing_day: c.closingDay, due_day: c.dueDay, color: c.color,
    }).eq("id", c.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Cartão atualizado", description: c.name }); fetchAccounts(); }
  }, [fetchAccounts]);

  const deleteCreditCard = useCallback(async (id: string) => {
    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Cartão excluído", variant: "destructive" }); fetchAccounts(); }
  }, [fetchAccounts]);

  return (
    <AccountContext.Provider value={{ accounts, creditCards, loading, addAccount, updateAccount, deleteAccount, addCreditCard, updateCreditCard, deleteCreditCard }}>
      {children}
    </AccountContext.Provider>
  );
};
