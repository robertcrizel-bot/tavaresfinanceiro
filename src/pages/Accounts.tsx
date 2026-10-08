import { useState, useEffect } from "react";
import { useAccounts } from "@/contexts/AccountContext";
import { useTransfers } from "@/contexts/TransferContext";
import { Account, CreditCard, CreditCardInvoice, Transaction } from "@/lib/types";
import { useFinance } from "@/contexts/FinanceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Landmark, CreditCard as CreditCardIcon, Receipt, ArrowLeftRight, FileText, RotateCcw, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInvoiceCompetence, getCardCommittedAmount, getCreditCardCycle, getInvoiceAmount, getInvoiceClosingCandidates, getInvoiceClosingPreviewAmount, selectCardInvoice } from "@/lib/credit-card-billing";
import { calculateAccountBalances } from "@/lib/financial-calculations";
import AccountStatementDialog from "@/components/AccountStatementDialog";
import CreditCardStatementDialog from "@/components/CreditCardStatementDialog";

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
const fmtDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDateTime = (date: string) => new Date(date).toLocaleDateString("pt-BR");

export default function Accounts() {
  const { accounts, creditCards, addAccount, updateAccount, deleteAccount, addCreditCard, updateCreditCard, deleteCreditCard } = useAccounts();
  const { transactions, creditCardInvoices, addTransaction, closeCardInvoice, reopenCardInvoice, payCardInvoice, reverseCardInvoicePayment } = useFinance();
  const { transfers, addTransfer } = useTransfers();

  const [accFormOpen, setAccFormOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | undefined>();
  const [ccFormOpen, setCcFormOpen] = useState(false);
  const [editingCc, setEditingCc] = useState<CreditCard | undefined>();
  const [deleting, setDeleting] = useState<{ type: "account" | "card"; id: string } | null>(null);
  const [closingInvoice, setClosingInvoice] = useState<{ card: CreditCard; invoice: CreditCardInvoice } | null>(null);
  const [closingInvoiceActualDate, setClosingInvoiceActualDate] = useState("");
  const [closingInvoiceDueDate, setClosingInvoiceDueDate] = useState("");
  const [closingInvoiceExcludedIds, setClosingInvoiceExcludedIds] = useState<string[]>([]);
  const [reopeningInvoice, setReopeningInvoice] = useState<CreditCardInvoice | null>(null);
  const [reversingPaymentInvoice, setReversingPaymentInvoice] = useState<CreditCardInvoice | null>(null);
  const [historyCard, setHistoryCard] = useState<CreditCard | null>(null);
  const [payingCard, setPayingCard] = useState<{ card: CreditCard; invoice: CreditCardInvoice; amount: number } | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState("Transferência");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDesc, setTransferDesc] = useState("");
  const [statementAccount, setStatementAccount] = useState<{ id: string; name: string; initialBalance: number } | null>(null);
  const [statementCard, setStatementCard] = useState<{ id: string; name: string; limit: number; closingDay: number; dueDay: number; invoice?: CreditCardInvoice } | null>(null);

  const accountBalances = calculateAccountBalances(accounts, transactions, transfers);
const getOpenInvoice = (cardId: string) => creditCardInvoices
    .filter((invoice) => invoice.creditCardId === cardId && invoice.status === "OPEN")
    .sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd))[0];

  const handleExcludeToggle = (transactionId: string) => {
    setClosingInvoiceExcludedIds((prev) =>
      prev.includes(transactionId)
        ? prev.filter((id) => id !== transactionId)
        : [...prev, transactionId]
    );
  };

  const getClosingCandidates = (invoice: CreditCardInvoice, actualClosedDate: string) =>
    getInvoiceClosingCandidates(transactions, invoice, creditCardInvoices, actualClosedDate);

  const openClosingInvoice = (card: CreditCard, invoice: CreditCardInvoice) => {
    const candidates = getClosingCandidates(invoice, invoice.cycleEnd);
    setClosingInvoice({ card, invoice });
    setClosingInvoiceActualDate(invoice.cycleEnd);
    setClosingInvoiceDueDate(invoice.dueDate);
    setClosingInvoiceExcludedIds(candidates
      .filter((candidate) => candidate.isManuallyExcluded)
      .map((candidate) => candidate.transaction.id));
  };

  const closingCandidates = closingInvoice
    ? getClosingCandidates(closingInvoice.invoice, closingInvoiceActualDate || closingInvoice.invoice.cycleEnd)
    : [];
  const closingPreviewAmount = getInvoiceClosingPreviewAmount(closingCandidates, closingInvoiceExcludedIds);

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
                const balance = accountBalances[acc.id];
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 gap-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setStatementAccount({ id: acc.id, name: acc.name, initialBalance: acc.initialBalance })}
                    >
                      <FileText className="h-3.5 w-3.5" /> Ver extrato
                    </Button>
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
                const used = getCardCommittedAmount(transactions, cc.id, creditCardInvoices);
                const invoice = selectCardInvoice(creditCardInvoices, transactions, cc.id);
                const hasMovements = (candidate: CreditCardInvoice) => transactions.some((transaction) =>
                  transaction.creditCardInvoiceId === candidate.id &&
                  transaction.financialKind !== "card_invoice_obligation" &&
                  transaction.financialKind !== "card_invoice_payment");
                const nextOpenInvoice = invoice?.status === "CLOSED"
                  ? creditCardInvoices
                    .filter((candidate) => candidate.creditCardId === cc.id && candidate.status === "OPEN" && candidate.id !== invoice.id)
                    .sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd))
                    .find(hasMovements)
                  : undefined;
                const fallbackCycle = getCreditCardCycle(cc.closingDay, cc.dueDay);
                const today = new Date().toISOString().split("T")[0];
                const currentInvoice = invoice ? getInvoiceAmount(transactions, invoice) : 0;
                const available = cc.limit - used;
                const pct = cc.limit > 0 ? Math.min((used / cc.limit) * 100, 100) : 0;
                const status = invoice?.status || "OPEN";
                const cycleEnd = invoice?.cycleEnd || fallbackCycle.cycleEnd;
                const dueDate = invoice?.dueDate || fallbackCycle.dueDate;
                const paymentAccount = invoice?.paymentAccountId
                  ? accounts.find((account) => account.id === invoice.paymentAccountId)
                  : undefined;
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
                    <p className="text-xs text-muted-foreground">Limite comprometido</p>
                    <p className="text-2xl font-bold text-expense">{fmt(used)}</p>
                    <div className="mt-2 w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-expense transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Disponível: {fmt(available)}</span>
                      <span>Limite: {fmt(cc.limit)}</span>
                    </div>
                    <div className="mt-4 rounded-lg border border-border/70 bg-background/30 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Fatura atual</p>
                          <p className="text-xl font-bold text-foreground">{fmt(currentInvoice)}</p>
                        </div>
                        <Badge variant={status === "PAID" ? "default" : status === "CLOSED" ? "destructive" : "secondary"}>
                          {status === "PAID" ? "Paga" : status === "CLOSED" ? "Fechada" : "Aberta"}
                        </Badge>
                      </div>
{invoice && <p className="text-xs capitalize text-muted-foreground">Competência: {formatInvoiceCompetence(invoice.competence)}</p>}
                      <p className="text-xs text-muted-foreground">
                        {status === "PAID" && invoice?.paidAt
                          ? `Paga em ${fmtDateTime(invoice.paidAt)}`
                          : status === "CLOSED"
                            ? (invoice?.actualClosedAt
                                ? `Fechada em ${fmtDateTime(invoice.actualClosedAt)} · Vencimento ${fmtDate(dueDate)}`
                                : `Fechada em ${fmtDateTime(invoice.closedAt)} · Vencimento ${fmtDate(dueDate)}`)
                            : `Fechamento previsto: ${fmtDate(cycleEnd)} · Vence em ${fmtDate(dueDate)}`}
                      </p>
                      {status === "PAID" && paymentAccount && (
                        <p className="text-xs text-muted-foreground">Conta: {paymentAccount.name}</p>
                      )}
                    </div>
