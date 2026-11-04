import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AdminAction = "list" | "grant" | "renew" | "block" | "whoami";

export async function callBetaAdmin<T = any>(action: AdminAction, userId?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("beta-admin", { body: { action, userId } });
  if (error) {
    let code = "erro";
    try { code = (await (error as any).context?.json())?.error ?? code; } catch { /* ignore */ }
    throw new Error(code);
  }
  return data as T;
}

/** UI hint only — every real permission is checked by the server function. */
export function useIsAdmin() {
  const { user } = useAuth();
  const [state, setState] = useState<{ loading: boolean; isAdmin: boolean }>({ loading: true, isAdmin: false });
  useEffect(() => {
    if (!user) { setState({ loading: false, isAdmin: false }); return; }
    let alive = true;
    callBetaAdmin<{ isAdmin: boolean }>("whoami")
      .then((r) => alive && setState({ loading: false, isAdmin: !!r?.isAdmin }))
      .catch(() => alive && setState({ loading: false, isAdmin: false }));
    return () => { alive = false; };
  }, [user?.id]);
  return state;
}
