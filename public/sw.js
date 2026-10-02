// Minimal service worker: only exists to receive files shared from other apps.
// It intentionally does NOT cache app assets, so the app never serves stale content.

const SW_VERSION = "share-v3";
const SHARE_CACHE = "shared-receipt";
const SHARE_KEY = "/__shared-receipt";
const DIAG_KEY = "/__shared-receipt-diag";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function isFileLike(v) {
  return typeof v === "object" && v !== null && "size" in v && typeof v.arrayBuffer === "function";
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/receipt-share") return;

  event.respondWith(
    (async () => {
      const diag = {
        swVersion: SW_VERSION,
        at: new Date().toISOString(),
        contentType: event.request.headers.get("content-type"),
        fields: [],
        stored: false,
        error: null,
      };
      try {
        const formData = await event.request.formData();
        let file = null;
        for (const [name, value] of formData.entries()) {
          const fileLike = isFileLike(value);
          diag.fields.push(
            fileLike
              ? { name, kind: "file", fileName: value.name || "", type: value.type || "", size: value.size }
              : { name, kind: "text", length: String(value).length },
          );
          if (!file && fileLike && value.size > 0) file = value;
        }

        if (file) {
          // Copy bytes into memory first: the request body stream is single-use.
          const bytes = await file.arrayBuffer();
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            SHARE_KEY,
            new Response(bytes, {
              headers: {
                "Content-Type": file.type || "image/jpeg",
                "X-File-Name": encodeURIComponent(file.name || "comprovante.jpg"),
              },
            }),
          );
          diag.stored = Boolean(await cache.match(SHARE_KEY));
          diag.storedSize = bytes.byteLength;
        }
      } catch (e) {
        diag.error = e && e.message ? e.message : String(e);
      }
      try {
        const cache = await caches.open(SHARE_CACHE);
        await cache.put(DIAG_KEY, new Response(JSON.stringify(diag), { headers: { "Content-Type": "application/json" } }));
      } catch {
        // ignore
      }
      return Response.redirect(new URL("/receipt?shared=1", self.location.origin).href, 303);
    })(),
  );
});
