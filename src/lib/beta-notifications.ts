import { useEffect, useState } from "react";
import { callBetaAdmin } from "@/lib/beta-admin";
import { supabase } from "@/integrations/supabase/client";

type PendingRequest = { user_id: string; status: string; created_at: string };
type ListResult = { requests: PendingRequest[] };

const INTERVAL_MS = 60_000;

function markerKey(userId: string) {
  return `finvision-beta-notifications-last-check:${userId}`;
}

/** Browser alerts work while the FinVision app is running, not with the app closed.
 * The server continues to enforce authorization on each list request.
 */
export function useBetaRequestAlerts(isAdmin: boolean, userId: string | undefined) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setPendingCount(0);
      return;
    }
    let active = true;
    let running = false;

    const check = async () => {
      if (!active || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const result = await callBetaAdmin<ListResult>("list");
        if (!active) return;
        const requests = result.requests.filter((request) => request.status === "pending");
        setPendingCount(requests.length);
        const newest = requests.reduce((max, request) => Math.max(max, Date.parse(request.created_at) || 0), 0);
        const key = markerKey(userId);
        const previousRaw = window.localStorage.getItem(key);
        const previous = previousRaw === null ? null : Number(previousRaw);
        if (previous !== null && Number.isFinite(previous) && newest > previous &&
            "Notification" in window && Notification.permission === "granted") {
          const notification = new Notification("FinVision — nova solicitação Beta", {
            body: "Há um novo pedido de acesso. Abra Administração para conferir.",
            icon: "/finvision-192-v3.png",
            tag: "finvision-beta-request",
          });
          notification.onclick = () => {
            window.focus();
            window.location.assign("/admin");
          };
        }
        if (previous === null || !Number.isFinite(previous) || newest > previous) {
          window.localStorage.setItem(key, String(Math.max(newest, Date.now() - 1000)));
        }
      } catch {
        // Don't announce success or overwrite last-check markers if the server fails.
      } finally {
        running = false;
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), INTERVAL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [isAdmin, userId]);

  return pendingCount;
}

export async function enableBrowserAdminAlerts(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window) || !window.isSecureContext) return "unsupported";
  return Notification.requestPermission();
}

function vapidBytes(key: string): Uint8Array {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  return new Uint8Array([...atob(base64)].map((char) => char.charCodeAt(0)));
}

export async function enableAdminMobilePush(): Promise<"enabled" | "denied" | "unsupported" | "server_not_ready"> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)
      || !window.isSecureContext) return "unsupported";
  // Ask from the user click (before any awaited network work) to preserve user activation.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const { data: config, error: configError } = await supabase.functions.invoke<{ publicKey: string | null; pushReady: boolean }>(
    "beta-notify", { body: { action: "config" } },
  );
  if (configError || !config?.pushReady || !config.publicKey) return "server_not_ready";

  const registration = await navigator.serviceWorker.ready;
  const previous = await registration.pushManager.getSubscription();
  const subscription = previous ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidBytes(config.publicKey),
  });
  const { error } = await supabase.functions.invoke("beta-notify", {
    body: { action: "subscribe", subscription: subscription.toJSON() },
  });
  if (error) {
    if (!previous) await subscription.unsubscribe().catch(() => false);
    return "server_not_ready";
  }
  return "enabled";
}
