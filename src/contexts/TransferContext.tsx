import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getTransferValidationError } from "@/lib/financial-calculations";

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description?: string;
  createdAt: string;
}

interface TransferContextType {
  transfers: Transfer[];
  loading: boolean;
  addTransfer: (t: Omit<Transfer, "id" | "createdAt">) => Promise<void>;
  updateTransfer: (t: Transfer) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;
  refetch: () => void;
}

const TransferContext = createContext<TransferContextType | null>(null);

export const useTransfers = () => {
  const ctx = useContext(TransferContext);
  if (!ctx) throw new Error("useTransfers must be inside TransferProvider");
  return ctx;
};

export const TransferProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const addingTransfer = useRef(false);

  const fetchTransfers = useCallback(async () => {
    if (!user) { setTransfers([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("transfers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar transferências", description: error.message, variant: "destructive" });
    } else {
      setTransfers((data || []).map((r) => ({
        id: r.id,
        fromAccountId: r.from_account_id,
        toAccountId: r.to_account_id,
        amount: Number(r.amount),
        date: r.date,
        description: r.description || undefined,
        createdAt: r.created_at,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  const addTransfer = useCallback(async (t: Omit<Transfer, "id" | "createdAt">) => {
    if (!user) return;
    const validationError = getTransferValidationError(t);
    if (validationError) {
      toast({ title: "Transferência inválida", description: validationError, variant: "destructive" });
      return;
    }
    if (addingTransfer.current) return;
    addingTransfer.current = true;
    try {
      const { error } = await supabase.from("transfers").insert({
        user_id: user.id,
        from_account_id: t.fromAccountId,
        to_account_id: t.toAccountId,
        amount: t.amount,
        date: t.date,
        description: t.description || null,
      });
      if (error) toast({ title: "Erro na transferência", description: error.message, variant: "destructive" });
      else { toast({ title: "Transferência registrada" }); await fetchTransfers(); }
    } finally {
      addingTransfer.current = false;
    }
  }, [user, fetchTransfers]);

  const updateTransfer = useCallback(async (t: Transfer) => {
    const validationError = getTransferValidationError(t);
    if (validationError) {
      toast({ title: "Transferência inválida", description: validationError, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("transfers").update({
      from_account_id: t.fromAccountId,
      to_account_id: t.toAccountId,
      amount: t.amount,
      date: t.date,
      description: t.description || null,
    }).eq("id", t.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Transferência atualizada" }); await fetchTransfers(); }
  }, [fetchTransfers]);

  const deleteTransfer = useCallback(async (id: string) => {
    const { error } = await supabase.from("transfers").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Transferência excluída", variant: "destructive" }); await fetchTransfers(); }
  }, [fetchTransfers]);

  return (
    <TransferContext.Provider value={{ transfers, loading, addTransfer, updateTransfer, deleteTransfer, refetch: fetchTransfers }}>
      {children}
    </TransferContext.Provider>
  );
};
