import { useState, useEffect } from "react";
import { useAccounts } from "@/contexts/AccountContext";
import { Account, CreditCard } from "@/lib/types";
import { useFinance } from "@/contexts/FinanceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Landmark, CreditCard as CreditCardIcon, Receipt, ArrowLeftRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = [
  { value: "purple", label: "Roxo" },
  { value: "orange", label: "Laranja" },
  { value: "blue", label: "Azul" },
  { value: "green", label: "Verde" },
  { value: "red", label: "Vermelho" },
  { value: "pink", label: "Rosa" },
];

const colorClasses: Record<string, string> = {
  purple: "bg-purple-500/10 border-purple-500 text-purple-400",
  orange: "bg-orange-500/10 border-orange-500 text-orange-400",
  blue: "bg-blue-500/10 border-blue-500 text-blue-400",
  green: "bg-green-500/10 border-green-500 text-green-400",
  red: "bg-red-500/10 border-red-500 text-red-400",
  pink: "bg-pink-500/10 border-pink-500 text-pink-400",
};

const colorDot: Record<string, string> = {
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Accounts() {
  const { accounts, creditCards, addAccount, updateAccount, deleteAccount, addCreditCard, updateCreditCard, deleteCreditCard } = useAccounts();
  const { transactions, addTransaction, payCardBill, transferBetweenAccounts } = useFinance();

  const [accFormOpen, setAccFormOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | undefined>();
  const [ccFormOpen, setCcFormOpen] = useState(false);
  const [editingCc, setEditingCc] = useState<CreditCard | undefined>();
  const [deleting, setDeleting] = useState<{ type: "account" | "card"; id: string } | null>(null);
  const [payingCard, setPayingCard] = useState<{ card: CreditCard; amount: number } | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDesc, setTransferDesc] = useState("");

  // Compute account balances
  const getAccountBalance = (accId: string, initialBalance: number) => {
    return transactions.reduce((bal, t) => {
      if (t.accountId !== accId) return bal;
      return t.type === "income" ? bal + t.amount : bal - t.amount;
    }, initialBalance);
  };

  // Compute credit card used
  const getCardUsed = (ccId: string) => {
    return transactions.reduce((total, t) => {
      if (t.creditCardId !== ccId || t.isPaid) return total;
      return total + t.amount;
    }, 0);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">Contas & Cartões</h1>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts" className="gap-2"><Landmark className="h-4 w-4" /> Contas</TabsTrigger>
          <TabsTrigger value="cards" className="gap-2"><CreditCardIcon className="h-4 w-4" /> Cartões</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4 mt-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setTransferOpen(true); setTransferFrom(""); setTransferTo(""); setTransferAmount(""); setTransferDesc(""); }} className="gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Transferir
            </Button>
            <Button onClick={() => { setEditingAcc(undefined); setAccFormOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Conta
            </Button>
          </div>

          {accounts.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">
              Nenhuma conta cadastrada.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => {
                const balance = getAccountBalance(acc.id, acc.initialBalance);
                return (
                  <div key={acc.id} className={`glass-card rounded-xl p-5 border-l-4 animate-fade-in ${colorClasses[acc.color] || "border-primary"}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Landmark className="h-5 w-5" />
                        <div>
                          <p className="font-semibold text-foreground">{acc.name}</p>
                          <p className="text-xs text-muted-foreground">{acc.bank} · {acc.type === "checking" ? "Corrente" : "Poupança"}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingAcc(acc); setAccFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting({ type: "account", id: acc.id })}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className={`text-2xl font-bold ${balance >= 0 ? "text-income" : "text-expense"}`}>{fmt(balance)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Saldo inicial: {fmt(acc.initialBalance)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cards" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingCc(undefined); setCcFormOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Cartão
            </Button>
          </div>

          {creditCards.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">
              Nenhum cartão cadastrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {creditCards.map((cc) => {
                const used = getCardUsed(cc.id);
                const available = cc.limit - used;
                const pct = cc.limit > 0 ? Math.min((used / cc.limit) * 100, 100) : 0;
                return (
                  <div key={cc.id} className={`glass-card rounded-xl p-5 border-l-4 animate-fade-in ${colorClasses[cc.color] || "border-primary"}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <CreditCardIcon className="h-5 w-5" />
                        <div>
                          <p className="font-semibold text-foreground">{cc.name}</p>
                          <p className="text-xs text-muted-foreground">{cc.bank} · Fecha dia {cc.closingDay} · Vence dia {cc.dueDay}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingCc(cc); setCcFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting({ type: "card", id: cc.id })}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-expense">{fmt(used)}</p>
                    <div className="mt-2 w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-expense transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Disponível: {fmt(available)}</span>
                      <span>Limite: {fmt(cc.limit)}</span>
                    </div>
                    {used > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3 gap-2"
                        onClick={() => { setPayingCard({ card: cc, amount: used }); setPayAccountId(""); }}
                      >
                        <Receipt className="h-3.5 w-3.5" /> Pagar Fatura
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Account Form */}
      <AccountFormDialog
        open={accFormOpen}
        onClose={() => { setAccFormOpen(false); setEditingAcc(undefined); }}
        onSubmit={(data) => editingAcc ? updateAccount({ ...data, id: editingAcc.id }) : addAccount(data)}
        initial={editingAcc}
      />

      {/* Credit Card Form */}
      <CreditCardFormDialog
        open={ccFormOpen}
        onClose={() => { setCcFormOpen(false); setEditingCc(undefined); }}
        onSubmit={(data) => editingCc ? updateCreditCard({ ...data, id: editingCc.id }) : addCreditCard(data)}
        initial={editingCc}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleting?.type === "account" ? "conta" : "cartão"}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Registros vinculados perderão a associação.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleting?.type === "account") deleteAccount(deleting.id);
              else if (deleting?.type === "card") deleteCreditCard(deleting.id);
              setDeleting(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay Card Bill Dialog */}
      <AlertDialog open={!!payingCard} onOpenChange={(o) => { if (!o) setPayingCard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pagar Fatura — {payingCard?.card.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Valor da fatura: <strong className="text-foreground">{fmt(payingCard?.amount ?? 0)}</strong>.
              Selecione a conta para debitar o pagamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="mb-2 block">Conta de Pagamento</Label>
            <Select value={payAccountId} onValueChange={setPayAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} — {acc.bank}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!payAccountId}
              onClick={async () => {
                if (payingCard && payAccountId) {
                  await payCardBill(payingCard.card.id, payAccountId, payingCard.amount);
                  setPayingCard(null);
                }
              }}
            >
              Confirmar Pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferência entre Contas</DialogTitle>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const amt = parseFloat(transferAmount);
            if (!transferFrom || !transferTo || !amt || transferFrom === transferTo) return;
            await transferBetweenAccounts(transferFrom, transferTo, amt, transferDesc || undefined);
            setTransferOpen(false);
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Conta de Origem</Label>
              <Select value={transferFrom} onValueChange={setTransferFrom}>
                <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} — {acc.bank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conta de Destino</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger><SelectValue placeholder="Selecione o destino" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== transferFrom).map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} — {acc.bank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} required placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input value={transferDesc} onChange={(e) => setTransferDesc(e.target.value)} placeholder="Ex: Depósito do salário" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setTransferOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!transferFrom || !transferTo || !transferAmount || transferFrom === transferTo}>Transferir</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Account Form ---
function AccountFormDialog({ open, onClose, onSubmit, initial }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Account, "id">) => void;
  initial?: Account;
}) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [type, setType] = useState<"checking" | "savings">("checking");
  const [initialBalance, setInitialBalance] = useState("");
  const [color, setColor] = useState("blue");

  useEffect(() => {
    if (open) {
      if (initial) {
        setName(initial.name);
        setBank(initial.bank);
        setType(initial.type);
        setInitialBalance(String(initial.initialBalance));
        setColor(initial.color);
      } else {
        setName(""); setBank(""); setType("checking"); setInitialBalance(""); setColor("blue");
      }
    }
  }, [open, initial]);

  // Reset on open
  const resetForm = () => {
    if (initial) {
      setName(initial.name); setBank(initial.bank); setType(initial.type);
      setInitialBalance(String(initial.initialBalance)); setColor(initial.color);
    } else {
      setName(""); setBank(""); setType("checking"); setInitialBalance(""); setColor("blue");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar Conta" : "Nova Conta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, bank, type, initialBalance: parseFloat(initialBalance) || 0, color }); onClose(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Conta</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Conta Principal" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Banco</Label>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} required placeholder="Ex: Nubank" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "checking" | "savings")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Corrente</SelectItem>
                  <SelectItem value="savings">Poupança</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Saldo Inicial (R$)</Label>
              <Input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${colorDot[color]}`} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${colorDot[c.value]}`} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{initial ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Credit Card Form ---
function CreditCardFormDialog({ open, onClose, onSubmit, initial }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<CreditCard, "id">) => void;
  initial?: CreditCard;
}) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("20");
  const [dueDay, setDueDay] = useState("27");
  const [color, setColor] = useState("purple");

  const resetForm = () => {
    if (initial) {
      setName(initial.name); setBank(initial.bank); setLimit(String(initial.limit));
      setClosingDay(String(initial.closingDay)); setDueDay(String(initial.dueDay)); setColor(initial.color);
    } else {
      setName(""); setBank(""); setLimit(""); setClosingDay("20"); setDueDay("27"); setColor("purple");
    }
  };

  useEffect(() => {
    if (open) resetForm();
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar Cartão" : "Novo Cartão"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, bank, limit: parseFloat(limit) || 0, closingDay: parseInt(closingDay) || 20, dueDay: parseInt(dueDay) || 27, color }); onClose(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Cartão</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Nubank Platinum" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Banco</Label>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} required placeholder="Ex: Nubank" />
            </div>
            <div className="space-y-2">
              <Label>Limite (R$)</Label>
              <Input type="number" step="0.01" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} required placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Dia Fechamento</Label>
              <Input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dia Vencimento</Label>
              <Input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${colorDot[color]}`} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${colorDot[c.value]}`} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{initial ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
