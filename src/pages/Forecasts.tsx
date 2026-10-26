import { categoryColor, entityColor, colorAccent } from "@/lib/chart-theme";
import { FinanceExportMenu } from "@/components/FinanceExportMenu";
import type { FinancialReport } from "@/lib/financial-data-export";
import { useState, useMemo, useRef } from "react";
import { useForecast, BillPayment, RecurringBill } from "@/contexts/ForecastContext";
import { useAccounts } from "@/contexts/AccountContext";
import { findCashAccount, isCashPaymentMethod } from "@/lib/cash-account";
import { useCategories } from "@/contexts/CategoryContext";
import { useFinance } from "@/contexts/FinanceContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarClock, Plus, ChevronLeft, ChevronRight, Check, Undo2, Pencil, Trash2, CircleDollarSign, Clock, AlertTriangle, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { PAYMENT_METHODS, PaymentMethod } from "@/lib/types";
import { Textarea } from "@/components/ui/textarea";
import { getForecastTemporalStatus, getPaymentForCompetence } from "@/lib/forecast-status";
import { calculateMonthlyCategoryBudgetProjection, simulateForecastBudgetProjection } from "@/lib/financial-calculations";
import {
  getMinimumDurationMonths,
  isRecurringBillActiveInMonth,
  resolveRecurringBill,
  type RecurringBillDeleteScope,
  type RecurringBillEditScope,
} from "@/lib/recurring-bill-editing";

