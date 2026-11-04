/** Admin-only Web Push subscription and scheduled Beta-request delivery.
 * No notifications or account grants can be triggered from an untrusted client.
 * Required server secrets: BETA_NOTIFY_CRON_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL,
 * BETA_ALERT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cronSecret = Deno.env.get("BETA_NOTIFY_CRON_SECRET") ?? "";
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function requireData<T>(response: { data: T; error: { message: string } | null }): T {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}
type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
function validSubscription(x: unknown): x is Subscription {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  if (typeof s.endpoint !== "string" || s.endpoint.length > 2048 || s.endpoint.length < 30) return false;
  try {
    const u = new URL(s.endpoint);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    // Avoid arbitrary outgoing requests to attacker-supplied URLs.
    if (!["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com",
          "wns.windows.com", "notify.windows.com"].includes(u.hostname)
        && !u.hostname.endsWith(".push.apple.com")) return false;
  } catch { return false; }
  const keys = s.keys;
  if (!keys || typeof keys !== "object") return false;
  const k = keys as Record<string, unknown>;
  return typeof k.p256dh === "string" && k.p256dh.length >= 30 && k.p256dh.length <= 512
    && typeof k.auth === "string" && k.auth.length >= 8 && k.auth.length <= 256;
}
async function adminId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  const role = requireData(await db.from("user_roles").select("id").eq("user_id", data.user.id).eq("role", "admin").maybeSingle());
  return role ? data.user.id : null;
}
async function saveSubscription(userId: string, sub: Subscription) {
  requireData(await db.from("beta_push_subscriptions").upsert({
    endpoint: sub.endpoint, user_id: userId, p256dh: sub.keys.p256dh,
    auth_secret: sub.keys.auth, updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" }));
}
async function sendEmail(requestId: string, created: string, email: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const to = Deno.env.get("BETA_ALERT_EMAIL");
  if (!apiKey || !from || !to) throw new Error("email_not_configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to],
      subject: "FinVision — nova solicitação de acesso Beta",
      text: `Novo pedido de acesso Beta.\nSolicitante: ${email}\nData: ${created}\nIdentificador: ${requestId}\n\nConfira em https://finvision2026.lovable.app/admin\n\nA aprovação nunca é automática.`,
    }),
  });
  if (!response.ok) throw new Error(`email_delivery_${response.status}`);
}
async function sendPush() {
  if (!vapidPublic || !vapidPrivate || !vapidSubject) throw new Error("push_not_configured");
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const subscriptions = requireData(await db.from("beta_push_subscriptions").select("endpoint,p256dh,auth_secret"));
  if (subscriptions.length === 0) throw new Error("push_no_subscriptions");
  let delivered = 0;
  for (const s of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret },
      }, JSON.stringify({
        title: "FinVision — novo pedido Beta",
        body: "Novo pedido de acesso. Abra Administração para analisar.",
        url: "/admin",
      }), { TTL: 3600 });
      delivered++;
    } catch (err) {
      const status = typeof err === "object" && err !== null && "statusCode" in err ? Number(err.statusCode) : 0;
      if (status === 404 || status === 410) {
        await db.from("beta_push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }
  if (!delivered) throw new Error("push_delivery_failed");
}
async function dispatch() {
  const requests = requireData(await db.from("beta_access_requests")
    .select("id,user_id,created_at,status").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(100));
  let sent = 0, failed = 0;
  for (const request of requests) {
    for (const channel of ["email", "push"] as const) {
      const claimed = requireData(await db.rpc("beta_claim_notification", {
        p_request: request.id, p_channel: channel,
      }));
      if (!claimed) continue;
      try {
        if (channel === "email") {
          const { data, error } = await db.auth.admin.getUserById(request.user_id);
          if (error) throw error;
          await sendEmail(request.id, request.created_at, data.user?.email ?? "(sem e-mail)");
        } else {
          await sendPush();
        }
        requireData(await db.from("beta_notification_deliveries").update({
          delivered_at: new Date().toISOString(), last_error: null,
        }).eq("request_id", request.id).eq("channel", channel));
        sent++;
      } catch (err) {
        failed++;
        await db.from("beta_notification_deliveries").update({
          claimed_at: null, last_error: err instanceof Error ? err.message.slice(0, 120) : "delivery_failed",
        }).eq("request_id", request.id).eq("channel", channel);
      }
    }
  }
  return { processed: requests.length, sent, failed };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (!url || !anonKey || !serviceKey) return reply({ error: "misconfigured" }, 503);
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply({ error: "invalid_body" }, 400);
    input = parsed as Record<string, unknown>;
  } catch { return reply({ error: "invalid_json" }, 400); }
  if (input.action === "dispatch") {
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!cronSecret || cronSecret.length < 32 || bearer !== cronSecret) return reply({ error: "unauthorized" }, 401);
    try { return reply(await dispatch()); }
    catch { return reply({ error: "dispatch_failed" }, 500); }
  }
  const caller = await adminId(req).catch(() => null);
  if (!caller) return reply({ error: "forbidden" }, 403);
  if (input.action === "config") {
    return reply({ publicKey: vapidPublic || null, pushReady: !!(vapidPublic && vapidPrivate && vapidSubject) });
  }
  if (input.action === "subscribe") {
    if (!vapidPublic || !vapidPrivate) return reply({ error: "push_not_configured" }, 503);
    if (!validSubscription(input.subscription)) return reply({ error: "invalid_subscription" }, 400);
    try { await saveSubscription(caller, input.subscription); return reply({ ok: true }); }
    catch { return reply({ error: "subscription_failed" }, 500); }
  }
  if (input.action === "unsubscribe") {
    if (typeof input.endpoint !== "string" || input.endpoint.length > 2048) return reply({ error: "invalid_endpoint" }, 400);
    try {
      requireData(await db.from("beta_push_subscriptions").delete().eq("endpoint", input.endpoint).eq("user_id", caller));
      return reply({ ok: true });
    } catch { return reply({ error: "unsubscribe_failed" }, 500); }
  }
  return reply({ error: "invalid_action" }, 400);
});
