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
          const file =
            formData.get("receipt") ||
            formData.get("file") ||
            formData.get("files") ||
            formData.get("image");
          if (file && typeof file !== "string") {
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
        return Response.redirect("/receipt?shared=1", 303);
      })(),
    );
  }
});
