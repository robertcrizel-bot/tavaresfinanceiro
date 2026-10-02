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

/**
 * True only for the editor preview (iframe / preview hosts).
 * The published app (*.lovable.app without "id-preview--") must NOT be blocked,
 * otherwise the share-target service worker is never registered.
 */
export function isLovablePreview(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  return (
    inIframe ||
    host.startsWith("id-preview--") ||
    /lovableproject\.com$|gptengineer\.run$/.test(host) ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

export function registerReceiptServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (isLovablePreview()) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => void r.unregister()))
      .catch(() => undefined);
    return;
  }

  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
