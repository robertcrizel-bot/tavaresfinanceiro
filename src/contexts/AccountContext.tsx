import React, { createContext, useContext, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Account, CreditCard } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { accountService } from "@/services/accountService";

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
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountService.getAccounts,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  const { data: creditCards = [] } = useQuery({
    queryKey: ["creditCards"],
    queryFn: accountService.getCreditCards,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const createAccountMutation = useMutation({
    mutationFn: accountService.createAccount,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Conta criada", description: data.name });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: accountService.updateAccount,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Conta atualizada", description: data.name });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: accountService.deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Conta excluída", variant: "destructive", description: "A conta foi deletada com sucesso." });
    },
  });

  const createCreditCardMutation = useMutation({
    mutationFn: accountService.createCreditCard,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["creditCards"] });
      toast({ title: "Cartão criado", description: data.name });
    },
  });

  const updateCreditCardMutation = useMutation({
    mutationFn: accountService.updateCreditCard,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["creditCards"] });
      toast({ title: "Cartão atualizado", description: data.name });
    },
  });

  const deleteCreditCardMutation = useMutation({
    mutationFn: accountService.deleteCreditCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditCards"] });
      toast({ title: "Cartão excluído", variant: "destructive", description: "Cartão apagado da base." });
    },
  });

  const addAccount = useCallback((a: Omit<Account, "id">) => createAccountMutation.mutate(a), [createAccountMutation]);
  const updateAccount = useCallback((a: Account) => updateAccountMutation.mutate(a), [updateAccountMutation]);
  const deleteAccount = useCallback((id: string) => deleteAccountMutation.mutate(id), [deleteAccountMutation]);

  const addCreditCard = useCallback((c: Omit<CreditCard, "id">) => createCreditCardMutation.mutate(c), [createCreditCardMutation]);
  const updateCreditCard = useCallback((c: CreditCard) => updateCreditCardMutation.mutate(c), [updateCreditCardMutation]);
  const deleteCreditCard = useCallback((id: string) => deleteCreditCardMutation.mutate(id), [deleteCreditCardMutation]);

  return (
    <AccountContext.Provider value={{
      accounts,
      creditCards,
      addAccount,
      updateAccount,
      deleteAccount,
      addCreditCard,
      updateCreditCard,
      deleteCreditCard
    }}>
      {children}
    </AccountContext.Provider>
  );
};
