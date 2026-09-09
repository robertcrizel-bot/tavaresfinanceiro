// Minimal service worker: only exists to receive files shared from other apps.
// It intentionally does NOT cache app assets, so the app never serves stale content.

const SHARE_CACHE = "shared-receipt";
const SHARE_KEY = "/__shared-receipt";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/receipt-share") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
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
          }
        } catch (e) {
          // fall through to the app, which will show the manual picker
        }
        const redirectTarget = new URL("./receipt?shared=1", self.registration.scope).href;
        return Response.redirect(redirectTarget, 303);
      })(),
    );
  }
});
