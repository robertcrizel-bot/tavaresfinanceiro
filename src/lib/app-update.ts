export type AppUpdateListener = () => void;

const APP_BUSY_REASONS = new Map<string, number>();
const listeners = new Set<AppUpdateListener>();

let updateAvailable = false;
let dismissed = false;
let watcherStarted = false;

function notify() {
  listeners.forEach((listener) => listener());
}

export function beginAppBusy(reason: string) {
  APP_BUSY_REASONS.set(reason, (APP_BUSY_REASONS.get(reason) ?? 0) + 1);
  notify();
}

export function endAppBusy(reason: string) {
  const count = APP_BUSY_REASONS.get(reason) ?? 0;
  if (count <= 1) APP_BUSY_REASONS.delete(reason);
  else APP_BUSY_REASONS.set(reason, count - 1);
  notify();
}

export function isAppBusy(): boolean {
  for (const count of APP_BUSY_REASONS.values()) {
    if (count > 0) return true;
  }
  return false;
}

export function subscribeAppUpdate(listener: AppUpdateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAppUpdateState(): { updateAvailable: boolean; dismissed: boolean; busy: boolean } {
  return { updateAvailable, dismissed, busy: isAppBusy() };
}

export function dismissAppUpdateNotice() {
  dismissed = true;
  notify();
}

function selectAppEntrySrc(doc: Document): string | null {
  const scripts = Array.from(doc.querySelectorAll('script[type="module"][src]'));
  const match = scripts.find((script) => {
    const src = script.getAttribute("src") ?? "";
    return src.includes("/assets/") || src.startsWith("/src/");
  });
  if (!match) return null;
  const src = match.getAttribute("src") ?? "";
  try {
    const url = new URL(src, window.location.origin);
    return url.pathname + url.search;
  } catch {
    return src;
  }
}

export function extractAppEntrySrc(html: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return selectAppEntrySrc(doc);
}

export function currentAppEntrySrc(
  doc: Document | null = typeof document !== "undefined" ? document : null,
): string | null {
  return doc ? selectAppEntrySrc(doc) : null;
}

export async function checkForAppUpdate(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const current = currentAppEntrySrc();
  if (!current) return false;
  try {
    const response = await fetch(new URL("/", window.location.origin).href, {
      cache: "no-store",
      headers: { accept: "text/html" },
    });
    if (!response.ok) return false;
    const deployed = extractAppEntrySrc(await response.text());
    if (deployed && deployed !== current) {
      updateAvailable = true;
      dismissed = false;
      notify();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function requestAppReload(): boolean {
  if (typeof window === "undefined") return false;
  if (isAppBusy()) return false;
  window.location.reload();
  return true;
}

export function startAppUpdateWatcher() {
  if (typeof window === "undefined" || watcherStarted) return;
  watcherStarted = true;

  const check = () => {
    void checkForAppUpdate();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("pageshow", check);
  window.setTimeout(check, 8000);
}

export function __resetAppUpdateForTests() {
  APP_BUSY_REASONS.clear();
  listeners.clear();
  updateAvailable = false;
  dismissed = false;
  watcherStarted = false;
}
