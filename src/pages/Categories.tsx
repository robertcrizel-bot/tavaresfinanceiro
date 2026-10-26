import { categoryColor, colorAccent } from "@/lib/chart-theme";
import { useRef, useState } from "react";
import { FinanceExportMenu } from "@/components/FinanceExportMenu";
import type { FinancialReport } from "@/lib/financial-data-export";
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

const categoryKey = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

const groupCategories = (list: UserCategory[]): UserCategory[][] => {
  const groups = new Map<string, UserCategory[]>();
  for (const category of list) {
    const key = categoryKey(category.name) + ":" + category.type;
    const existing = groups.get(key) ?? [];
    existing.push(category);
    groups.set(key, existing);
  }
  return [...groups.values()];
};

export default function Categories() {
  const { categories, addCategory, updateCategory, deleteCategory } = useCategories();
  const { transactions } = useFinance();
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserCategory | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<UserCategory["type"]>("expense");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const savingCategoryRef = useRef(false);
  const [savingCategory, setSavingCategory] = useState(false);

  const openNew = () => {
    setEditing(undefined);
    setName("");
    setType("expense");
    setMonthlyBudget("");
    setBudgetError(null);
    setFormError(null);
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
    if (savingCategoryRef.current) return;
    const parsedBudget = type === "expense" && monthlyBudget.trim() !== "" ? Number(monthlyBudget) : null;
    if (parsedBudget != null && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      setBudgetError("Informe um orçamento maior que zero.");
      return;
    }
    const sameIdentity = Boolean(editing && editing.type === type && categoryKey(editing.name) === categoryKey(name));
    if (!sameIdentity && categories.some((c) => c.id !== editing?.id && c.type === type && categoryKey(c.name) === categoryKey(name))) {
      setFormError("Já existe uma categoria com esse nome e tipo.");
      return;
    }
    savingCategoryRef.current = true;
    setSavingCategory(true);
    try {
      setFormError(null);
      if (editing) {
        await updateCategory(editing.id, name, type, parsedBudget);
        setFormOpen(false);
      } else {
        const saved = await addCategory(name, type, parsedBudget);
        if (saved) setFormOpen(false);
      }
    } finally {
      savingCategoryRef.current = false;
      setSavingCategory(false);
    }
  };

  const expenseCategories = categories.filter((c) => c.type === "expense" || c.type === "both");
  const incomeCategories = categories.filter((c) => c.type === "income" || c.type === "both");
  const duplicateGroups = groupCategories(categories).filter((group) => group.length > 1).length;
  const monthlySpending = calculateCurrentMonthCategorySpending(transactions);
  const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


  // One report includes both groups, independent of the selected screen tab.
  // Categories configured for "both" are shown in each applicable section,
  // but only the expense section contains budget/spending.
  const incomeExportGroups = groupCategories(incomeCategories);
  const expenseExportGroups = groupCategories(expenseCategories);
  const exportCategoryRows = (groups: UserCategory[][], kind: "income" | "expense") => groups
    .map(group => {
      const cat = group.find(item => item.monthlyBudget != null) ?? group[0]!;
      const spent = kind === "expense" ? (monthlySpending[cat.name] || 0) : null;
      return {
        Categoria: cat.name,
        Tipo: kind === "income" ? "Entrada" : "Saída",
        "Orçamento mensal": kind === "expense" ? cat.monthlyBudget ?? "" : "",
        "Gasto no mês": spent ?? "",
        Disponível: kind === "expense" && cat.monthlyBudget != null && spent != null ? cat.monthlyBudget - spent : "",
        Cadastros: group.length,
      };
    }).sort((a, b) => a.Categoria.localeCompare(b.Categoria, "pt-BR"));
  const categoryIncomeRows = exportCategoryRows(incomeExportGroups, "income");
  const categoryExpenseRows = exportCategoryRows(expenseExportGroups, "expense");
  const budgetSum = expenseExportGroups.reduce((sum, group) => {
    const cat = group.find(item => item.monthlyBudget != null) ?? group[0]!;
    return sum + (cat.monthlyBudget ?? 0);
  }, 0);
  const spentSum = expenseExportGroups.reduce((sum, group) => {
    const cat = group.find(item => item.monthlyBudget != null) ?? group[0]!;
    return sum + (monthlySpending[cat.name] ?? 0);
  }, 0);
  const exportReport: FinancialReport = {
    worksheetName: "Categorias",
    fileName: "FinanceControl_Categorias_" + new Date().toISOString().slice(0, 10) + ".xlsx",
    title: "Categorias de entradas e saídas",
    subtitle: "Cadastro completo de categorias · " + new Date().toLocaleDateString("pt-BR"),
    filterDescription: "Entradas primeiro, saídas depois · Orçamentos e despesas do mês atual",
    metrics: [
      { label: "Categorias de entrada", value: String(incomeExportGroups.length) },
      { label: "Categorias de saída", value: String(expenseExportGroups.length) },
      { label: "Orçamentos mensais", value: formatCurrency(budgetSum) },
      { label: "Gastos do mês", value: formatCurrency(spentSum) },
    ],
    columns: ["Categoria", "Tipo", "Orçamento mensal", "Gasto no mês", "Disponível", "Cadastros"],
    columnWidths: [42, 21, 25, 24, 25, 18],
    amountColumn: "Gasto no mês",
    currencyColumns: ["Orçamento mensal", "Gasto no mês", "Disponível"],
    sections: [
      { title: "CATEGORIAS DE ENTRADA", rows: categoryIncomeRows },
      { title: "CATEGORIAS DE SAÍDA", rows: categoryExpenseRows },
    ],
    rows: [...categoryIncomeRows, ...categoryExpenseRows],
  };

  const renderList = (list: UserCategory[]) => (
    list.length === 0 ? (
      <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">Nenhuma categoria.</div>
    ) : (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {groupCategories(list).map((group) => {
          const cat = group.find((item) => item.monthlyBudget != null) ?? group[0]!;
          return (
          <div key={cat.id} className="glass-card data-surface min-w-0 animate-fade-in rounded-xl p-3" style={colorAccent(categoryColor(cat.name))}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="data-chip break-words rounded-md border px-2 py-0.5 font-medium" style={colorAccent(categoryColor(cat.name))}>{cat.name}</p>
                  <Badge variant={typeBadgeVariant[cat.type]} className={`neutral-tag text-xs mt-1 ${cat.type === "income" ? "text-income" : cat.type === "expense" ? "text-expense" : "text-muted-foreground"}`}>
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
                <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5 text-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="font-medium">{formatCurrency(spent)} / {formatCurrency(cat.monthlyBudget)}</span>
                    <span className="text-muted-foreground">{Math.round(usage.percentage)}% utilizado</span>
                  </div>
                  <Progress
                    value={Math.min(usage.percentage, 100)}
                    style={{ "--category-color": categoryColor(cat.name) } as React.CSSProperties}
                    className={`h-1.5 ${usage.exceeded > 0 ? "[&>div]:bg-destructive" : "[&>div]:bg-[var(--category-color)]"}`}
                  />
                  <p className={usage.exceeded > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                    {usage.exceeded > 0
                      ? `Excedido ${formatCurrency(usage.exceeded)}`
                      : `Disponível ${formatCurrency(usage.available)}`}
                  </p>
                </div>
              );
            })()}
            {group.length > 1 && (
              <details className="mt-3 border-t border-border/60 pt-2 text-xs">
                <summary className="cursor-pointer font-medium text-warning">
                  {group.length} cadastros repetidos — revisar
                </summary>
                <div className="mt-2 space-y-2">
                  {group.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border/70 p-2">
                      <span className="min-w-0 break-words text-muted-foreground">
                        Cadastro {index + 1} · {item.monthlyBudget == null ? "Sem orçamento" : "Orçamento " + formatCurrency(item.monthlyBudget)}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <Button aria-label={`Editar cadastro ${index + 1} de ${cat.name}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={`Excluir cadastro ${index + 1} de ${cat.name}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(item.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
          );
        })}
      </div>
    )
  );

  return (
    <div className="data-subtle mx-auto max-w-[1500px] space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <div><p className="eyebrow">Organização</p><h1 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-foreground sm:text-3xl">Categorias</h1></div>
        <div className="flex flex-wrap gap-2">
          <FinanceExportMenu report={exportReport} />
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Categoria
          </Button>
        </div>
      </div>

      {duplicateGroups > 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-[13px] text-muted-foreground">
          {duplicateGroups} categorias com cadastros repetidos foram agrupadas na tela. Os dados e orçamentos estão preservados. Abra "revisar" para conferir cada cadastro.
        </p>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "expense" | "income")}>
        <TabsList>
          <TabsTrigger value="expense">Saída</TabsTrigger>
          <TabsTrigger value="income">Entrada</TabsTrigger>
        </TabsList>
        <TabsContent value="expense" className="mt-3">{renderList(expenseCategories)}</TabsContent>
        <TabsContent value="income" className="mt-3">{renderList(incomeCategories)}</TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && !savingCategoryRef.current && setFormOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
            <DialogDescription>Defina o nome, o tipo e, para saídas, um orçamento mensal opcional.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => { setName(e.target.value); setFormError(null); }} required placeholder="Ex: Investimentos" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => {
                const nextType = v as UserCategory["type"];
                setType(nextType);
                setFormError(null);
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
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" disabled={savingCategory} onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingCategory}>{savingCategory ? "Salvando..." : editing ? "Salvar" : "Criar"}</Button>
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
