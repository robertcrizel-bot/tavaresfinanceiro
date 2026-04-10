import { useState, useMemo } from "react";
import { useForecast, RecurringBill } from "@/contexts/ForecastContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Plus, ChevronLeft, ChevronRight, Check, Undo2, Pencil, Trash2, CircleDollarSign, Clock, AlertTriangle } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";

export default function Forecasts() {
  const { bills, payments, loading, addBill, updateBill, deleteBill, markAsPaid, unmarkAsPaid } = useForecast();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formDueDay, setFormDueDay] = useState("1");
  const [formDuration, setFormDuration] = useState("");
  const [formAccountId, setFormAccountId] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const referenceMonth = format(currentMonth, "yyyy-MM");

  // Which bills are active for the current month
  const activeBills = useMemo(() => {
    const [year, month] = referenceMonth.split("-").map(Number);
    const refDate = new Date(year, month - 1, 1);

    return bills.filter((b) => {
      const start = new Date(b.startDate);
      if (refDate < new Date(start.getFullYear(), start.getMonth(), 1)) return false;
      if (b.durationMonths) {
        const end = addMonths(start, b.durationMonths);
        if (refDate >= new Date(end.getFullYear(), end.getMonth(), 1)) return false;
      }
      return true;
    });
  }, [bills, referenceMonth]);

  const getPayment = (billId: string) =>
    payments.find((p) => p.recurringBillId === billId && p.referenceMonth === referenceMonth);

  const getStatus = (bill: RecurringBill) => {
    const payment = getPayment(bill.id);
    if (payment) return "paid";
    const today = new Date();
    const [year, month] = referenceMonth.split("-").map(Number);
    const dueDate = new Date(year, month - 1, bill.dueDay);
    if (today > dueDate) return "overdue";
    return "pending";
  };

  const totalPrevisto = activeBills.reduce((sum, b) => sum + b.amount, 0);
  const totalPago = activeBills.filter((b) => getPayment(b.id)).reduce((sum, b) => sum + b.amount, 0);
  const totalPendente = totalPrevisto - totalPago;

  const openNew = () => {
    setEditingBill(null);
    setFormName(""); setFormAmount(""); setFormCategory(""); setFormDueDay("1");
    setFormDuration(""); setFormAccountId(""); setFormDescription("");
    setDialogOpen(true);
  };

  const openEdit = (bill: RecurringBill) => {
    setEditingBill(bill);
    setFormName(bill.name);
    setFormAmount(String(bill.amount));
    setFormCategory(bill.category);
    setFormDueDay(String(bill.dueDay));
    setFormDuration(bill.durationMonths ? String(bill.durationMonths) : "");
    setFormAccountId(bill.accountId || "");
    setFormDescription(bill.description || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const data = {
      name: formName,
      amount: Number(formAmount),
      category: formCategory,
      dueDay: Number(formDueDay),
      startDate: editingBill?.startDate || new Date().toISOString().split("T")[0],
      durationMonths: formDuration ? Number(formDuration) : null,
      accountId: formAccountId || null,
      description: formDescription || null,
    };
    if (editingBill) {
      await updateBill({ ...data, id: editingBill.id });
    } else {
      await addBill(data);
    }
    setDialogOpen(false);
  };

  const expenseCategories = categories.filter((c) => c.type === "expense");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            Previsões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie suas despesas recorrentes</p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova Previsão
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Previsto</p>
              <p className="text-lg font-bold text-foreground">
                {totalPrevisto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Pago</p>
              <p className="text-lg font-bold text-primary">
                {totalPago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Clock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Pendente</p>
              <p className="text-lg font-bold text-destructive">
                {totalPendente.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold text-foreground capitalize min-w-[160px] text-center">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Bills list */}
      {activeBills.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-8 text-center text-muted-foreground">
            <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma previsão para este mês</p>
            <p className="text-sm mt-1">Clique em "Nova Previsão" para começar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeBills.map((bill) => {
            const status = getStatus(bill);
            const payment = getPayment(bill.id);
            const account = accounts.find((a) => a.id === bill.accountId);

            return (
              <Card key={bill.id} className="border-border bg-card hover:bg-accent/30 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      status === "paid" ? "bg-primary/10" :
                      status === "overdue" ? "bg-destructive/10" :
                      "bg-warning/10"
                    }`}>
                      {status === "paid" ? <Check className="h-4 w-4 text-primary" /> :
                       status === "overdue" ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
                       <Clock className="h-4 w-4 text-warning" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{bill.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Dia {bill.dueDay}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{bill.category}</span>
                        {account && <span>• {account.name}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-foreground">
                      {bill.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>

                    {status === "paid" && payment ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => unmarkAsPaid(payment.id)} title="Desmarcar pagamento">
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"
                        onClick={() => markAsPaid(bill, referenceMonth)} title="Marcar como pago">
                        <Check className="h-4 w-4" />
                      </Button>
                    )}

                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                      onClick={() => openEdit(bill)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => deleteBill(bill.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBill ? "Editar Previsão" : "Nova Previsão"}</DialogTitle>
            <DialogDescription>
              {editingBill ? "Atualize os dados da despesa recorrente" : "Cadastre uma nova despesa recorrente"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Aluguel" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dia do vencimento</Label>
                <Input type="number" min="1" max="31" value={formDueDay} onChange={(e) => setFormDueDay(e.target.value)} />
              </div>
              <div>
                <Label>Duração (meses)</Label>
                <Input type="number" value={formDuration} onChange={(e) => setFormDuration(e.target.value)} placeholder="Indefinido" />
              </div>
            </div>
            <div>
              <Label>Conta vinculada (opcional)</Label>
              <Select value={formAccountId} onValueChange={setFormAccountId}>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!formName || !formAmount || !formCategory}>
              {editingBill ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