export default function Forecasts() {
  const { bills, payments, loading, addBill, updateBill, deleteBill, markAsPaid, unmarkAsPaid } = useForecast();
  const savingForecastRef = useRef(false);
  const createRequestIdRef = useRef<string | null>(null);
  const [savingForecast, setSavingForecast] = useState(false);
  const { accounts, creditCards } = useAccounts();
  const { categories, getCategoriesByType } = useCategories();
  const { transactions } = useFinance();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  const [editScope, setEditScope] = useState<RecurringBillEditScope | "">("");
  const [deletingBill, setDeletingBill] = useState<RecurringBill | null>(null);
  const [deleteScope, setDeleteScope] = useState<RecurringBillDeleteScope>("this");

  // Pay dialog state
  const [payOpen, setPayOpen] = useState(false);
  const [payBill, setPayBill] = useState<RecurringBill | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod | "">("Transferência");
  const [payAccountId, setPayAccountId] = useState<string>("");
  const [payCreditCardId, setPayCreditCardId] = useState<string>("");
  const [payDescription, setPayDescription] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formType, setFormType] = useState<"expense" | "income">("expense");
  const [formCategory, setFormCategory] = useState("");
  const [formDueDay, setFormDueDay] = useState("1");
  const [formDuration, setFormDuration] = useState("");
  const [formAccountId, setFormAccountId] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const referenceMonth = format(currentMonth, "yyyy-MM");

  // Which bills are active for the current month
  const activeBills = useMemo(() => {
    return bills
      .filter((bill) => isRecurringBillActiveInMonth(bill, referenceMonth))
      .map((bill) => resolveRecurringBill(bill, referenceMonth));
  }, [bills, referenceMonth]);

  const getPayment = (billId: string) => getPaymentForCompetence(payments, billId, referenceMonth);
  const getEffectiveAmount = (bill: RecurringBill, payment: BillPayment) =>
    transactions.find((transaction) => transaction.id === payment.transactionId)?.amount ?? bill.amount;

  const totalPagar = activeBills
    .filter((bill) => bill.type === "expense")
    .reduce((sum, bill) => sum + bill.amount, 0);
  const totalReceber = activeBills
    .filter((bill) => bill.type === "income")
    .reduce((sum, bill) => sum + bill.amount, 0);
  const saldoProjetado = totalReceber - totalPagar;


  // Export uses the same resolved recurring bills and payments currently
  // displayed for the chosen competence month. No recalculation of obligations.
  const exportReport: FinancialReport = {
    worksheetName: "Previsoes",
    fileName: "FinanceControl_Previsoes_" + referenceMonth + ".xlsx",
    title: "Previsões",
    subtitle: "Competência: " + format(currentMonth, "MMMM yyyy", { locale: ptBR }),
    filterDescription: "Somente previsões vigentes para a competência selecionada",
    metrics: [
      { label: "Previsto a pagar", value: totalPagar.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
      { label: "Previsto a receber", value: totalReceber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
      { label: "Saldo projetado", value: saldoProjetado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
      { label: "Quitadas", value: String(activeBills.filter(bill => Boolean(getPayment(bill.id))).length) + " de " + activeBills.length },
    ],
    columns: ["Vencimento", "Previsão", "Categoria", "Tipo", "Previsto", "Efetivo", "Situação", "Descrição"],
    columnWidths: [17, 36, 25, 18, 19, 19, 23, 60],
    amountColumn: "Previsto",
    currencyColumns: ["Previsto", "Efetivo"],
    descriptionColumn: "Descrição",
    rows: activeBills.map(bill => {
      const payment = getPayment(bill.id);
      const status = getForecastTemporalStatus({
        referenceMonth,
        dueDay: bill.dueDay,
        isPaid: Boolean(payment),
        type: bill.type,
      });
      return {
        Vencimento: format(new Date(status.dueDate + "T12:00:00"), "dd/MM/yyyy"),
        "Previsão": bill.name,
        Categoria: bill.category,
        Tipo: bill.type === "income" ? "Entrada" : "Saída",
        Previsto: bill.amount,
        Efetivo: payment ? getEffectiveAmount(bill, payment) : "",
        "Situação": status.label,
        Descrição: bill.description ?? "",
      };
    }),
  };

  const formBudgetProjection = useMemo(() => {
    if (formType !== "expense" || !formCategory) return null;
    const selectedCategory = categories.find((c) => c.name === formCategory && (c.type === "expense" || c.type === "both"));
    if (!selectedCategory || !selectedCategory.monthlyBudget || selectedCategory.monthlyBudget <= 0) return null;
    const persistedProjection = calculateMonthlyCategoryBudgetProjection({
      transactions,
      bills,
      payments,
      categories,
      referenceMonth,
      category: formCategory,
    });
    const editingBillResolved = editingBill && isRecurringBillActiveInMonth(editingBill, referenceMonth) ? resolveRecurringBill(editingBill, referenceMonth) : null;
    const editingBillPayment = editingBill ? getPaymentForCompetence(payments, editingBill.id, referenceMonth) : null;
    const isBillPaid = Boolean(editingBill && editingBillPayment);
    const isBillCommitted = Boolean(editingBillResolved && editingBillResolved.type === "expense" && !isBillPaid);
    const newAmount = Number(formAmount);
    return simulateForecastBudgetProjection({
      persistedProjection,
      editingBillResolved,
      isBillCommitted,
      isBillPaid,
      newAmount,
      newType: formType,
      newCategory: formCategory,
      categories,
    });
  }, [formType, formCategory, formAmount, editingBill, referenceMonth, transactions, payments, categories]);

  const openNew = () => {
    createRequestIdRef.current = crypto.randomUUID();
    setEditingBill(null);
    setEditScope("");
    setFormName(""); setFormAmount(""); setFormType("expense"); setFormCategory(""); setFormDueDay("1");
    setFormDuration(""); setFormAccountId(""); setFormDescription("");
    setDialogOpen(true);
  };

  const openEdit = (bill: RecurringBill) => {
    createRequestIdRef.current = null;
    setEditingBill(bill);
    setFormName(bill.name);
    setFormAmount(String(bill.amount));
    setFormType(bill.type);
    setFormCategory(bill.category);
    setFormDueDay(String(bill.dueDay));
    setFormDuration(bill.durationMonths ? String(bill.durationMonths) : "");
    setFormAccountId(bill.accountId || "");
    setFormDescription(bill.description || "");
    setEditScope("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (savingForecastRef.current) return;
    savingForecastRef.current = true; // immediate lock, independent of React render
    setSavingForecast(true);
    try {
      const data = {
        name: formName,
        amount: Number(formAmount),
        type: formType,
        category: formCategory,
        dueDay: Number(formDueDay),
        startDate: editingBill?.startDate || `${referenceMonth}-01`,
        durationMonths: editingBill && editScope === "this"
          ? editingBill.durationMonths
          : formDuration ? Number(formDuration) : null,
        accountId: formAccountId || null,
        description: formDescription || null,
      };
      if (editingBill) {
        if (!editScope) return;
        await updateBill({ ...editingBill, ...data }, editScope, referenceMonth);
        setDialogOpen(false);
      } else {
        const requestId = createRequestIdRef.current ?? crypto.randomUUID();
        createRequestIdRef.current = requestId;
        const saved = await addBill(data, requestId);
        if (saved) {
          createRequestIdRef.current = null;
          setDialogOpen(false);
        }
      }
    } finally {
      savingForecastRef.current = false;
      setSavingForecast(false);
    }
  };

  const openPay = (bill: RecurringBill) => {
    setPayBill(bill);
    setPayAmount(String(bill.amount));
    const [year, month] = referenceMonth.split("-").map(Number);
    const dueDate = new Date(year, month - 1, bill.dueDay);
    setPayDate(dueDate.toISOString().split("T")[0]);
    setPayMethod("Transferência");
    setPayAccountId(bill.accountId || "");
    setPayCreditCardId("");
    setPayDescription(bill.description || "");
    setPayOpen(true);
  };

  const payIsCreditCard = payMethod === "Cartão de Crédito";

  const handlePayMethodChange = (value: string) => {
    const nextPaymentMethod = value === "none" ? "" : value as PaymentMethod;
    setPayMethod(nextPaymentMethod);
    if (nextPaymentMethod === "Cartão de Crédito") {
      setPayAccountId("");
      return;
    }
    setPayCreditCardId("");
    if (isCashPaymentMethod(nextPaymentMethod)) setPayAccountId(findCashAccount(accounts)?.id ?? "");
  };

  const handleConfirmPay = async () => {
    if (!payBill) return;
    if (payIsCreditCard && !payCreditCardId) return;
    if (isCashPaymentMethod(payMethod) && !payAccountId) return;
    await markAsPaid(payBill, referenceMonth, {
      amount: Number(payAmount),
      date: payDate,
      paymentMethod: payMethod || undefined,
      accountId: payIsCreditCard ? null : payAccountId || null,
      creditCardId: payIsCreditCard ? payCreditCardId : null,
      description: payDescription || null,
    });
    setPayOpen(false);
  };

  const openDelete = (bill: RecurringBill) => {
    setDeletingBill(bill);
    setDeleteScope("this");
  };

  const handleDelete = async () => {
    if (!deletingBill) return;
    await deleteBill(deletingBill.id, deleteScope, referenceMonth);
    setDeletingBill(null);
  };

  const filteredCategories = getCategoriesByType(formType);
  const protectedMonths = editingBill
    ? [referenceMonth, ...payments.filter((payment) => payment.recurringBillId === editingBill.id).map((payment) => payment.referenceMonth)]
    : [];
  const minimumDuration = editingBill ? getMinimumDurationMonths(editingBill.startDate, protectedMonths) : 1;
  const durationInvalid = Boolean(
    editingBill && editScope && editScope !== "this" && formDuration && Number(formDuration) < minimumDuration,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="data-subtle mx-auto max-w-[1500px] space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Planejamento</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-[-0.035em] text-foreground sm:text-3xl"><CalendarClock className="h-5 w-5 text-primary" />Previsões</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Gerencie suas entradas e saídas previstas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <FinanceExportMenu report={exportReport} />
          <Button onClick={openNew} size="sm" className="gap-1.5 whitespace-nowrap">
            <Plus className="h-4 w-4" /> Nova Previsão
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="workspace-panel grid grid-cols-1 overflow-hidden sm:grid-cols-3">
        <Card className="rounded-none border-0 border-b border-border/70 bg-card shadow-none sm:border-b-0 sm:border-r">
          <CardContent className="flex items-center gap-3 p-3.5">
            <div className="p-2 rounded-lg bg-muted">
              <ArrowUpRight className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Previsto a pagar</p>
              <p className="text-lg font-bold text-destructive">
                {totalPagar.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-none border-0 border-b border-border/70 bg-card shadow-none sm:border-b-0 sm:border-r">
          <CardContent className="flex items-center gap-3 p-3.5">
            <div className="p-2 rounded-lg bg-muted">
              <ArrowDownLeft className="h-5 w-5 text-income" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Previsto a receber</p>
              <p className="text-lg font-bold text-income">
                {totalReceber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-none border-0 bg-card shadow-none">
          <CardContent className="flex items-center gap-3 p-3.5">
            <div className="p-2 rounded-lg bg-muted">
              <CircleDollarSign className={`h-5 w-5 ${saldoProjetado > 0 ? "text-income" : saldoProjetado < 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo projetado</p>
              <p className={`text-lg font-bold ${saldoProjetado > 0 ? "text-income" : saldoProjetado < 0 ? "text-destructive" : "text-foreground"}`}>
                {saldoProjetado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base sm:text-lg font-semibold text-foreground capitalize min-w-[130px] sm:min-w-[160px] text-center">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Bills list */}
      {activeBills.length === 0 ? (
        <Card className="mx-auto w-full max-w-[1080px] border-border bg-card">
          <CardContent className="p-6 text-center text-muted-foreground">
            <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma previsão para este mês</p>
            <p className="text-sm mt-1">Clique em "Nova Previsão" para começar</p>
          </CardContent>
        </Card>
      ) : (
        <div aria-label="Lista de previsões" className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-2">
          {activeBills.map((bill) => {
            const payment = getPayment(bill.id);
            const effectiveAmount = payment ? getEffectiveAmount(bill, payment) : bill.amount;
            const effectiveAmountDiffers = Boolean(payment && effectiveAmount !== bill.amount);
            const status = getForecastTemporalStatus({
              referenceMonth,
              dueDay: bill.dueDay,
              isPaid: Boolean(payment),
              type: bill.type,
            });
            const account = accounts.find((a) => a.id === bill.accountId);

            return (
              <Card key={bill.id} className="data-surface min-w-0 border-border bg-card transition-colors hover:bg-accent/30" style={colorAccent(categoryColor(bill.category))}>
                 <CardContent className="grid grid-cols-1 gap-3 px-4 py-3.5 sm:px-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="rounded-lg bg-muted p-2 shrink-0 mt-0.5">
                      {status.kind === "paid" ? <Check className="h-4 w-4 text-primary" /> :
                       status.kind === "overdue" ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
                       <Clock className={`h-4 w-4 ${status.kind === "upcoming" ? "text-muted-foreground" : "text-warning"}`} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-semibold text-[17px] leading-snug text-foreground sm:text-lg">
                        {bill.name}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="neutral-tag min-h-8 shrink-0 px-3 py-1 text-[14px] font-bold leading-none">
                          Dia {Number(status.dueDate.slice(-2))}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`min-h-8 shrink-0 px-3 py-1 text-[14px] font-bold leading-none ${
                            bill.type === "income"
                              ? "neutral-tag text-income"
                              : "neutral-tag text-expense"
                          }`}
                        >
                          {bill.type === "income" ? "Entrada" : "Saída"}
                        </Badge>
                        {status.label && (
                          <Badge
                            variant={status.kind === "overdue" ? "destructive" : status.kind === "paid" ? "default" : "outline"}
                            className={`neutral-tag min-h-8 shrink-0 border px-3 py-1 text-[14px] font-bold leading-none ${
                              status.kind === "due-today" || status.kind === "due-soon"
                                ? "text-warning"
                                : status.kind === "paid" ? "border-income/40 bg-income/10 text-income"
                                : status.kind === "overdue" ? "border-expense/40 bg-expense/10 text-expense" : "text-muted-foreground"
                            }`}
                          >
                            {status.label}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                        <span className="data-chip rounded-md border px-2 py-0.5" style={colorAccent(categoryColor(bill.category))}>{bill.category}</span>
                        {account && (
                          <>
                            <span>•</span>
                            <span className="data-chip rounded-md border px-2 py-0.5" style={colorAccent(entityColor(account.id, account.color))}>{account.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3 text-base md:justify-end md:border-t-0 md:pt-0">
                    {effectiveAmountDiffers ? (
                      <div className="text-left text-sm leading-relaxed md:text-right">
                        <div className="text-muted-foreground">
                          Previsto: {bill.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                        <div className="font-semibold text-foreground">
                          Efetivo: {effectiveAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      </div>
                    ) : (
                      <span className="text-base font-semibold text-foreground">
                        {effectiveAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    )}

                    <div className="flex items-center gap-0.5">
                      {status.kind === "paid" && payment ? (
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                          onClick={() => unmarkAsPaid(payment.id)} title={bill.type === "income" ? "Desmarcar recebimento" : "Desmarcar pagamento"}>
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-primary"
                          onClick={() => openPay(bill)} title={bill.type === "income" ? "Marcar como recebido" : "Marcar como pago"}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}

                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                        onClick={() => openEdit(bill)} title="Editar previsão">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                        onClick={() => openDelete(bill)} title="Excluir previsão">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!savingForecastRef.current) setDialogOpen(open); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>{editingBill ? "Editar Previsão" : "Nova Previsão"}</DialogTitle>
            <DialogDescription>
              {editingBill ? "Atualize os dados da previsão recorrente" : "Cadastre uma nova previsão recorrente"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {editingBill && (
              <div>
                <Label>Aplicar alteração em</Label>
                <Select value={editScope} onValueChange={(value) => setEditScope(value as RecurringBillEditScope)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o alcance" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this">Somente este mês</SelectItem>
                    <SelectItem value="future">Este mês e os próximos</SelectItem>
                    <SelectItem value="all">Toda a recorrência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Nome</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Aluguel" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(value) => { setFormType(value as "expense" | "income"); setFormCategory(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Saída</SelectItem>
                  <SelectItem value="income">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((categoryName) => (
                    <SelectItem key={categoryName} value={categoryName}>{categoryName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formBudgetProjection && (
              <Card className="border border-border bg-muted/30">
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Orçamento de {formCategory}</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Já gasto:</span>
                    <span className="font-medium">
                      {formBudgetProjection.realized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Com esta e outras previsões:</span>
                    <span className="font-medium">
                      {formBudgetProjection.committed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>
                      {formBudgetProjection.projected.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      {" de "}
                      {formBudgetProjection.budget!.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    <span>{Math.round(formBudgetProjection.percentage)}%</span>
                  </div>
                  <Progress
                    value={Math.min(formBudgetProjection.percentage, 100)}
                    className="h-2"
                    style={{ "--category-color": categoryColor(formCategory) } as React.CSSProperties}
                    indicatorClassName={formBudgetProjection.percentage > 100 ? "bg-destructive" : "bg-[var(--category-color)]"}
                  />
                  <p className={`text-xs font-medium ${formBudgetProjection.exceeded > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {formBudgetProjection.exceeded > 0
                      ? `${formBudgetProjection.exceeded.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acima do orçamento`
                      : `${formBudgetProjection.available.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ainda disponíveis`}
                  </p>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dia do vencimento</Label>
                <Input type="number" min="1" max="31" value={formDueDay} onChange={(e) => setFormDueDay(e.target.value)} />
              </div>
              <div>
                <Label>Duração (meses)</Label>
                <Input
                  type="number"
                  min={editingBill && editScope && editScope !== "this" ? minimumDuration : 1}
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  placeholder="Indefinido"
                  disabled={Boolean(editingBill && (!editScope || editScope === "this"))}
                />
                {editingBill && !editScope && (
                  <p className="mt-1 text-xs text-muted-foreground">Escolha o alcance da alteração antes de salvar.</p>
                )}
                {editingBill && editScope === "this" && (
                  <p className="mt-1 text-xs text-muted-foreground">A duração pertence à recorrência e não muda em apenas um mês.</p>
                )}
                {durationInvalid && (
                  <p className="mt-1 text-xs text-destructive">Use no mínimo {minimumDuration} meses para preservar ocorrências já pagas.</p>
                )}
              </div>
            </div>
            <div>
              <Label>Conta vinculada (opcional)</Label>
              <Select value={formAccountId} onValueChange={(value) => setFormAccountId(value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Observações" />
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-0 shrink-0">
            <Button variant="outline" disabled={savingForecast} onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleSave()} disabled={savingForecast || !formName || !formAmount || !formCategory || durationInvalid || Boolean(editingBill && !editScope)}>
              {savingForecast ? "Salvando..." : editingBill ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingBill)} onOpenChange={(open) => !open && setDeletingBill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir previsão recorrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha o alcance da exclusão. Exclusões parciais não apagam o histórico de pagamentos já realizados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup value={deleteScope} onValueChange={(value) => setDeleteScope(value as RecurringBillDeleteScope)}>
            <Label htmlFor="delete-this" className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="this" id="delete-this" className="mt-0.5" />
              <span>
                <span className="block font-medium">Somente este mês</span>
                <span className="block text-sm font-normal text-muted-foreground">Remove apenas a competência selecionada.</span>
              </span>
            </Label>
            <Label htmlFor="delete-future" className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="future" id="delete-future" className="mt-0.5" />
              <span>
                <span className="block font-medium">Este mês e os próximos</span>
                <span className="block text-sm font-normal text-muted-foreground">Mantém as competências anteriores.</span>
              </span>
            </Label>
            <Label htmlFor="delete-all" className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="all" id="delete-all" className="mt-0.5" />
              <span>
                <span className="block font-medium">Toda a recorrência</span>
                <span className="block text-sm font-normal text-muted-foreground">Remove a série completa.</span>
              </span>
            </Label>
          </RadioGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{payBill?.type === "income" ? "Registrar Recebimento" : "Registrar Pagamento"}</DialogTitle>
            <DialogDescription>
              {payBill ? `${payBill.name} — ajuste os dados do ${payBill.type === "income" ? "recebimento" : "pagamento"}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{payBill?.type === "income" ? "Valor recebido (R$)" : "Valor pago (R$)"}</Label>
              <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div>
              <Label>{payBill?.type === "income" ? "Data do recebimento" : "Data do pagamento"}</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div>
              <Label>{payBill?.type === "income" ? "Forma de recebimento" : "Forma de pagamento"}</Label>
              <Select value={payMethod || "none"} onValueChange={handlePayMethodChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!payIsCreditCard && (
              <div>
                <Label>Conta</Label>
                <Select value={payAccountId || "none"} onValueChange={(v) => setPayAccountId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {payIsCreditCard && (
              <div>
                <Label>Cartão de crédito</Label>
                <Select value={payCreditCardId || "none"} onValueChange={(v) => setPayCreditCardId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cartão" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecionar cartão</SelectItem>
                    {creditCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {creditCards.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Nenhum cartão cadastrado.</p>
                )}
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea value={payDescription} onChange={(e) => setPayDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmPay} disabled={!payAmount || !payDate || (payIsCreditCard && !payCreditCardId) || (isCashPaymentMethod(payMethod) && !payAccountId)}>{payBill?.type === "income" ? "Confirmar Recebimento" : "Confirmar Pagamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
