import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { verifiedAsaasProductionPaymentUrl } from "@/lib/asaas-production-pilot";

type BillingStatus = {
  plan: { name: string; price_cents: number; cycle: string };
  contract: null | {
    state: string;
    method: "BOLETO" | "CREDIT_CARD";
    expires_at: string | null;
    checkout_url: string | null;
  };
};
const states: Record<string, string> = {
  pending: "Aguardando pagamento",
  active: "Assinatura ativa",
  creating: "Preparando contratação",
  overdue: "Cobrança vencida",
  payment_failed: "Cobrança recusada",
  cancelled: "Renovação cancelada",
  refunded: "Pagamento estornado",
  reconciliation_required: "Necessária conferência. Não repita a contratação.",
};

export default function ProductionSubscription() {
  const { user, loading } = useAuth();
  const [snapshot, setSnapshot] = useState<BillingStatus | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [method, setMethod] = useState<"BOLETO" | "CREDIT_CARD">("BOLETO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const busyRef = useRef(false);
  const currentUser = useRef(user?.id);
  currentUser.current = user?.id;

  const run = useCallback(async (action: "status" | "start" | "cancel") => {
    const uid = user?.id;
    if (!uid || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const body = action === "start"
        ? { action, method, name: name.trim(), cpfCnpj: cpf.replace(/\D/g, "") }
        : { action };
      const { data, error: invokeError } = await supabase.functions.invoke(
        "asaas-production-checkout", { body },
      );
      if (invokeError || !data || data.error || !data.plan) {
        throw new Error(
          action === "status"
            ? "Assinaturas indisponíveis. A integração está em preparação."
            : "Não foi possível confirmar a operação. Atualize o estado antes de repetir.",
        );
      }
      if (currentUser.current !== uid) return;
      setSnapshot(data as BillingStatus);
      setOwnerId(uid);
    } catch (reason) {
      if (currentUser.current !== uid) return;
      setError(reason instanceof Error ? reason.message : "Operação indisponível.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [user?.id, method, name, cpf]);

  // Status is the only automatic request; never start or cancel a subscription on mount.
  useEffect(() => {
    setSnapshot(null);
    setOwnerId(null);
    if (user?.id) void run("status");
  }, [user?.id]); // deliberately omit form-dependent callback to avoid repeated checks

  if (loading) return <main className="mx-auto max-w-xl p-6">Verificando sua conta…</main>;
  if (!user) return <main className="mx-auto max-w-xl space-y-4 p-6">
    <h1 className="text-xl font-bold">Assinatura FinVision</h1>
    <p>Entre na sua conta antes de consultar uma assinatura.</p>
    <Link className="text-primary underline" to="/auth">Entrar</Link>
  </main>;

  const contract = ownerId === user.id ? snapshot?.contract : null;
  const amount = snapshot?.plan?.price_cents === 1490 ? "R$ 14,90 / mês" : null;
  const link = verifiedAsaasProductionPaymentUrl(contract?.checkout_url);
  const safeToStart = ownerId === user.id && snapshot && !contract && amount && !busy;
  const canCancel = !!contract && !["cancelled", "reconciliation_required", "creating"].includes(contract.state);

  return <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
    <h1 className="text-2xl font-bold text-foreground">Assinatura FinVision</h1>
    <p className="text-sm text-muted-foreground">
      Plano mensal. Cartão com cobrança recorrente; boleto com opção de Pix mediante pagamento de cada fatura.
      O acesso só é liberado após confirmação do pagamento pelo servidor.
    </p>
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="font-bold">{snapshot?.plan?.name || "FinVision Mensal"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{amount || "Plano indisponível"}</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void run("status")}>
          {busy ? "Consultando…" : "Atualizar estado"}
        </Button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {contract ? <>
        <p className="font-semibold">{states[contract.state] || "Em conferência"}</p>
        {contract.expires_at && <p className="text-sm text-muted-foreground">
          Acesso registrado até {new Date(contract.expires_at).toLocaleString("pt-BR")}.
        </p>}
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-block text-primary underline">
          Abrir cobrança no Asaas
        </a>}
        {canCancel && <Button variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}>
          Cancelar cobranças futuras
        </Button>}
      </> : safeToStart ? <>
        <div className="space-y-1.5">
          <Label htmlFor="subscriber-name">Nome completo</Label>
          <Input id="subscriber-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subscriber-cpf">CPF ou CNPJ</Label>
          <Input id="subscriber-cpf" value={cpf} onChange={e => setCpf(e.target.value)} inputMode="numeric" autoComplete="off" />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Forma de pagamento</legend>
          <label className="flex gap-2 text-sm"><input type="radio" checked={method === "BOLETO"} onChange={() => setMethod("BOLETO")} /> Boleto com opção de Pix por fatura</label>
          <label className="flex gap-2 text-sm"><input type="radio" checked={method === "CREDIT_CARD"} onChange={() => setMethod("CREDIT_CARD")} /> Cartão de crédito recorrente</label>
        </fieldset>
        <Button disabled={busy || name.trim().length < 2 || !/^\d{11}(\d{3})?$/.test(cpf.replace(/\D/g, ""))}
          onClick={() => void run("start")}>Contratar R$ 14,90/mês</Button>
        <p className="text-xs text-muted-foreground">Os dados de cartão são fornecidos exclusivamente na página segura do Asaas.</p>
      </> : !busy && !error && <p className="text-sm text-muted-foreground">Consultando a disponibilidade da assinatura…</p>}
    </section>
    <Link to="/beta" className="text-sm text-primary underline">Voltar</Link>
    <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar cobranças futuras?</AlertDialogTitle>
          <AlertDialogDescription>O cancelamento impede novas cobranças. O período já pago permanece válido, sujeito à confirmação do servidor.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Manter assinatura</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setCancelOpen(false); void run("cancel"); }}>Confirmar cancelamento</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
