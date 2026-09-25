// Minimal service worker: only exists to receive files shared from other apps.
// It intentionally does NOT cache app assets, so the app never serves stale content.

const SHARE_CACHE = "shared-receipt";
const SHARE_KEY = "/__shared-receipt";
const DIAGNOSTIC_CACHE = "shared-receipt-diagnostics";
const DIAGNOSTIC_PREFIX = "/__shared-receipt-diagnostics/";

function createAttemptId() {
  const suffix = self.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${Date.now()}-${suffix}`;
}

async function appendDiagnostic(attemptId, sequence, stage, details) {
  try {
    const epochMs = Date.now();
    const id = `${epochMs}-service-worker-${String(sequence).padStart(4, "0")}`;
    const event = {
      id,
      attemptId,
      timestamp: new Date(epochMs).toISOString(),
      epochMs,
      source: "service-worker",
      stage,
      details,
    };
    const cache = await caches.open(DIAGNOSTIC_CACHE);
    const key = `${DIAGNOSTIC_PREFIX}${encodeURIComponent(attemptId)}/${id}`;
    await cache.put(key, new Response(JSON.stringify(event), {
      headers: { "Content-Type": "application/json" },
    }));
  } catch {
    // Diagnostics must never interrupt the share target.
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/receipt-share") {
    event.respondWith(
      (async () => {
        const attemptId = createAttemptId();
        let sequence = 0;
        const record = (stage, details) => appendDiagnostic(attemptId, ++sequence, stage, details);
        await record("sw_post_received", { method: event.request.method, pathname: url.pathname });
        try {
          const contentType = event.request.headers.get("content-type");
          const contentLength = event.request.headers.get("content-length");
          let byteLength = null;
          let bodyReadSucceeded = false;
          try {
            byteLength = (await event.request.clone().arrayBuffer()).byteLength;
            bodyReadSucceeded = true;
          } catch {
            // The original request must still be parsed if diagnostic inspection fails.
          }
          await record("sw_request_inspected", {
            contentType,
            contentLength,
            hasBody: event.request.body !== null,
            isMultipartFormData: /^multipart\/form-data(?:;|$)/i.test(contentType || ""),
            hasBoundary: /(?:^|;)\s*boundary\s*=/i.test(contentType || ""),
            bodyReadSucceeded,
            byteLength,
          });

          const formData = await event.request.formData();
          const entries = Array.from(formData.entries(), ([fieldName, value]) => {
            const isFile = typeof File !== "undefined" && value instanceof File;
            return {
              fieldName,
              entryType: isFile ? "File" : typeof value,
              ...(isFile
                ? { fileName: value.name, fileType: value.type, fileSize: value.size }
                : {}),
            };
          });
          await record("sw_multipart_parsed", {
            keys: Array.from(formData.keys()),
            entries,
          });
          let file = null;

          const candidateKeys = ["receipt", "file", "files", "image", "media"];
          for (const key of candidateKeys) {
            const entries = formData.getAll(key);
            const found = entries.find(
              (item) => typeof item === "object" && item !== null && "size" in item && item.size > 0
            );
            if (found) {
              file = found;
              break;
            }
          }

          // Fallback: check all form values for the first Blob/File
          if (!file) {
            for (const value of formData.values()) {
              if (typeof value === "object" && value !== null && "size" in value && value.size > 0) {
                file = value;
                break;
              }
            }
          }

          if (file) {
            await record("sw_file_found", {
              name: file.name || "comprovante",
              size: file.size,
              type: file.type || "application/octet-stream",
            });
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              SHARE_KEY,
              new Response(file, {
                headers: {
                  "Content-Type": file.type || "application/octet-stream",
                  "X-File-Name": encodeURIComponent(file.name || "comprovante"),
                },
              }),
            );
            const stored = await cache.match(SHARE_KEY);
            await record("sw_cache_write_finished", {
              sharedReceiptExists: Boolean(stored),
              storedSize: stored ? (await stored.clone().blob()).size : 0,
            });
          } else {
            await record("sw_file_not_found", { keys: Array.from(formData.keys()) });
          }
        } catch (e) {
          await record("sw_share_failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        await record("sw_redirecting", { target: "./receipt?shared=1" });
        const redirectUrl = new URL("./receipt", self.registration.scope);
        redirectUrl.searchParams.set("shared", "1");
        redirectUrl.searchParams.set("share_attempt", attemptId);
        const redirectTarget = redirectUrl.href;
        return Response.redirect(redirectTarget, 303);
      })(),
    );
  }
});
