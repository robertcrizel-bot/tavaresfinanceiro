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
