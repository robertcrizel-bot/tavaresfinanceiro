export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const ACTIONS = ["whoami", "list", "grant", "renew", "block"] as const;
type Action = typeof ACTIONS[number];

export type Entitlement = { status: string; expires_at: string };
export type Person = { email: string | null; name: string | null };

/** Server-only data access. Implemented with the service key in index.ts; mocked in tests. */
export interface Deps {
  getCallerId(token: string): Promise<string | null>;
  isAdmin(userId: string): Promise<boolean>;
  userExists(userId: string): Promise<boolean>;
  getPerson(userId: string): Promise<Person>;
  hasRequest(userId: string): Promise<boolean>;
  getEntitlement(userId: string): Promise<Entitlement | null>;
  listRequests(): Promise<{ user_id: string; status: string; created_at: string }[]>;
  listEntitlements(): Promise<({ user_id: string } & Entitlement)[]>;
  upsertEntitlement(userId: string, status: string, expiresAt: string, reference: string): Promise<void>;
  revokeEntitlement(userId: string): Promise<void>;
  approvePendingRequest(userId: string): Promise<void>;
  now(): number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export function createHandler(deps: Deps) {
  const inFlight = new Set<string>();

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "unauthorized" }, 401);
      const callerId = await deps.getCallerId(token);
      if (!callerId) return json({ error: "unauthorized" }, 401);
      const admin = await deps.isAdmin(callerId);

      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
      const { action, userId } = body as Record<string, unknown>;
      if (typeof action !== "string" || !ACTIONS.includes(action as Action)) return json({ error: "invalid_action" }, 400);

      if (action === "whoami") return json({ isAdmin: admin });
      if (!admin) return json({ error: "forbidden" }, 403);

      if (action === "list") {
        const [requests, entitlements] = await Promise.all([deps.listRequests(), deps.listEntitlements()]);
        const ids = [...new Set([...requests, ...entitlements].map((r) => r.user_id))];
        const people = new Map(await Promise.all(ids.map(async (id) => [id, await deps.getPerson(id)] as const)));
        const enrich = <T extends { user_id: string }>(r: T) => ({ ...r, ...people.get(r.user_id), isSelf: r.user_id === callerId });
        return json({ requests: requests.map(enrich), entitlements: entitlements.map(enrich) });
      }

      if (typeof userId !== "string" || !UUID.test(userId)) return json({ error: "invalid_user" }, 400);
      if (userId === callerId) return json({ error: "self_change_not_allowed" }, 403);
      if (inFlight.has(userId)) return json({ error: "operation_in_progress" }, 409);
      inFlight.add(userId);
      try {
        if (!(await deps.userExists(userId))) return json({ error: "user_not_found" }, 404);
        const [hasReq, ent] = await Promise.all([deps.hasRequest(userId), deps.getEntitlement(userId)]);
        if (!hasReq && !ent) return json({ error: "no_request_for_user" }, 404);
        const now = deps.now();
        const valid = !!ent && ent.status !== "revoked" && new Date(ent.expires_at).getTime() > now;

        if (action === "block") {
          if (!ent) return json({ error: "no_entitlement" }, 404);
          if (ent.status === "revoked") return json({ error: "already_blocked" }, 409);
          await deps.revokeEntitlement(userId);
          return json({ ok: true });
        }
        if (action === "grant" && valid) return json({ error: "already_has_access" }, 409);
        if (action === "renew" && !ent) return json({ error: "no_entitlement" }, 404);

        const base = action === "renew" && valid ? new Date(ent!.expires_at).getTime() : now;
        const expiresAt = new Date(base + 30 * DAY).toISOString();
        await deps.upsertEntitlement(userId, ent?.status === "active" ? "active" : "trial", expiresAt, `admin:${callerId}`);
        if (hasReq) await deps.approvePendingRequest(userId);
        return json({ ok: true, expires_at: expiresAt });
      } finally {
        inFlight.delete(userId);
      }
    } catch (err) {
      console.error("beta-admin failure", err instanceof Error ? err.message : "unknown");
      return json({ error: "server_error" }, 500);
    }
  };
}
