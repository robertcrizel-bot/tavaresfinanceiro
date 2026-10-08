import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TextDecoder, TextEncoder } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPECTED_SHARE_SW_VERSION,
  isShareWorkerOutdated,
  refreshReceiptServiceWorker,
} from "@/lib/shared-receipt";

const serviceWorkerSource = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

const createWorkerHarness = () => {
  const listeners: Record<string, (event: any) => void> = {};
  const cacheStores = new Map<string, Map<string, any>>();
  const skipWaiting = vi.fn();
  const claim = vi.fn().mockResolvedValue(undefined);
  const self = {
    location: { origin: "https://finance.example" },
    clients: { claim },
    skipWaiting,
    addEventListener: (type: string, listener: (event: any) => void) => { listeners[type] = listener; },
  };
  const caches = {
    keys: vi.fn(async () => [...cacheStores.keys()]),
    delete: vi.fn(async (name: string) => cacheStores.delete(name)),
    open: vi.fn(async (name: string) => {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const store = cacheStores.get(name)!;
      return {
        put: async (key: string, response: any) => { store.set(key, response); },
        match: async (key: string) => store.get(key),
        delete: async (key: string) => store.delete(key),
      };
    }),
  };
  class FakeResponse {
    body: any;
    init: any;

    constructor(body: any, init?: any) {
      this.body = body;
      this.init = init;
    }

    static redirect(url: string, status: number) {
      return { url, status };
    }
  }

  new Function("self", "caches", "Response", "URL", "TextEncoder", "TextDecoder", serviceWorkerSource)(
    self,
    caches,
    FakeResponse,
    URL,
    TextEncoder,
    TextDecoder,
  );

  const dispatchFetch = async (request: any) => {
    let responsePromise: Promise<any> | undefined;
    listeners.fetch({
      request,
      respondWith: (promise: Promise<any>) => { responsePromise = promise; },
    });
    return responsePromise ? responsePromise : null;
  };
  const getStored = (key: string) => cacheStores.get("shared-receipt")?.get(key);
  const getDiagnostics = () => JSON.parse(getStored("/__shared-receipt-diag").body);

  return { listeners, cacheStores, caches, skipWaiting, claim, dispatchFetch, getStored, getDiagnostics };
};

const createRequest = (rawBody: ArrayBuffer, entries: [string, any][], contentType: string) => ({
  url: "https://finance.example/receipt-share",
  method: "POST",
  headers: { get: (name: string) => name.toLowerCase() === "content-type" ? contentType : null },
  clone: () => ({ arrayBuffer: async () => rawBody }),
  formData: vi.fn(async () => ({ entries: () => entries[Symbol.iterator]() })),
});

const concatBytes = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shared receipt worker refresh", () => {
  it("detects a worker version older than the app expects", () => {
    expect(EXPECTED_SHARE_SW_VERSION).toBe("share-v5");
    expect(isShareWorkerOutdated("share-v3")).toBe(true);
    expect(isShareWorkerOutdated("share-v5")).toBe(false);
  });

  it("requests an uncached update", async () => {
    const registration = {
      waiting: null,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    };
    const register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });

    await refreshReceiptServiceWorker();

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("asks a waiting worker to skip waiting", async () => {
    const waiting = { postMessage: vi.fn() };
    const registration = {
      waiting,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn().mockResolvedValue(registration) },
    });

    await refreshReceiptServiceWorker();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
});

describe("shared receipt service worker", () => {
  it("activates share-v5, clears stale diagnostics and claims clients", async () => {
    const harness = createWorkerHarness();
    harness.cacheStores.set("shared-receipt", new Map([["/__shared-receipt-diag", { body: "old" }]]));
    harness.cacheStores.set("shared-receipt-v3", new Map());
    let activation: Promise<void> | undefined;

    harness.listeners.message({ data: { type: "SKIP_WAITING" }, ports: [] });
    const versionPort = { postMessage: vi.fn() };
    harness.listeners.message({ data: { type: "GET_VERSION" }, ports: [versionPort] });
    harness.listeners.activate({ waitUntil: (promise: Promise<void>) => { activation = promise; } });
    await activation;

    expect(serviceWorkerSource).toContain('const SW_VERSION = "share-v5"');
    expect(versionPort.postMessage).toHaveBeenCalledWith({ swVersion: "share-v5" });
    expect(harness.skipWaiting).toHaveBeenCalled();
    expect(harness.claim).toHaveBeenCalled();
    expect(harness.cacheStores.has("shared-receipt-v3")).toBe(false);
    expect(harness.getStored("/__shared-receipt-diag")).toBeUndefined();
  });

  it("stores a valid file returned by formData", async () => {
    const harness = createWorkerHarness();
    const fileBytes = new Uint8Array([1, 2, 3, 4]);
    const file = {
      name: "photo.jpg",
      type: "image/jpeg",
      size: fileBytes.byteLength,
      arrayBuffer: async () => fileBytes.buffer,
    };
    const request = createRequest(new Uint8Array(200).buffer, [["file", file]], "multipart/form-data; boundary=form-data");

    const response = await harness.dispatchFetch(request);
    const diag = harness.getDiagnostics();

    expect(diag).toEqual(expect.objectContaining({
      swVersion: "share-v5",
      formDataEntryCount: 1,
      multipartFallbackUsed: false,
      filePartFound: true,
      fileName: "photo.jpg",
      fileType: "image/jpeg",
      fileSize: 4,
      stored: true,
    }));
    expect(harness.getStored("/__shared-receipt")).toBeTruthy();
    expect(response).toEqual({ url: "https://finance.example/receipt?shared=1", status: 303 });
  });

  it("extracts a file from raw multipart when formData is empty", async () => {
    const harness = createWorkerHarness();
    const boundary = "android-share-boundary";
    const encoder = new TextEncoder();
    const imageBytes = new Uint8Array([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
    const rawBody = concatBytes(
      encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="shared.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      imageBytes,
      encoder.encode(`\r\n--${boundary}--\r\n`),
    );
    const request = createRequest(rawBody.buffer, [], `multipart/form-data; boundary=${boundary}`);

    await harness.dispatchFetch(request);
    const diag = harness.getDiagnostics();

    expect(diag).toEqual(expect.objectContaining({
      rawBodyLength: rawBody.byteLength,
      formDataEntryCount: 0,
      multipartFallbackUsed: true,
      filePartFound: true,
      fileName: "shared.jpg",
      fileType: "image/jpeg",
      fileSize: imageBytes.byteLength,
      stored: true,
    }));
    expect(harness.getStored("/__shared-receipt")).toBeTruthy();
  });

  it("does not attempt multipart fallback for an empty raw body", async () => {
    const harness = createWorkerHarness();
    const request = createRequest(new ArrayBuffer(0), [], "multipart/form-data; boundary=empty-share");

    const response = await harness.dispatchFetch(request);
    const diag = harness.getDiagnostics();

    expect(diag).toEqual(expect.objectContaining({
      rawBodyLength: 0,
      formDataEntryCount: 0,
      multipartFallbackUsed: false,
      filePartFound: false,
      stored: false,
    }));
    expect(harness.getStored("/__shared-receipt")).toBeUndefined();
    expect(response).toEqual({ url: "https://finance.example/receipt?shared=1", status: 303 });
  });

  it("never serializes shared binary data as base64", () => {
    expect(serviceWorkerSource).not.toMatch(/base64|readAsDataURL/);
  });
});
