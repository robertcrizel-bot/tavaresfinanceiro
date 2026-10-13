import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAppUpdateForTests,
  beginAppBusy,
  checkForAppUpdate,
  currentAppEntrySrc,
  dismissAppUpdateNotice,
  endAppBusy,
  extractAppEntrySrc,
  getAppUpdateState,
  isAppBusy,
  requestAppReload,
  startAppUpdateWatcher,
  subscribeAppUpdate,
} from "@/lib/app-update";

const CURRENT_HTML = '<script type="module" crossorigin src="/assets/index-AAA.js"></script>';
const NEW_HTML = '<script type="module" crossorigin src="/assets/index-BBB.js"></script>';

function setDocumentHtml(html: string) {
  document.body.innerHTML = html;
}

function stubFetchHtml(html: string, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, text: async () => html }));
}

function stubReload() {
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  return reload;
}

describe("app busy registry", () => {
  afterEach(() => __resetAppUpdateForTests());

  it("tracks busy state with refcounts", () => {
    expect(isAppBusy()).toBe(false);
    beginAppBusy("form");
    beginAppBusy("form");
    expect(isAppBusy()).toBe(true);
    endAppBusy("form");
    expect(isAppBusy()).toBe(true);
    endAppBusy("form");
    expect(isAppBusy()).toBe(false);
  });

  it("ignores unknown reason cleanup", () => {
    endAppBusy("ghost");
    expect(isAppBusy()).toBe(false);
  });

  it("notifies subscribers on busy changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppUpdate(listener);
    beginAppBusy("ocr");
    expect(listener).toHaveBeenCalledTimes(1);
    endAppBusy("ocr");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    beginAppBusy("ocr");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("exposes busy inside the update state", () => {
    beginAppBusy("camera");
    expect(getAppUpdateState().busy).toBe(true);
    endAppBusy("camera");
    expect(getAppUpdateState().busy).toBe(false);
  });
});

describe("entry extraction", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("extracts the hashed module entry from HTML", () => {
    expect(extractAppEntrySrc(NEW_HTML)).toBe("/assets/index-BBB.js");
  });

  it("returns null when no module script exists", () => {
    expect(extractAppEntrySrc("<html><body><p>sem script</p></body></html>")).toBeNull();
  });

  it("reads the currently loaded entry from the document", () => {
    setDocumentHtml(CURRENT_HTML);
    expect(currentAppEntrySrc()).toBe("/assets/index-AAA.js");
  });

  it("returns null when the document has no entry script", () => {
    expect(currentAppEntrySrc()).toBeNull();
  });
});

describe("checkForAppUpdate", () => {
  beforeEach(() => {
    __resetAppUpdateForTests();
    setDocumentHtml(CURRENT_HTML);
  });

  afterEach(() => {
    __resetAppUpdateForTests();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("detects a new deployed entry and marks the update available", async () => {
    stubFetchHtml(NEW_HTML);
    await expect(checkForAppUpdate()).resolves.toBe(true);
    expect(getAppUpdateState().updateAvailable).toBe(true);
  });

  it("stays silent when the deployed entry matches", async () => {
    stubFetchHtml(CURRENT_HTML);
    await expect(checkForAppUpdate()).resolves.toBe(false);
    expect(getAppUpdateState().updateAvailable).toBe(false);
  });

  it("fails closed when the network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(checkForAppUpdate()).resolves.toBe(false);
    expect(getAppUpdateState().updateAvailable).toBe(false);
  });

  it("fails closed on non-OK responses", async () => {
    stubFetchHtml(NEW_HTML, false);
    await expect(checkForAppUpdate()).resolves.toBe(false);
    expect(getAppUpdateState().updateAvailable).toBe(false);
  });

  it("requests the document without HTTP caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => CURRENT_HTML });
    vi.stubGlobal("fetch", fetchMock);
    await checkForAppUpdate();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("re-arms the notice after dismissal when a newer check runs", async () => {
    stubFetchHtml(NEW_HTML);
    await checkForAppUpdate();
    dismissAppUpdateNotice();
    expect(getAppUpdateState().dismissed).toBe(true);
    await checkForAppUpdate();
    expect(getAppUpdateState().dismissed).toBe(false);
  });
});

describe("requestAppReload", () => {
  afterEach(() => {
    __resetAppUpdateForTests();
    vi.unstubAllGlobals();
  });

  it("blocks reload while an operation is busy", () => {
    const reload = stubReload();
    beginAppBusy("camera");
    expect(requestAppReload()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when idle", () => {
    const reload = stubReload();
    expect(requestAppReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("startAppUpdateWatcher", () => {
  beforeEach(() => {
    __resetAppUpdateForTests();
    setDocumentHtml(CURRENT_HTML);
  });

  afterEach(() => {
    __resetAppUpdateForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("checks on the initial delay, on foreground, and on pageshow — once", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => CURRENT_HTML });
    vi.stubGlobal("fetch", fetchMock);

    startAppUpdateWatcher();
    startAppUpdateWatcher();

    vi.advanceTimersByTime(8000);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("pageshow"));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
