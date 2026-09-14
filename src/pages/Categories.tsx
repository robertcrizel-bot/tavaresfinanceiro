import { useState } from "react";
import { useCategories, UserCategory } from "@/contexts/CategoryContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useFinance } from "@/contexts/FinanceContext";
import { calculateCategoryBudgetUsage, calculateCurrentMonthCategorySpending } from "@/lib/financial-calculations";

const typeLabels: Record<string, string> = {
  income: "Entrada",
  expense: "Saída",
  both: "Ambos",
};

const typeBadgeVariant: Record<string, "default" | "destructive" | "secondary"> = {
  income: "default",
  expense: "destructive",
  both: "secondary",
};

export default function Categories() {
  const { categories, addCategory, updateCategory, deleteCategory } = useCategories();
  const { transactions } = useFinance();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserCategory | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<UserCategory["type"]>("expense");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const openNew = () => {
    setEditing(undefined);
    setName("");
    setType("expense");
    setMonthlyBudget("");
    setBudgetError(null);
    setFormOpen(true);
  };
  const openEdit = (cat: UserCategory) => {
    setEditing(cat);
    setName(cat.name);
    setType(cat.type);
    setMonthlyBudget(cat.monthlyBudget == null ? "" : String(cat.monthlyBudget));
    setBudgetError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedBudget = type === "expense" && monthlyBudget.trim() !== "" ? Number(monthlyBudget) : null;
    if (parsedBudget != null && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      setBudgetError("Informe um orçamento maior que zero.");
      return;
    }
    if (editing) {
      await updateCategory(editing.id, name, type, parsedBudget);
    } else {
      await addCategory(name, type, parsedBudget);
    }
    setFormOpen(false);
  };

  const expenseCategories = categories.filter((c) => c.type === "expense" || c.type === "both");
  const incomeCategories = categories.filter((c) => c.type === "income" || c.type === "both");
  const monthlySpending = calculateCurrentMonthCategorySpending(transactions);
  const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const renderList = (list: UserCategory[]) => (
    list.length === 0 ? (
      <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">Nenhuma categoria.</div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((cat) => (
          <div key={cat.id} className="glass-card rounded-xl p-4 animate-fade-in min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{cat.name}</p>
                  <Badge variant={typeBadgeVariant[cat.type]} className="text-xs mt-1">
                    {typeLabels[cat.type]}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button aria-label={`Editar ${cat.name}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button aria-label={`Excluir ${cat.name}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(cat.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            {cat.type === "expense" && cat.monthlyBudget != null && (() => {
              // Transactions reference category names, so renaming does not relink historical rows.
              const spent = monthlySpending[cat.name] || 0;
              const usage = calculateCategoryBudgetUsage(spent, cat.monthlyBudget);
              return (
                <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="font-medium">{formatCurrency(spent)} / {formatCurrency(cat.monthlyBudget)}</span>
                    <span className="text-muted-foreground">{Math.round(usage.percentage)}% utilizado</span>
                  </div>
                  <Progress
                    value={Math.min(usage.percentage, 100)}
                    className={`h-1.5 ${usage.exceeded > 0 ? "[&>div]:bg-destructive" : ""}`}
                  />
                  <p className={usage.exceeded > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                    {usage.exceeded > 0
                      ? `Excedido ${formatCurrency(usage.exceeded)}`
                      : `Disponível ${formatCurrency(usage.available)}`}
                  </p>
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Categorias</h1>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Categoria
        </Button>
      </div>

      <Tabs defaultValue="expense">
        <TabsList>
          <TabsTrigger value="expense">Saída</TabsTrigger>
          <TabsTrigger value="income">Entrada</TabsTrigger>
        </TabsList>
        <TabsContent value="expense" className="mt-4">{renderList(expenseCategories)}</TabsContent>
        <TabsContent value="income" className="mt-4">{renderList(incomeCategories)}</TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
            <DialogDescription>Defina o nome, o tipo e, para saídas, um orçamento mensal opcional.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Investimentos" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => {
                const nextType = v as UserCategory["type"];
                setType(nextType);
                if (nextType !== "expense") {
                  setMonthlyBudget("");
                  setBudgetError(null);
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Saída</SelectItem>
                  <SelectItem value="income">Entrada</SelectItem>
                  <SelectItem value="both">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === "expense" && (
              <div className="space-y-2">
                <Label htmlFor="monthly-budget">Orçamento mensal <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input
                  id="monthly-budget"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={monthlyBudget}
                  onChange={(e) => { setMonthlyBudget(e.target.value); setBudgetError(null); }}
                  placeholder="0,00"
                />
                {budgetError && <p className="text-xs text-destructive">{budgetError}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit">{editing ? "Salvar" : "Criar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>Registros existentes manterão o nome da categoria, mas ela não aparecerá mais como opção.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) deleteCategory(deleting); setDeleting(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
