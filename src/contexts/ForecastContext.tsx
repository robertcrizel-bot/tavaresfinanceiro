import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFinance } from "@/contexts/FinanceContext";
import { toast } from "@/hooks/use-toast";
import { runFinancialOperation } from "@/lib/financial-rpc";
import { useFinancialRecovery } from "@/hooks/use-financial-recovery";
import type { Json } from "@/integrations/supabase/types";
import {
  applyRecurringBillEdit,
  applyRecurringBillDeletion,
  normalizeScopedEdits,
  type EditableRecurringBill,
  type RecurringBillDeleteScope,
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
  deleteBill: (id: string, scope: RecurringBillDeleteScope, referenceMonth: string) => Promise<void>;
  markAsPaid: (bill: RecurringBill, referenceMonth: string, overrides?: { amount?: number; date?: string; paymentMethod?: string; accountId?: string | null; creditCardId?: string | null; description?: string | null; }) => Promise<void>;
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
  const { refetch: refetchTransactions } = useFinance();
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const paymentsRef = useRef<BillPayment[]>([]);
  const [loading, setLoading] = useState(true);
  // Local containment only: other tabs/devices still require a database operation.
  const paymentOperations = useRef(new Set<string>());

  const fetchData = useCallback(async () => {
    if (!user) { setBills([]); setPayments([]); paymentsRef.current = []; setLoading(false); return; }
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
        type: r.type === "income" ? "income" : "expense",
        scopedEdits: normalizeScopedEdits(r.scoped_edits),
      })));
    }
    if (paymentsRes.data) {
      const fetchedPayments = paymentsRes.data.map((r) => ({
        id: r.id,
        recurringBillId: r.recurring_bill_id,
        referenceMonth: r.reference_month,
        paidAt: r.paid_at,
        transactionId: r.transaction_id,
      }));
      paymentsRef.current = fetchedPayments;
      setPayments(fetchedPayments);
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
      type: b.type,
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
      type: updatedBill.type,
      scoped_edits: updatedBill.scopedEdits as unknown as Json,
    }).eq("id", updatedBill.id);
    if (error) toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    else { toast({ title: "Previsão atualizada", description: b.name }); fetchData(); }
  }, [bills, fetchData]);

  const deleteBill = useCallback(async (id: string, scope: RecurringBillDeleteScope, referenceMonth: string) => {
    const currentBill = bills.find((item) => item.id === id);
    if (!currentBill) return;
    const updatedBill = applyRecurringBillDeletion(currentBill, scope, referenceMonth);
    const { error } = await supabase.from("recurring_bills").update({
      scoped_edits: updatedBill.scopedEdits as unknown as Json,
    }).eq("id", id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else { toast({ title: "Previsão excluída", variant: "destructive" }); fetchData(); }
  }, [bills, fetchData]);

  const financialFailure = useFinancialRecovery(user?.id, ["mark_forecast_payment", "unmark_forecast_payment"], async () => {
    await Promise.all([fetchData(), refetchTransactions()]);
  });

  const markAsPaid = useCallback(async (bill: RecurringBill, referenceMonth: string, overrides?: { amount?: number; date?: string; paymentMethod?: string; accountId?: string | null; creditCardId?: string | null; description?: string | null; }) => {
    if (!user) return;
    const key = `forecast:${bill.id}:${referenceMonth}`;
    if (paymentOperations.current.has(key)) return;
    paymentOperations.current.add(key);
    try {
      await runFinancialOperation(user.id,key,"mark_forecast_payment",{
        p_bill_id:bill.id,p_reference_month:referenceMonth,p_overrides:overrides ?? {},
      });
      toast({title:bill.type === "income" ? "Recebimento registrado!" : "Conta paga!"});
    } catch(error) { financialFailure("Não foi possível confirmar o pagamento",error); }
    finally {
      try { await Promise.all([fetchData(),refetchTransactions()]); }
      catch(error) { financialFailure("Erro ao atualizar os dados",error); }
      finally { paymentOperations.current.delete(key); }
    }
  },[user,fetchData,refetchTransactions,financialFailure]);

  const unmarkAsPaid = useCallback(async (paymentId: string) => {
    if (!user) return;
    const payment = paymentsRef.current.find(p=>p.id===paymentId);
    if (!payment) { financialFailure("Pagamento não encontrado",new Error("Atualize os dados antes de desmarcar.")); return; }
    const key = `forecast:${payment.recurringBillId}:${payment.referenceMonth}`;
    if (paymentOperations.current.has(key)) return;
    paymentOperations.current.add(key);
    try {
      await runFinancialOperation(user.id,key,"unmark_forecast_payment",{
        p_bill_id:payment.recurringBillId,p_payment_id:paymentId,p_reference_month:payment.referenceMonth,
      });
      toast({title:"Pagamento desmarcado"});
    } catch(error) { financialFailure("Não foi possível confirmar o desfazimento",error); }
    finally {
      try { await Promise.all([fetchData(),refetchTransactions()]); }
      catch(error) { financialFailure("Erro ao atualizar os dados",error); }
      finally { paymentOperations.current.delete(key); }
    }
  },[user,fetchData,refetchTransactions,financialFailure]);

  return (
    <ForecastContext.Provider value={{ bills, payments, loading, addBill, updateBill, deleteBill, markAsPaid, unmarkAsPaid, refetch: fetchData }}>
      {children}
    </ForecastContext.Provider>
  );
};