<div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setStatementCard({ id: cc.id, name: cc.name, limit: cc.limit, closingDay: cc.closingDay, dueDay: cc.dueDay, invoice })}
                      >
                        <FileText className="h-3.5 w-3.5" /> Ver compras
                      </Button>
                      {creditCardInvoices.some((candidate) => candidate.creditCardId === cc.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setHistoryCard(cc)}
                        >
                          <History className="h-3.5 w-3.5" /> Histórico de faturas
                        </Button>
                      )}
{status === "OPEN" && invoice && invoice.cycleStart <= today && hasMovements(invoice) && (
                        <Button size="sm" variant="outline" onClick={() => openClosingInvoice(cc, invoice)}>
                          Fechar fatura
                        </Button>
                      )}
                      {status === "CLOSED" && invoice && (
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => {
                          setPayingCard({ card: cc, invoice, amount: currentInvoice });
                          setPayAccountId("");
                          setPayDate(new Date().toISOString().split("T")[0]);
                          setPayMethod("Transferência");
                        }}>
                          <Receipt className="h-3.5 w-3.5" /> Pagar fatura
                        </Button>
                      )}
                      {status === "CLOSED" && invoice && (
                        <Button size="sm" variant="ghost" className="gap-2 text-xs text-muted-foreground" onClick={() => setReopeningInvoice(invoice)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Reabrir fatura
                        </Button>
                      )}
                      {status === "PAID" && invoice && (
                        <Button size="sm" variant="ghost" className="gap-2 text-xs text-muted-foreground" onClick={() => setReversingPaymentInvoice(invoice)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Estornar pagamento
                        </Button>
                      )}
                    </div>
                    {nextOpenInvoice && (
                      <div className="mt-3 rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground">
                        <p>Próxima fatura aberta: <strong>{fmt(getInvoiceAmount(transactions, nextOpenInvoice))}</strong></p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStatementCard({ id: cc.id, name: cc.name, limit: cc.limit, closingDay: cc.closingDay, dueDay: cc.dueDay, invoice: nextOpenInvoice })}>
                            Ver compras
                          </Button>
{nextOpenInvoice.cycleStart <= today && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openClosingInvoice(cc, nextOpenInvoice)}>
                              Fechar próxima
                            </Button>
                          )}
                        </div>
                      </div>
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
        currentBalance={editingAcc ? accountBalances[editingAcc.id] : 0}
        onAdjustBalance={async (accId, diff) => {
          await addTransaction({
            title: "Ajuste de Saldo",
            amount: Math.abs(diff),
            type: diff > 0 ? "income" : "expense",
            category: "Outros",
            date: new Date().toISOString().split("T")[0],
            description: "Ajuste manual de saldo da conta",
            paymentMethod: "Outro",
            accountId: accId,
            financialKind: "manual_adjustment",
            isPaid: true,
          });
        }}
      />

      {/* Credit Card Form */}
      <CreditCardFormDialog
        open={ccFormOpen}
        onClose={() => { setCcFormOpen(false); setEditingCc(undefined); }}
        onSubmit={(data) => editingCc ? updateCreditCard({ ...data, id: editingCc.id }) : addCreditCard(data)}
        initial={editingCc}
        currentUsed={editingCc && getOpenInvoice(editingCc.id) ? getInvoiceAmount(transactions, getOpenInvoice(editingCc.id)!) : 0}
        canAdjustUsed={!editingCc || Boolean(getOpenInvoice(editingCc.id))}
        onAdjustUsed={async (cardId, diff) => {
          // diff > 0 means we need to INCREASE the bill -> add expense on card
          // diff < 0 means we need to DECREASE the bill -> add income (refund) on card
          return addTransaction({
            title: "Ajuste de Fatura",
            amount: Math.abs(diff),
            type: diff > 0 ? "expense" : "income",
            category: "Outros",
            date: new Date().toISOString().split("T")[0],
            description: "Ajuste manual da fatura do cartão",
            paymentMethod: "Outro",
            creditCardId: cardId,
            financialKind: "manual_adjustment",
            isPaid: false,
          });
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleting?.type === "account" ? "conta" : "cartão"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Cartões com histórico de faturas são preservados e não podem ser excluídos.
            </AlertDialogDescription>
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

      {/* Close Invoice Confirmation */}
      <Dialog open={!!closingInvoice} onOpenChange={(open) => { if (!open) { setClosingInvoice(null); setClosingInvoiceActualDate(""); setClosingInvoiceDueDate(""); setClosingInvoiceExcludedIds([]); } }}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-full">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
            <DialogTitle>Fechar fatura?</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6">
            <div className="shrink-0 space-y-4 py-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cartão</span>
                  <span className="font-medium text-foreground">{closingInvoice?.card.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Competência</span>
                  <span className="font-medium capitalize text-foreground">{closingInvoice ? formatInvoiceCompetence(closingInvoice.invoice.competence) : ""}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="invoice-closing-date" className="text-sm font-normal text-muted-foreground">Fechamento</Label>
                  <Input
                    id="invoice-closing-date"
                    type="date"
                    value={closingInvoiceActualDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setClosingInvoiceActualDate(nextDate);
                      setClosingInvoiceExcludedIds(closingInvoice
                        ? getClosingCandidates(closingInvoice.invoice, nextDate)
                          .filter((candidate) => candidate.isManuallyExcluded)
                          .map((candidate) => candidate.transaction.id)
                        : []);
                    }}
                    min={closingInvoice?.invoice.cycleStart}
                    className="h-8 min-w-0 w-40 max-w-[60%] text-sm"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="invoice-due-date" className="text-sm font-normal text-muted-foreground">Vencimento</Label>
                  <Input
                    id="invoice-due-date"
                    type="date"
                    value={closingInvoiceDueDate}
                    onChange={(e) => setClosingInvoiceDueDate(e.target.value)}
                    className="h-8 min-w-0 w-40 max-w-[60%] text-sm"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor da fatura</span>
                  <span className="font-semibold text-foreground">
                    {fmt(closingPreviewAmount)}
                  </span>
                </div>
              </div>
            </div>
            {closingInvoice && (
              <div className="flex min-h-0 flex-1 flex-col border-t border-border pt-4">
                <div className="shrink-0">
                  <p className="mb-1 text-sm font-medium">Compras incluídas nesta fatura</p>
                  <p className="mb-2 text-xs text-muted-foreground">Selecione as compras que devem ir para a próxima fatura.</p>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {(() => {
                    if (closingCandidates.length === 0) {
                      return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma compra elegível neste período.</p>;
                    }
                    return [...closingCandidates]
                      .sort((a, b) => {
                        if (a.transaction.date !== b.transaction.date) return b.transaction.date.localeCompare(a.transaction.date);
                        return a.transaction.id.localeCompare(b.transaction.id);
                      })
                      .map((candidate) => {
                        const tx = candidate.transaction;
                        const isExcluded = closingInvoiceExcludedIds.includes(tx.id);
                        return (
                          <div key={tx.id} className={`flex items-center gap-2 py-2 px-2 border-b border-border last:border-0 ${isExcluded ? "opacity-50 bg-muted/50" : ""}`}>
                            <input
                              type="checkbox"
                              checked={isExcluded}
                              onChange={() => handleExcludeToggle(tx.id)}
                              className="h-4 w-4 rounded border-input"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{tx.title}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{fmtDate(tx.date)}</span>
                                {tx.category && <span>· {tx.category}</span>}
                                {candidate.isFromNextInvoice && !candidate.isManuallyExcluded && <span className="text-primary">· Próxima fatura (automático)</span>}
                                {isExcluded && <span className="text-orange">· Movida para próxima</span>}
                              </div>
                            </div>
                            <span className={`text-sm font-semibold whitespace-nowrap ${tx.type === "income" ? "text-income" : "text-expense"}`}>
                              {tx.type === "income" ? "-" : ""} {fmt(tx.amount)}
                            </span>
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>
            )}
            <p className="shrink-0 border-t border-border py-3 text-xs text-muted-foreground">
              O valor será congelado e uma obrigação neutra será criada em Meus Registros.
            </p>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-4 sm:px-6">
            <Button variant="outline" onClick={() => { setClosingInvoice(null); setClosingInvoiceActualDate(""); setClosingInvoiceDueDate(""); setClosingInvoiceExcludedIds([]); }}>Cancelar</Button>
            <Button onClick={async () => {
              if (!closingInvoice) return;
              const selectedIds = new Set(closingInvoiceExcludedIds);
              const excludeTransactionIds = closingCandidates
                .filter((candidate) => selectedIds.has(candidate.transaction.id) && !candidate.isFromNextInvoice)
                .map((candidate) => candidate.transaction.id);
              const restoreTransactionIds = closingCandidates
                .filter((candidate) => candidate.isManuallyExcluded && !selectedIds.has(candidate.transaction.id))
                .map((candidate) => candidate.transaction.id);
              const closed = await closeCardInvoice(
                closingInvoice.invoice.id,
                closingInvoiceActualDate || undefined,
                excludeTransactionIds,
                closingInvoiceDueDate || undefined,
                restoreTransactionIds,
              );
              if (closed) { setClosingInvoice(null); setClosingInvoiceActualDate(""); setClosingInvoiceDueDate(""); setClosingInvoiceExcludedIds([]); }
            }}>Fechar fatura</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyCard && (
        <CreditCardInvoiceHistoryDialog
          open
          onClose={() => setHistoryCard(null)}
          card={historyCard}
          invoices={creditCardInvoices.filter((invoice) => invoice.creditCardId === historyCard.id)}
          transactions={transactions}
          onPay={(invoice) => {
            setHistoryCard(null);
            setPayingCard({ card: historyCard, invoice, amount: getInvoiceAmount(transactions, invoice) });
            setPayAccountId("");
            setPayDate(new Date().toISOString().split("T")[0]);
            setPayMethod("Transferência");
          }}
          onReopen={(invoice) => {
            setHistoryCard(null);
            setReopeningInvoice(invoice);
          }}
          onReversePayment={(invoice) => {
            setHistoryCard(null);
            setReversingPaymentInvoice(invoice);
          }}
        />
      )}

      {/* Reopen Invoice Confirmation */}
      <AlertDialog open={!!reopeningInvoice} onOpenChange={(open) => { if (!open) setReopeningInvoice(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir esta fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura voltará para aberta e a obrigação criada no fechamento será desfeita. Nenhuma compra será excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button onClick={async () => {
              if (!reopeningInvoice) return;
              const reopened = await reopenCardInvoice(reopeningInvoice.id);
              if (reopened) setReopeningInvoice(null);
            }}>Reabrir fatura</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse Invoice Payment Confirmation */}
      <AlertDialog open={!!reversingPaymentInvoice} onOpenChange={(open) => { if (!open) setReversingPaymentInvoice(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar pagamento da fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              O pagamento será desfeito e a fatura voltará para fechada. Nenhuma compra será excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button onClick={async () => {
              if (!reversingPaymentInvoice) return;
              const reversed = await reverseCardInvoicePayment(reversingPaymentInvoice.id);
              if (reversed) setReversingPaymentInvoice(null);
            }}>Estornar pagamento</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay Card Bill Dialog */}
      <AlertDialog open={!!payingCard} onOpenChange={(o) => { if (!o) setPayingCard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pagar Fatura — {payingCard?.card.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Valor total da fatura: <strong className="text-foreground">{fmt(payingCard?.amount ?? 0)}</strong>.
              {payingCard && <> Vencimento: <strong className="text-foreground">{fmtDate(payingCard.invoice.dueDate)}</strong>.</>}
              O pagamento debita a conta escolhida sem registrar uma segunda despesa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-3">
            <div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Valor do pagamento</p>
                <p className="font-semibold text-foreground">{fmt(payingCard?.amount ?? 0)}</p>
              </div>
              <div>
                <Label className="mb-2 block">Data</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Forma de Pagamento</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Débito">Débito</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              disabled={!payAccountId || !payDate}
              onClick={async () => {
                if (payingCard && payAccountId) {
                  const paid = await payCardInvoice(payingCard.invoice.id, payAccountId, payDate, payMethod);
                  if (paid) setPayingCard(null);
                }
              }}
            >
              Confirmar Pagamento
            </Button>
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
            await addTransfer({
              fromAccountId: transferFrom,
              toAccountId: transferTo,
              amount: amt,
              date: new Date().toISOString().split("T")[0],
              description: transferDesc || undefined,
            });
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

      {/* Account Statement Dialog */}
      {statementAccount && (
        <AccountStatementDialog
          open={!!statementAccount}
          onClose={() => setStatementAccount(null)}
          account={statementAccount}
          currentBalance={accountBalances[statementAccount.id] ?? 0}
          transactions={transactions}
          transfers={transfers}
          accounts={accounts}
        />
      )}

{/* Credit Card Statement Dialog */}
      {statementCard && (
        <CreditCardStatementDialog
          open={!!statementCard}
          onClose={() => setStatementCard(null)}
          card={statementCard}
          transactions={transactions}
          invoice={statementCard.invoice}
          invoices={creditCardInvoices}
        />
      )}
    </div>
  );
}

export function CreditCardInvoiceHistoryDialog({
  open,
  onClose,
  card,
  invoices,
  transactions,
  onPay,
  onReopen,
  onReversePayment,
}: {
  open: boolean;
  onClose: () => void;
  card: CreditCard;
  invoices: CreditCardInvoice[];
  transactions: Transaction[];
  onPay: (invoice: CreditCardInvoice) => void;
  onReopen: (invoice: CreditCardInvoice) => void;
  onReversePayment: (invoice: CreditCardInvoice) => void;
}) {
  const sortedInvoices = [...invoices].sort((a, b) => b.competence.localeCompare(a.competence));

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-lg flex-col overflow-hidden p-0 sm:w-full">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle>Histórico de faturas · {card.name}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-6">
          {sortedInvoices.map((invoice) => {
            const statusLabel = invoice.status === "PAID" ? "Paga" : invoice.status === "CLOSED" ? "Fechada" : "Aberta";
            return (
              <div key={invoice.id} className="rounded-lg border border-border/70 bg-background/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium capitalize text-foreground">{formatInvoiceCompetence(invoice.competence)}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{fmt(getInvoiceAmount(transactions, invoice))}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Vencimento {fmtDate(invoice.dueDate)}</p>
                  </div>
                  <Badge variant={invoice.status === "PAID" ? "default" : invoice.status === "CLOSED" ? "destructive" : "secondary"}>
                    {statusLabel}
                  </Badge>
                </div>
                {invoice.status === "CLOSED" && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                    <Button size="sm" variant="outline" onClick={() => onPay(invoice)}>Pagar fatura</Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onReopen(invoice)}>Reabrir fatura</Button>
                  </div>
                )}
                {invoice.status === "PAID" && (
                  <div className="mt-3 flex justify-end border-t border-border/60 pt-3">
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onReversePayment(invoice)}>Estornar pagamento</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Account Form ---
function AccountFormDialog({ open, onClose, onSubmit, initial, currentBalance, onAdjustBalance }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Account, "id">) => void;
  initial?: Account;
  currentBalance?: number;
  onAdjustBalance?: (accountId: string, diff: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [type, setType] = useState<"checking" | "savings">("checking");
  const [initialBalance, setInitialBalance] = useState("");
  const [color, setColor] = useState("blue");
  const [adjustTo, setAdjustTo] = useState("");

  useEffect(() => {
    if (open) {
      if (initial) {
        setName(initial.name);
        setBank(initial.bank);
        setType(initial.type);
        setInitialBalance(String(initial.initialBalance));
        setColor(initial.color);
        setAdjustTo(typeof currentBalance === "number" ? currentBalance.toFixed(2) : "");
      } else {
        setName(""); setBank(""); setType("checking"); setInitialBalance(""); setColor("blue"); setAdjustTo("");
      }
    }
  }, [open, initial, currentBalance]);

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
        <form onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({ name, bank, type, initialBalance: parseFloat(initialBalance) || 0, color });
          if (initial && onAdjustBalance && typeof currentBalance === "number") {
            const target = parseFloat(adjustTo);
            if (!isNaN(target)) {
              const diff = +(target - currentBalance).toFixed(2);
              if (Math.abs(diff) >= 0.01) {
                await onAdjustBalance(initial.id, diff);
              }
            }
          }
          onClose();
        }} className="space-y-4">
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
          {initial && typeof currentBalance === "number" && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Label className="text-foreground">Ajustar saldo atual</Label>
              <p className="text-xs text-muted-foreground">
                Saldo atual calculado: <strong className="text-foreground">{fmt(currentBalance)}</strong>.
                Informe o saldo real — a diferença será lançada como uma transação de ajuste.
              </p>
              <Input
                type="number"
                step="0.01"
                value={adjustTo}
                onChange={(e) => setAdjustTo(e.target.value)}
                placeholder={currentBalance.toFixed(2)}
              />
            </div>
          )}
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
function CreditCardFormDialog({ open, onClose, onSubmit, initial, currentUsed, canAdjustUsed, onAdjustUsed }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<CreditCard, "id">) => Promise<boolean | void>;
  initial?: CreditCard;
  currentUsed?: number;
  canAdjustUsed?: boolean;
  onAdjustUsed?: (cardId: string, diff: number) => Promise<boolean | void>;
}) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("20");
  const [dueDay, setDueDay] = useState("27");
  const [color, setColor] = useState("purple");
  const [adjustTo, setAdjustTo] = useState("");

  const resetForm = () => {
    if (initial) {
      setName(initial.name); setBank(initial.bank); setLimit(String(initial.limit));
      setClosingDay(String(initial.closingDay)); setDueDay(String(initial.dueDay)); setColor(initial.color);
      setAdjustTo(typeof currentUsed === "number" ? currentUsed.toFixed(2) : "");
    } else {
      setName(""); setBank(""); setLimit(""); setClosingDay("20"); setDueDay("27"); setColor("purple"); setAdjustTo("");
    }
  };

  useEffect(() => {
    if (open) resetForm();
  }, [open, initial, currentUsed]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar Cartão" : "Novo Cartão"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const saved = await onSubmit({ name, bank, limit: parseFloat(limit) || 0, closingDay: parseInt(closingDay) || 20, dueDay: parseInt(dueDay) || 27, color });
          if (saved === false) return;
          if (initial && canAdjustUsed && onAdjustUsed && typeof currentUsed === "number") {
            const target = parseFloat(adjustTo);
            if (!isNaN(target) && target >= 0) {
              const diff = +(target - currentUsed).toFixed(2);
              if (Math.abs(diff) >= 0.01) {
                const adjusted = await onAdjustUsed(initial.id, diff);
                if (adjusted === false) return;
              }
            }
          }
          onClose();
        }} className="space-y-4">
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
          {initial && canAdjustUsed && typeof currentUsed === "number" && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Label className="text-foreground">Ajustar fatura atual</Label>
              <p className="text-xs text-muted-foreground">
                Fatura atual em aberto: <strong className="text-foreground">{fmt(currentUsed)}</strong>.
                Informe o valor real — a diferença será lançada como ajuste no cartão.
              </p>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={adjustTo}
                onChange={(e) => setAdjustTo(e.target.value)}
                placeholder={currentUsed.toFixed(2)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{initial ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
