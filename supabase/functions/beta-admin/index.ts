/**
 * beta-admin — owner-only management of Beta access.
 * Every action (whoami included) verifies the session with auth.getUser and
 * checks public.user_roles on the server. The service key never leaves here.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./lib.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!URL_ || !ANON || !SERVICE) throw new Error("beta-admin: missing server configuration");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(URL_, SERVICE, opts);
const authClient = createClient(URL_, ANON, opts);

const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const stamp = () => new Date().toISOString();

Deno.serve(createHandler({
  async getCallerId(token) {
    const { data, error } = await authClient.auth.getUser(token);
    return error || !data?.user ? null : data.user.id;
  },
  async isAdmin(userId) {
    const row = must(await db.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle());
    return !!row;
  },
  async userExists(userId) {
    const { data } = await db.auth.admin.getUserById(userId);
    return !!data?.user;
  },
  async getPerson(userId) {
    const { data } = await db.auth.admin.getUserById(userId);
    const u = data?.user;
    const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
    return { email: u?.email ?? null, name };
  },
  async hasRequest(userId) {
    return !!must(await db.from("beta_access_requests").select("id").eq("user_id", userId).limit(1).maybeSingle());
  },
  async getEntitlement(userId) {
    return must(await db.from("beta_entitlements").select("status,expires_at").eq("user_id", userId).maybeSingle());
  },
  async listRequests() {
    return must(await db.from("beta_access_requests").select("user_id,status,created_at").order("created_at", { ascending: false }));
  },
  async listEntitlements() {
    return must(await db.from("beta_entitlements").select("user_id,status,expires_at"));
  },
  async upsertEntitlement(userId, status, expiresAt, reference) {
    must(await db.from("beta_entitlements").upsert(
      { user_id: userId, status, expires_at: expiresAt, payment_provider: "manual", reference, updated_at: stamp() },
      { onConflict: "user_id" },
    ));
  },
  async revokeEntitlement(userId) {
    must(await db.from("beta_entitlements").update({ status: "revoked", updated_at: stamp() }).eq("user_id", userId).neq("status", "revoked"));
  },
  async approvePendingRequest(userId) {
    must(await db.from("beta_access_requests").update({ status: "approved", updated_at: stamp() }).eq("user_id", userId).eq("status", "pending"));
  },
  now: () => Date.now(),
}));
