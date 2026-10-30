import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, Loader2, LogOut, RefreshCw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type GateState = "loading" | "allowed" | "denied" | "error";

export function BetaAccessGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [state, setState] = useState<GateState>("loading");
  const [version, setVersion] = useState(0);
  const [requestState, setRequestState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const refresh = useCallback(() => {
    setState("loading");
    setVersion((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setState("denied"); return; }
    setState("loading");
    Promise.resolve(supabase.rpc("beta_has_access"))
      .then(({ data, error }) => {
        if (cancelled) return;
        // Fail closed on DB/network/migration errors. No localStorage fallback.
        if (error || typeof data !== "boolean") setState("error");
        else setState(data ? "allowed" : "denied");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [user?.id, version]);

  const requestAccess = async () => {
    if (!user || requestState === "sending" || requestState === "sent") return;
    setRequestState("sending");
    try {
      const { error } = await supabase.from("beta_access_requests").insert({ user_id: user.id });
      if (error && error.code !== "23505") throw error;
      // A request is NOT a payment or an access grant.
      setRequestState("sent");
    } catch {
      setRequestState("error");
    }
  };

  if (state === "allowed") return <>{children}</>;
  if (state === "loading") return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Verificando acesso" />
    </div>
  );
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-7 text-center">
        <LockKeyhole className="mx-auto h-9 w-9 text-primary" />
        <h1 className="text-2xl font-bold">
          {state === "denied" ? "Acesso à beta pendente" : "Não foi possível verificar seu acesso"}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {state === "denied"
            ? "Sua conta está cadastrada, mas o acesso ao FinVision ainda não foi liberado ou expirou. Confira sua assinatura ou convite."
            : "O acesso não foi confirmado. Nenhum registro foi alterado. Verifique a conexão e tente novamente."}
        </p>
        {state === "denied" && (
          <div className="space-y-3 rounded-xl border border-border bg-background/70 px-4 py-4">
            <p className="text-xs leading-5 text-muted-foreground">
              Já fez o pagamento ou recebeu um convite? Solicite uma conferência.
              O envio não confirma pagamento e não libera acesso automaticamente.
            </p>
            <Button onClick={() => void requestAccess()}
              disabled={requestState === "sending" || requestState === "sent"}>
              {requestState === "sending"
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Send className="mr-2 h-4 w-4" />}
              {requestState === "sent" ? "Solicitação registrada" : "Solicitar análise de acesso"}
            </Button>
            {requestState === "sent" && (
              <p role="status" className="text-xs text-primary">
                Pedido registrado. O pagamento precisa ser confirmado no provedor antes da liberação.
              </p>
            )}
            {requestState === "error" && (
              <p role="alert" className="text-xs text-destructive">
                Não foi possível registrar a solicitação. Tente novamente.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" /> Verificar novamente</Button>
          <Button variant="ghost" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" /> Sair</Button>
        </div>
        <Link className="inline-block text-sm font-semibold text-primary hover:underline" to="/beta">
          Conhecer a beta
        </Link>
      </div>
    </main>
  );
}
