const SHARE_CACHE = "shared-receipt";
const SHARE_KEY = "/__shared-receipt";
const DIAG_KEY = "/__shared-receipt-diag";
export const EXPECTED_SHARE_SW_VERSION = "share-v5";
let reloadingForNewController = false;

export interface ShareDiagnostics {
  sw: Record<string, unknown> | null;
  page: {
    hasCacheApi: boolean;
    swControlled: boolean;
    attempts: number;
    found: boolean;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    error?: string;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads (and clears) a file shared into the app from another app.
 * Retries briefly to tolerate the service worker finishing its write after navigation.
 */
export async function takeSharedReceiptWithDiagnostics(): Promise<{ file: File | null; diag: ShareDiagnostics }> {
  const diag: ShareDiagnostics = {
    sw: null,
    page: {
      hasCacheApi: typeof window !== "undefined" && "caches" in window,
      swControlled: typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller,
      attempts: 0,
      found: false,
    },
  };
  if (!diag.page.hasCacheApi) return { file: null, diag };

  let file: File | null = null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    for (let i = 0; i < 10 && !file; i++) {
      diag.page.attempts = i + 1;
      const response = await cache.match(SHARE_KEY, { ignoreSearch: true });
      if (response) {
        const blob = await response.blob();
        const name = decodeURIComponent(response.headers.get("X-File-Name") || "comprovante.jpg");
        const type = blob.type || response.headers.get("Content-Type") || "image/jpeg";
        file = new File([blob], name, { type });
        await cache.delete(SHARE_KEY);
      } else {
        await sleep(300);
      }
    }
    const d = await cache.match(DIAG_KEY);
    if (d) diag.sw = await d.json().catch(() => null);
  } catch (e) {
    diag.page.error = e instanceof Error ? e.message : String(e);
  }
  if (file) {
    diag.page.found = true;
    diag.page.fileName = file.name;
    diag.page.fileType = file.type;
    diag.page.fileSize = file.size;
  }
  return { file, diag };
}

export async function takeSharedReceipt(): Promise<File | null> {
  return (await takeSharedReceiptWithDiagnostics()).file;
}

export const isShareWorkerOutdated = (version: unknown) =>
  typeof version === "string" && version !== EXPECTED_SHARE_SW_VERSION;

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

export async function refreshReceiptServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  const activateWaitingWorker = () => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  };
  const watchInstallingWorker = () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") activateWaitingWorker();
    });
  };

  registration.addEventListener("updatefound", watchInstallingWorker);
  watchInstallingWorker();
  activateWaitingWorker();
  try {
    await registration.update();
  } finally {
    watchInstallingWorker();
    activateWaitingWorker();
  }
  return registration;
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

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForNewController) return;
    reloadingForNewController = true;
    window.location.reload();
  });

  const register = () => {
    void refreshReceiptServiceWorker().catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
