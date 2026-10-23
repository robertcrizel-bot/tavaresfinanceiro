import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, Loader2, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type GateState = "loading" | "allowed" | "denied" | "error";

export function BetaAccessGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [state, setState] = useState<GateState>("loading");
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setState("loading");
    setVersion((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setState("denied"); return; }
    setState("loading");
    supabase.rpc("beta_has_access")
      .then(({ data, error }) => {
        if (cancelled) return;
        // Fail closed on DB/network/migration errors. No localStorage fallback.
        if (error || typeof data !== "boolean") setState("error");
        else setState(data ? "allowed" : "denied");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [user?.id, version]);

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
            ? "Sua conta está cadastrada, mas o acesso ao FinanceControl ainda não foi liberado ou expirou. Confira sua assinatura ou convite."
            : "O acesso não foi confirmado. Nenhum registro foi alterado. Verifique a conexão e tente novamente."}
        </p>
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
