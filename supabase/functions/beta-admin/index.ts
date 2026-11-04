/**
 * beta-admin — owner-only management of Beta access.
 * Every request: verify the session with auth.getUser, then check the caller
 * has role 'admin' in public.user_roles (server-controlled, not client-editable).
 * Non-admins get 401/403. The service key never leaves this function.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!URL_ || !ANON || !SERVICE) return json({ error: "server_misconfigured" }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  const caller = userData?.user;
  if (userErr || !caller) return json({ error: "unauthorized" }, 401);

  const { data: role, error: roleErr } = await admin
    .from("user_roles").select("id").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
  if (roleErr) return json({ error: "role_check_failed" }, 500);

  let body: { action?: unknown; userId?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const action = body.action;

  if (action === "whoami") return json({ isAdmin: !!role });
  if (!role) return json({ error: "forbidden" }, 403);

  if (action === "list") {
    const [reqs, ents] = await Promise.all([
      admin.from("beta_access_requests").select("user_id,status,created_at").order("created_at", { ascending: false }),
      admin.from("beta_entitlements").select("user_id,status,expires_at,payment_provider,updated_at"),
    ]);
    if (reqs.error || ents.error) return json({ error: "list_failed" }, 500);
    const ids = new Set<string>([...reqs.data.map((r) => r.user_id), ...ents.data.map((e) => e.user_id)]);
    const people: Record<string, { email: string | null; name: string | null }> = {};
    await Promise.all([...ids].map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const u = data?.user;
      people[id] = { email: u?.email ?? null, name: (u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? null) as string | null };
    }));
    const withPerson = <T extends { user_id: string }>(r: T) => ({ ...r, ...people[r.user_id], isSelf: r.user_id === caller.id });
    return json({ requests: reqs.data.map(withPerson), entitlements: ents.data.map(withPerson) });
  }

  if (action !== "grant" && action !== "renew" && action !== "block") return json({ error: "invalid_action" }, 400);
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!UUID.test(userId)) return json({ error: "invalid_user" }, 400);
  if (userId === caller.id) return json({ error: "self_change_not_allowed" }, 403);

  // Target must be an existing user who requested access or already has an entitlement.
  const { data: target } = await admin.auth.admin.getUserById(userId);
  if (!target?.user) return json({ error: "user_not_found" }, 404);
  const [{ data: reqRow }, { data: ent }] = await Promise.all([
    admin.from("beta_access_requests").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    admin.from("beta_entitlements").select("status,expires_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (!reqRow && !ent) return json({ error: "no_request_for_user" }, 404);

  const now = Date.now();
  if (action === "block") {
    if (!ent) return json({ error: "no_entitlement" }, 404);
    const { error } = await admin.from("beta_entitlements")
      .update({ status: "revoked", updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return json({ error: "update_failed" }, 500);
    return json({ ok: true });
  }

  const base = action === "renew" && ent && ent.status !== "revoked" && new Date(ent.expires_at).getTime() > now
    ? new Date(ent.expires_at).getTime() : now;
  const expires = new Date(base + 30 * DAY).toISOString();
  const status = ent?.status === "active" ? "active" : "trial";
  const { error } = await admin.from("beta_entitlements").upsert(
    { user_id: userId, status, expires_at: expires, payment_provider: "manual", reference: `admin:${caller.id}`, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return json({ error: "update_failed" }, 500);
  if (reqRow) await admin.from("beta_access_requests").update({ status: "approved", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("status", "pending");
  return json({ ok: true, expires_at: expires });
});
