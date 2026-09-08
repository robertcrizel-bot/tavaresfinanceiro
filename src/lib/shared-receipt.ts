const SHARE_CACHE = "shared-receipt";
const SHARE_KEY = "/__shared-receipt";

/** Reads (and clears) a file that was shared into the app from another app. */
export async function takeSharedReceipt(): Promise<File | null> {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_KEY);
    if (!response) return null;
    const blob = await response.blob();
    await cache.delete(SHARE_KEY);
    const name = decodeURIComponent(response.headers.get("X-File-Name") || "comprovante");
    return new File([blob], name, { type: blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

export function registerReceiptServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
