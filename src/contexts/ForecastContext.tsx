import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFinance } from "@/contexts/FinanceContext";
import { toast } from "@/hooks/use-toast";
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
  addBill: (b: Omit<RecurringBill, "id" | "scopedEdits">, requestId?: string) => Promise<boolean>;
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
  const { addTransaction, refetch: refetchTransactions } = useFinance();
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const paymentsRef = useRef<BillPayment[]>([]);
  const [loading, setLoading] = useState(true);
  // Local containment only: other tabs/devices still require a database operation.
  const paymentOperations = useRef(new Set<string>());
  const billCreateOperations = useRef(new Set<string>());

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

  const addBill = useCallback(async (b: Omit<RecurringBill, "id" | "scopedEdits">, requestId?: string): Promise<boolean> => {
    if (!user) return false;
    const key = requestId ?? `${user.id}:${b.name.trim().toLocaleLowerCase("pt-BR")}:${b.type}:${b.startDate}:${b.dueDay}:${b.accountId ?? ""}`;
    if (billCreateOperations.current.has(key)) return false;
    billCreateOperations.current.add(key);
    try {
      const { error } = await supabase.from("recurring_bills").insert({
        ...(requestId ? { id: requestId } : {}),
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
      if (error) {
        // If a prior attempt was committed but its response was lost, a retry
        // uses the SAME UUID. Confirm this exact persisted row before success.
        if (requestId && error.code === "23505") {
          const { data: existing } = await supabase.from("recurring_bills")
            .select("id").eq("id", requestId).eq("user_id", user.id).maybeSingle();
          if (existing?.id === requestId) {
            toast({ title: "Previsão confirmada", description: b.name });
            await fetchData();
            return true;
          }
        }
        toast({
          title: error.code === "23505" ? "Previsão já cadastrada" : "Erro ao criar previsão",
          description: error.code === "23505" ? "Já existe uma previsão equivalente. Confira a lista antes de criar outra." : error.message,
          variant: "destructive",
        });
        return false;
      }
      toast({ title: "Previsão criada", description: b.name });
      await fetchData();
      return true;
    } catch {
      toast({ title: "Salvamento não confirmado", description: "Confira as previsões antes de tentar novamente. A mesma tentativa será reutilizada.", variant: "destructive" });
      return false;
    } finally {
      billCreateOperations.current.delete(key);
    }
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

  const markAsPaid = useCallback(async (bill: RecurringBill, referenceMonth: string, overrides?: { amount?: number; date?: string; paymentMethod?: string; accountId?: string | null; creditCardId?: string | null; description?: string | null; }) => {
    if (!user) return;
    const key = `${user.id}:${bill.id}:${referenceMonth}`;
    if (paymentOperations.current.has(key)) return;
    if (paymentsRef.current.some(p => p.recurringBillId === bill.id && p.referenceMonth === referenceMonth)) {
      toast({ title: "Pagamento já registrado", description: "Atualize os dados para conferir o pagamento existente." });
      return;
    }
    paymentOperations.current.add(key);
    let writeStarted = false;
    try {
      let dateStr: string;
      if (overrides?.date) {
        dateStr = overrides.date;
      } else {
        const [year, month] = referenceMonth.split("-").map(Number);
        const dueDate = new Date(year, month - 1, bill.dueDay);
        dateStr = dueDate.toISOString().split("T")[0];
      }

      // When paying with a credit card, the transaction should not have an account_id
      // because the payment is made via credit card (the account will be debited when the invoice is paid)
      const isCreditCardPayment = overrides?.creditCardId !== undefined && overrides.creditCardId !== null;
      const accountId = isCreditCardPayment ? null : (overrides?.accountId !== undefined ? overrides.accountId : bill.accountId);

      // Create a real transaction
      writeStarted = true;
      const { data: txData, error: txError } = await supabase.from("transactions").insert({
        user_id: user.id,
        title: bill.name,
        amount: overrides?.amount ?? bill.amount,
        type: bill.type,
        category: bill.category,
        date: dateStr,
        description: overrides?.description ?? (bill.description || (bill.type === "income" ? `Recebimento de ${bill.name}` : `Pagamento de ${bill.name}`)),
        payment_method: overrides?.paymentMethod ?? "Transferência",
        account_id: accountId,
        credit_card_id: overrides?.creditCardId ?? null,
        is_paid: true,
      }).select("id").single();

      if (txError || !txData?.id) {
        toast({ title: bill.type === "income" ? "Erro ao registrar recebimento" : "Erro ao registrar pagamento", description: txError?.message ?? "O lançamento não foi confirmado. Confira os registros antes de tentar novamente.", variant: "destructive" });
        return;
      }

      // Record the payment
      const { error } = await supabase.from("bill_payments").insert({
        user_id: user.id,
        recurring_bill_id: bill.id,
        reference_month: referenceMonth,
        transaction_id: txData.id,
      });

      if (error) {
        toast({ title: bill.type === "income" ? "Erro ao marcar como recebido" : "Erro ao marcar como pago", description: `${error.message} O lançamento pode ter sido criado. Confira os registros antes de tentar novamente.`, variant: "destructive" });
      } else {
        toast({ title: bill.type === "income" ? "Recebimento registrado!" : "Conta paga!", description: `${bill.name} — ${referenceMonth}` });
      }
    } catch {
      toast({ title: "Não foi possível confirmar o pagamento", description: "Confira os registros antes de tentar novamente. A operação pode ter sido gravada parcialmente.", variant: "destructive" });
    } finally {
      try {
        if (writeStarted) await Promise.all([fetchData(), refetchTransactions()]);
      } catch {
        toast({ title: "Erro ao atualizar os dados", description: "Recarregue os registros antes de tentar novamente.", variant: "destructive" });
      } finally {
        paymentOperations.current.delete(key);
      }
    }
  }, [user, fetchData, refetchTransactions]);

  const unmarkAsPaid = useCallback(async (paymentId: string) => {
    if (!user) return;
    // Find the payment to get transaction_id
    const payment = payments.find(p => p.id === paymentId);
    const bill = payment ? bills.find(b => b.id === payment.recurringBillId) : null;
    if (!payment?.transactionId) {
      toast({ title: "Erro ao desmarcar", description: "Pagamento ou lançamento vinculado não encontrado. Atualize os dados e confira os registros.", variant: "destructive" });
      return;
    }
    const key = `${user.id}:${payment.recurringBillId}:${payment.referenceMonth}`;
    if (paymentOperations.current.has(key)) return;
    paymentOperations.current.add(key);
    try {
      // Confirm deletion before removing the link; this is still not atomic.
      const { data: deletedTransactions, error: transactionError } = await supabase.from("transactions").delete().eq("id", payment.transactionId).select("id");
      if (transactionError || deletedTransactions?.length !== 1) {
        toast({ title: "Erro ao desmarcar", description: transactionError?.message ?? "A exclusão do lançamento não foi confirmada. O vínculo foi preservado.", variant: "destructive" });
        return;
      }

      const { data: deletedPayments, error } = await supabase.from("bill_payments").delete().eq("id", paymentId).select("id");
      if (error || deletedPayments?.length !== 1) {
        toast({ title: "Erro ao desmarcar", description: `${error?.message ?? "A exclusão do pagamento não foi confirmada."} O lançamento foi excluído; confira os registros antes de tentar novamente.`, variant: "destructive" });
      } else {
        toast({ title: bill?.type === "income" ? "Recebimento desmarcado" : "Pagamento desmarcado" });
      }
    } catch {
      toast({ title: "Erro ao desmarcar", description: "Não foi possível confirmar o desfazimento. Confira os registros; pode haver alteração parcial.", variant: "destructive" });
    } finally {
      try {
        await Promise.all([fetchData(), refetchTransactions()]);
      } catch {
        toast({ title: "Erro ao atualizar os dados", description: "Recarregue os registros antes de tentar novamente.", variant: "destructive" });
      } finally {
        paymentOperations.current.delete(key);
      }
    }
  }, [user, payments, bills, fetchData, refetchTransactions]);

  return (
    <ForecastContext.Provider value={{ bills, payments, loading, addBill, updateBill, deleteBill, markAsPaid, unmarkAsPaid, refetch: fetchData }}>
      {children}
    </ForecastContext.Provider>
  );
};
