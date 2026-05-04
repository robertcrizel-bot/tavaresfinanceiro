import { useState, useMemo } from "react";
import { useTransfers, Transfer } from "@/contexts/TransferContext";
import { useAccounts } from "@/contexts/AccountContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ArrowRight, ArrowLeftRight } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Transfers() {
  const { transfers, addTransfer, updateTransfer, deleteTransfer } = useTransfers();
  const { accounts } = useAccounts();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transfer | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);

  const accMap = useMemo(() => {
    const m: Record<string, string> = {};
    accounts.forEach((a) => (m[a.id] = `${a.name} (${a.bank})`));
    return m;
  }, [accounts]);

  const sorted = useMemo(
    () => [...transfers].sort((a, b) => b.date.localeCompare(a.date)),
    [transfers]
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" /> Transferências
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Movimentações entre suas contas (não contam como receita ou despesa).
          </p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }} className="gap-2" disabled={accounts.length < 2}>
          <Plus className="h-4 w-4" /> Nova Transferência
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="Nenhuma transferência"
          description={accounts.length < 2 ? "Cadastre ao menos duas contas para realizar transferências." : "Registre transferências entre suas contas."}
          onAction={accounts.length >= 2 ? () => { setEditing(undefined); setOpen(true); } : undefined}
          actionLabel="Nova Transferência"
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {sorted.map((t) => (
              <div key={t.id} className="glass-card rounded-xl p-4 animate-fade-in space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}
                  </div>
                  <p className="text-sm font-semibold text-primary">{fmt(t.amount)}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-foreground truncate">{accMap[t.fromAccountId] || "—"}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{accMap[t.toAccountId] || "—"}</span>
                </div>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(t.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="glass-card rounded-xl overflow-hidden hidden md:block animate-fade-in">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Data</TableHead>
                  <TableHead>Conta de Origem</TableHead>
                  <TableHead>Conta de Destino</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((t) => (
                  <TableRow key={t.id} className="border-border">
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-foreground">{accMap[t.fromAccountId] || "—"}</TableCell>
                    <TableCell className="text-foreground">{accMap[t.toAccountId] || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{t.description || "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{fmt(t.amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <TransferFormDialog
        open={open}
        onClose={() => { setOpen(false); setEditing(undefined); }}
        initial={editing}
        onSubmit={async (data) => {
          if (editing) await updateTransfer({ ...data, id: editing.id, createdAt: editing.createdAt });
          else await addTransfer(data);
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transferência?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita e os saldos das contas serão recalculados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) deleteTransfer(deleting); setDeleting(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TransferFormDialog({
  open, onClose, onSubmit, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Transfer, "id" | "createdAt">) => Promise<void>;
  initial?: Transfer;
}) {
  const { accounts } = useAccounts();
  const [from, setFrom] = useState(initial?.fromAccountId || "");
  const [to, setTo] = useState(initial?.toAccountId || "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || new Date().toISOString().split("T")[0]);
  const [desc, setDesc] = useState(initial?.description || "");

  // reset on open
  useMemo(() => {
    if (open) {
      setFrom(initial?.fromAccountId || "");
      setTo(initial?.toAccountId || "");
      setAmount(initial ? String(initial.amount) : "");
      setDate(initial?.date || new Date().toISOString().split("T")[0]);
      setDesc(initial?.description || "");
    }
  }, [open, initial]);

  const valid = from && to && from !== to && parseFloat(amount) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar Transferência" : "Nova Transferência"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            await onSubmit({
              fromAccountId: from,
              toAccountId: to,
              amount: parseFloat(amount),
              date,
              description: desc || undefined,
            });
            onClose();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Conta de Origem</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} — {a.bank}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Conta de Destino</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a.id !== from).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} — {a.bank}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: Reserva de viagem" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!valid}>{initial ? "Salvar" : "Transferir"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
