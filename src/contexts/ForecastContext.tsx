import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFinance } from "@/contexts/FinanceContext";
import { toast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";
import {
  applyRecurringBillEdit,
  normalizeScopedEdits,
  type EditableRecurringBill,
  type RecurringBillEditScope,
} from "@/lib/recurring-bill-editing";

export type RecurringBill = EditableRecurringBill;

export interface BillPayment {
  id: string;
  recurringBillId: string;
  referenceMonth: string;
  paidAt: string;
  transactionId: string | null;
}

interface ForecastContextType {
  bills: RecurringBill[];
  payments: BillPayment[];
  loading: boolean;
  addBill: (b: Omit<RecurringBill, "id" | "scopedEdits">) => Promise<void>;
  updateBill: (b: RecurringBill, scope: RecurringBillEditScope, referenceMonth: string) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;
  markAsPaid: (bill: RecurringBill, referenceMonth: string, overrides?: { amount?: number; date?: string; paymentMethod?: string; accountId?: string | null; description?: string | null; }) => Promise<void>;
  unmarkAsPaid: (paymentId: string) => Promise<void>;
  refetch: () => void;
}

const ForecastContext = createContext<ForecastContextType | null>(null);

export const useForecast = () => {
  const ctx = useContext(ForecastContext);
  if (!ctx) throw new Error("useForecast must be inside ForecastProvider");
  return ctx;
};

export const ForecastProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { addTransaction, refetch: refetchTransactions } = useFinance();
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) { setBills([]); setPayments([]); setLoading(false); return; }
    setLoading(true);
    const [billsRes, paymentsRes] = await Promise.all([
      supabase.from("recurring_bills").select("*").order("due_day"),
      supabase.from("bill_payments").select("*").order("paid_at", { ascending: false }),
    ]);
    if (billsRes.data) {
      setBills(billsRes.data.map((r) => ({
        id: r.id,
        name: r.name,
        amount: Number(r.amount),
        category: r.category,
        dueDay: r.due_day,
        startDate: r.start_date,
        durationMonths: r.duration_months,
        accountId: r.account_id,
        description: r.description,
        scopedEdits: normalizeScopedEdits(r.scoped_edits),
      })));
    }
    if (paymentsRes.data) {
      setPayments(paymentsRes.data.map((r) => ({
        id: r.id,
        recurringBillId: r.recurring_bill_id,
        referenceMonth: r.reference_month,
        paidAt: r.paid_at,
        transactionId: r.transaction_id,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addBill = useCallback(async (b: Omit<RecurringBill, "id" | "scopedEdits">) => {
    if (!user) return;
    const { error } = await supabase.from("recurring_bills").insert({
      user_id: user.id,
      name: b.name,
      amount: b.amount,
      category: b.category,
      due_day: b.dueDay,
      start_date: b.startDate,
      duration_months: b.durationMonths,
      account_id: b.accountId,
      description: b.description,
    });
    if (error) toast({ title: "Erro ao criar previsão", description: error.message, variant: "destructive" });
    else { toast({ title: "Previsão criada", description: b.name }); fetchData(); }
  }, [user, fetchData]);

  const updateBill = useCallback(async (b: RecurringBill, scope: RecurringBillEditScope, referenceMonth: string) => {
    const currentBill = bills.find((item) => item.id === b.id);
    if (!currentBill) return;
    const updatedBill = applyRecurringBillEdit(currentBill, b, scope, referenceMonth);
    const { error } = await supabase.from("recurring_bills").update({
      name: updatedBill.name,
      amount: updatedBill.amount,
      category: updatedBill.category,
      due_day: updatedBill.dueDay,
      start_date: updatedBill.startDate,
      duration_months: updatedBill.durationMonths,
      account_id: updatedBill.accountId,
      description: updatedBill.description,
      scoped_edits: updatedBill.scopedEdits as unknown as Json,
    }).eq("id", updatedBill.id);
    if (error) toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    else { toast({ title: "Previsão atualizada", description: b.name }); fetchData(); }
  }, [bills, fetchData]);

  const deleteBill = useCallback(async (id: string) => {
    const { error } = await supabase.from("recurring_bills").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else { toast({ title: "Previsão excluída", variant: "destructive" }); fetchData(); }
  }, [fetchData]);

  const markAsPaid = useCallback(async (bill: RecurringBill, referenceMonth: string, overrides?: { amount?: number; date?: string; paymentMethod?: string; accountId?: string | null; description?: string | null; }) => {
    if (!user) return;

    let dateStr: string;
    if (overrides?.date) {
      dateStr = overrides.date;
    } else {
      const [year, month] = referenceMonth.split("-").map(Number);
      const dueDate = new Date(year, month - 1, bill.dueDay);
      dateStr = dueDate.toISOString().split("T")[0];
    }

    const accountId = overrides?.accountId !== undefined ? overrides.accountId : bill.accountId;

    // Create a real transaction
    const { data: txData, error: txError } = await supabase.from("transactions").insert({
      user_id: user.id,
      title: bill.name,
      amount: overrides?.amount ?? bill.amount,
      type: "expense",
      category: bill.category,
      date: dateStr,
      description: overrides?.description ?? (bill.description || `Pagamento de ${bill.name}`),
      payment_method: overrides?.paymentMethod ?? "Transferência",
      account_id: accountId,
      is_paid: true,
    }).select("id").single();

    if (txError) {
      toast({ title: "Erro ao registrar pagamento", description: txError.message, variant: "destructive" });
      return;
    }

    // Record the payment
    const { error } = await supabase.from("bill_payments").insert({
      user_id: user.id,
      recurring_bill_id: bill.id,
      reference_month: referenceMonth,
      transaction_id: txData?.id || null,
    });

    if (error) {
      toast({ title: "Erro ao marcar como pago", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Conta paga!", description: `${bill.name} — ${referenceMonth}` });
      fetchData();
      refetchTransactions();
    }
  }, [user, fetchData, refetchTransactions]);

  const unmarkAsPaid = useCallback(async (paymentId: string) => {
    // Find the payment to get transaction_id
    const payment = payments.find(p => p.id === paymentId);
    
    // Delete the linked transaction if exists
    if (payment?.transactionId) {
      await supabase.from("transactions").delete().eq("id", payment.transactionId);
    }

    const { error } = await supabase.from("bill_payments").delete().eq("id", paymentId);
    if (error) {
      toast({ title: "Erro ao desmarcar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Pagamento desmarcado" });
      fetchData();
      refetchTransactions();
    }
  }, [payments, fetchData, refetchTransactions]);

  return (
    <ForecastContext.Provider value={{ bills, payments, loading, addBill, updateBill, deleteBill, markAsPaid, unmarkAsPaid, refetch: fetchData }}>
      {children}
    </ForecastContext.Provider>
  );
};
