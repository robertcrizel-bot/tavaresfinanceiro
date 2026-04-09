import { useState, useEffect } from "react";
import { Transaction, TransactionType, Category, PaymentMethod, PAYMENT_METHODS } from "@/lib/types";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Transaction, "id">) => void;
  initial?: Transaction;
}

export function TransactionForm({ open, onClose, onSubmit, initial }: TransactionFormProps) {
  const { accounts, creditCards } = useAccounts();
  const { getCategoriesByType } = useCategories();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState<Category>("Outros");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setAmount(String(initial.amount));
      setType(initial.type);
      setCategory(initial.category);
      setDate(initial.date);
      setDescription(initial.description || "");
      setPaymentMethod(initial.paymentMethod || "");
      setAccountId(initial.accountId || "");
      setCreditCardId(initial.creditCardId || "");
    } else {
      setTitle(""); setAmount(""); setType("expense"); setCategory("Outros");
      setDate(new Date().toISOString().split("T")[0]); setDescription("");
      setPaymentMethod(""); setAccountId(""); setCreditCardId("");
    }
  }, [initial, open]);

  const categories = getCategoriesByType(type);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      amount: parseFloat(amount),
      type,
      category,
      date,
      description: description || undefined,
      paymentMethod: paymentMethod ? paymentMethod as PaymentMethod : undefined,
      accountId: accountId && accountId !== "none" ? accountId : undefined,
      creditCardId: creditCardId && creditCardId !== "none" ? creditCardId : undefined,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar Registro" : "Novo Registro"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ex: Supermercado" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v: TransactionType) => { setType(v); setCategory("Outros"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Saída</SelectItem>
                  <SelectItem value="income">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v: Category) => setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Conta <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Select value={accountId || "none"} onValueChange={(v) => { setAccountId(v === "none" ? "" : v); if (v !== "none") setCreditCardId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.bank})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cartão de Crédito <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Select value={creditCardId || "none"} onValueChange={(v) => { setCreditCardId(v === "none" ? "" : v); if (v !== "none") setAccountId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {creditCards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.bank})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Forma de Pagamento <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Select value={paymentMethod || "none"} onValueChange={(v) => setPaymentMethod(v === "none" ? "" : v as PaymentMethod)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes..." rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{initial ? "Salvar" : "Adicionar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
