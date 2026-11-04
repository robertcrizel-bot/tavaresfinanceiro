import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { callBetaAdmin, errorCode, useIsAdmin } from "@/lib/beta-admin";

type Person = { user_id: string; email: string | null; name: string | null; isSelf: boolean };
type Req = Person & { status: string; created_at: string };
type Ent = Person & { status: string; expires_at: string };
type Pending = { action: "grant" | "renew" | "block"; person: Person };

const fmt = (d: string) => new Date(d).toLocaleDateString("pt-BR");
const label = { grant: "Liberar 30 dias", renew: "Renovar 30 dias", block: "Bloquear acesso" } as const;
const errors: Record<string, string> = {
  forbidden: "Você não tem permissão.", unauthorized: "Sessão expirada. Entre novamente.",
  already_has_access: "Este usuário já tem acesso válido.", already_blocked: "Este acesso já está bloqueado.",
  operation_in_progress: "Outra operação está em andamento para este usuário.",
  self_change_not_allowed: "Você não pode alterar o próprio acesso.",
};

export default function Admin() {
  const { loading, isAdmin } = useIsAdmin();
  const { toast } = useToast();
  const [data, setData] = useState<{ requests: Req[]; entitlements: Ent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await callBetaAdmin<{ requests: Req[]; entitlements: Ent[] }>("list")); }
    catch (e: unknown) { setError(errors[errorCode(e)] ?? "Não foi possível carregar os dados."); }
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const run = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await callBetaAdmin(pending.action, pending.person.user_id);
      toast({ title: "Feito", description: `${label[pending.action]}: ${pending.person.email ?? "usuário"}` });
      await load();
    } catch (e: unknown) {
      toast({ title: "Erro", description: errors[errorCode(e)] ?? "A ação falhou.", variant: "destructive" });
    } finally { setBusy(false); setPending(null); }
  };

  const pendingReqs = data?.requests.filter((r) => r.status === "pending") ?? [];
  const who = (p: Person) => (
    <div className="min-w-0">
      <p className="truncate font-semibold">{p.name || p.email || "Sem email"}</p>
      {p.name && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <h1 className="font-display text-3xl font-bold text-primary">Administração</h1>
      </div>
      {error && <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <Loader2 className="h-6 w-6 animate-spin text-primary" />}

      {data && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Pedidos pendentes ({pendingReqs.length})</h2>
            {pendingReqs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>}
            {pendingReqs.map((r) => (
              <div key={r.user_id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">{who(r)}<p className="text-xs text-muted-foreground">Pedido em {fmt(r.created_at)}</p></div>
                <Button className="min-h-11" disabled={r.isSelf} onClick={() => setPending({ action: "grant", person: r })}>Liberar 30 dias</Button>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Usuários com acesso ({data.entitlements.length})</h2>
            {data.entitlements.map((e) => {
              const expired = new Date(e.expires_at) <= new Date();
              return (
                <div key={e.user_id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    {who(e)}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={e.status === "revoked" || expired ? "destructive" : "secondary"}>
                        {e.status === "revoked" ? "Bloqueado" : expired ? "Vencido" : e.status}
                      </Badge>
                      <span>Vence em {fmt(e.expires_at)}</span>
                      {e.isSelf && <span>(você)</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="min-h-11" disabled={e.isSelf} onClick={() => setPending({ action: "renew", person: e })}>Renovar 30 dias</Button>
                    <Button variant="destructive" className="min-h-11" disabled={e.isSelf || e.status === "revoked"} onClick={() => setPending({ action: "block", person: e })}>Bloquear acesso</Button>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending && label[pending.action]}?</AlertDialogTitle>
            <AlertDialogDescription>Confirmar para {pending?.person.email ?? "este usuário"}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(ev) => { ev.preventDefault(); run(); }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
