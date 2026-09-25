const SHARE_CACHE = "shared-receipt";
const SHARE_KEY = "/__shared-receipt";
const DIAGNOSTIC_CACHE = "shared-receipt-diagnostics";
const DIAGNOSTIC_PREFIX = "/__shared-receipt-diagnostics/";

export interface ShareDiagnosticEvent {
  id: string;
  attemptId: string;
  timestamp: string;
  epochMs: number;
  source: "service-worker" | "react";
  stage: string;
  details?: Record<string, unknown>;
}

let diagnosticSequence = 0;

export async function appendShareDiagnostic(
  attemptId: string,
  stage: string,
  details?: Record<string, unknown>,
): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const epochMs = Date.now();
    const sequence = ++diagnosticSequence;
    const id = `${epochMs}-react-${String(sequence).padStart(4, "0")}`;
    const event: ShareDiagnosticEvent = {
      id,
      attemptId,
      timestamp: new Date(epochMs).toISOString(),
      epochMs,
      source: "react",
      stage,
      details,
    };
    const cache = await caches.open(DIAGNOSTIC_CACHE);
    const key = `${DIAGNOSTIC_PREFIX}${encodeURIComponent(attemptId)}/${id}`;
    await cache.put(key, new Response(JSON.stringify(event), {
      headers: { "Content-Type": "application/json" },
    }));
  } catch {
    // Diagnostics must never interrupt receipt processing.
  }
}

export async function readShareDiagnostics(attemptId: string): Promise<ShareDiagnosticEvent[]> {
  if (!("caches" in window)) return [];
  const cache = await caches.open(DIAGNOSTIC_CACHE);
  const prefix = `${DIAGNOSTIC_PREFIX}${encodeURIComponent(attemptId)}/`;
  const keys = await cache.keys();
  const events = await Promise.all(
    keys
      .filter((request) => new URL(request.url).pathname.startsWith(prefix))
      .map(async (request) => {
        const response = await cache.match(request);
        return response ? response.json() as Promise<ShareDiagnosticEvent> : null;
      }),
  );
  return events
    .filter((event): event is ShareDiagnosticEvent => event !== null)
    .sort((a, b) => a.epochMs - b.epochMs || a.id.localeCompare(b.id));
}

/** Reads (and clears) a file that was shared into the app from another app. */
export async function takeSharedReceipt(attemptId?: string): Promise<File | null> {
  if (!("caches" in window)) return null;
  try {
    if (attemptId) await appendShareDiagnostic(attemptId, "react_take_started");
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_KEY);
    if (attemptId) {
      await appendShareDiagnostic(attemptId, "react_cache_checked", {
        sharedReceiptExists: Boolean(response),
      });
    }
    if (!response) return null;
    const blob = await response.blob();
    if (attemptId) {
      await appendShareDiagnostic(attemptId, "react_blob_recovered", {
        size: blob.size,
        type: blob.type || "application/octet-stream",
      });
    }
    const deleted = await cache.delete(SHARE_KEY);
    if (attemptId) {
      await appendShareDiagnostic(attemptId, "react_cache_entry_deleted", { deleted });
    }
    const name = decodeURIComponent(response.headers.get("X-File-Name") || "comprovante");
    const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
    if (attemptId) {
      await appendShareDiagnostic(attemptId, "react_file_created", {
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }
    return file;
  } catch (error) {
    if (attemptId) {
      await appendShareDiagnostic(attemptId, "react_take_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

export function isLovablePreview(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return /lovableproject\.com|lovable\.app|gptengineer\.run/.test(host);
}

export function registerReceiptServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isLovablePreview()) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
