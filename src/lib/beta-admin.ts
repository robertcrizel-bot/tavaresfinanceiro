import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AdminAction = "list" | "grant" | "renew" | "block" | "whoami";

export class BetaAdminError extends Error {}

export function errorCode(e: unknown): string {
  return e instanceof Error ? e.message : "erro";
}

async function readErrorCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body: unknown = await ctx.json();
      if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
        return (body as { error: string }).error;
      }
    } catch { /* corpo não-JSON */ }
  }
  return "erro";
}

export async function callBetaAdmin<T = unknown>(action: AdminAction, userId?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("beta-admin", { body: { action, userId } });
  if (error) throw new BetaAdminError(await readErrorCode(error));
  return data as T;
}

/** UI hint only — every real permission is checked by the server function. */
export function useIsAdmin() {
  const { user } = useAuth();
  const [state, setState] = useState<{ loading: boolean; isAdmin: boolean }>({ loading: true, isAdmin: false });
  useEffect(() => {
    if (!user) { setState({ loading: false, isAdmin: false }); return; }
    let alive = true;
    callBetaAdmin<{ isAdmin?: unknown }>("whoami")
      .then((r) => alive && setState({ loading: false, isAdmin: r?.isAdmin === true }))
      .catch(() => alive && setState({ loading: false, isAdmin: false }));
    return () => { alive = false; };
  }, [user]);
  return state;
}
