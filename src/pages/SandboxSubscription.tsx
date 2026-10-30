import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = {
  plan: { name: string; price_cents: number; cycle: string };
  contract: {
    state: string;
    method: string;
    expires_at: string | null;
    checkout_url: string | null;
  } | null;
};
const states: Record<string, string> = {
  creating: "Preparando contratação",
  pending: "Aguardando pagamento",
  active: "Assinatura ativa",
  overdue: "Pagamento vencido",
  payment_failed: "Pagamento recusado",
  cancelled: "Assinatura cancelada",
  refunded: "Pagamento estornado",
  reconciliation_required: "Operação em conferência. Não repita a contratação.",
};

export default function SandboxSubscription() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [method, setMethod] = useState("PIX");
  const invoke = useCallback(async (payload: Record<string, string>) => {
    const { data, error } = await supabase.functions.invoke(
      "asaas-sandbox-checkout",
      { body: payload },
    );
    if (error || !data?.plan || data.error) {
      throw new Error(
        "Não foi possível consultar a assinatura Sandbox. Verifique a configuração ou tente atualizar o estado; não repita uma contratação em conferência.",
      );
    }
    setStatus(data as Status);
  }, []);
  const run = useCallback(async (payload: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      await invoke(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação indisponível.");
    } finally {
      setBusy(false);
    }
  }, [invoke]);
  useEffect(() => {
    if (user) void run({ action: "status" });
  }, [user, run]);
  const returned = new URLSearchParams(window.location.search).get("return");
  const returnedMessage = returned === "success"
    ? "Você retornou do pagamento. O acesso depende da confirmação recebida no servidor."
    : returned === "cancelled"
    ? "A jornada de pagamento foi cancelada. Nenhum acesso foi concedido por este retorno."
    : returned === "expired"
    ? "A página de pagamento expirou. Consulte o estado antes de tentar novamente."
    : null;
  if (loading) return <p className="p-6">Carregando…</p>;
  if (!user) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1>Homologação de assinatura</h1>
        <Link to="/auth">Entrar com uma conta de teste</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">Assinatura Sandbox</h1>
      <p className="rounded-xl border border-warning p-4 text-sm">
        Ambiente de homologação. Use somente dados fictícios e cartões de teste.
        Nenhum pagamento real deve ser feito nesta página.
      </p>
      {returnedMessage && <p role="status">{returnedMessage}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {status && (
        <section className="dashboard-card space-y-4 p-5">
          <h2 className="text-lg font-semibold">{status.plan.name}</h2>
          <p>
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(status.plan.price_cents / 100)} / mês
          </p>
          {status.contract
            ? (
              <>
                <p role="status">
                  {states[status.contract.state] ?? "Em conferência"}
                </p>
                {status.contract.expires_at && (
                  <p>
                    Acesso confirmado até{" "}
                    {new Date(status.contract.expires_at).toLocaleString(
                      "pt-BR",
                    )}. O cancelamento mantém o período já pago; estornos são
                    conferidos no servidor.
                  </p>
                )}
                {status.contract.checkout_url && (
                  <a
                    className="inline-block text-primary underline"
                    href={status.contract.checkout_url}
                    rel="noreferrer"
                  >
                    Abrir pagamento hospedado no Asaas Sandbox
                  </a>
                )}
                <Button
                  variant="outline"
                  disabled={busy || status.contract.state === "cancelled"}
                  onClick={() => void run({ action: "cancel" })}
                >
                  Cancelar futuras cobranças
                </Button>
              </>
            )
            : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run({ action: "start", method, name, cpfCnpj: cpf });
                }}
              >
                <div>
                  <Label htmlFor="sandbox-name">Nome fictício</Label>
                  <Input
                    id="sandbox-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                  />
                </div>
                <div>
                  <Label htmlFor="sandbox-cpf">
                    CPF/CNPJ fictício de teste, somente números
                  </Label>
                  <Input
                    id="sandbox-cpf"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    required
                    inputMode="numeric"
                    pattern="[0-9]{11}([0-9]{3})?"
                  />
                </div>
                <div>
                  <Label htmlFor="sandbox-method">Forma de pagamento</Label>
                  <select
                    id="sandbox-method"
                    className="w-full rounded border bg-background p-2"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="PIX">
                      Pix — pagamento manual a cada mês
                    </option>
                    <option value="CREDIT_CARD">
                      Cartão de crédito — recorrência mensal
                    </option>
                  </select>
                </div>
                <Button disabled={busy} type="submit">
                  Iniciar contratação de teste
                </Button>
              </form>
            )}
          <p className="text-sm text-muted-foreground">
            Pix convencional não autoriza débito automático. O Asaas gera as
            cobranças mensais e você paga cada uma. Dados de cartão são
            informados somente no Asaas.
          </p>
        </section>
      )}
      <Button
        disabled={busy}
        variant="outline"
        onClick={() => void run({ action: "status" })}
      >
        Atualizar estado no servidor
      </Button>
      <Link className="block text-primary" to="/">
        Voltar ao FinanceControl
      </Link>
    </main>
  );
}
