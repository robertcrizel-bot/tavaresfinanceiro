// Minimal service worker: only exists to receive files shared from other apps.
// It intentionally does NOT cache app assets, so the app never serves stale content.

const SW_VERSION = "share-v5";
const SHARE_CACHE = "shared-receipt";
const SHARE_KEY = "/__shared-receipt";
const DIAG_KEY = "/__shared-receipt-diag";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(`${SHARE_CACHE}-`) && name !== SHARE_CACHE)
      .map((name) => caches.delete(name)));
    const cache = await caches.open(SHARE_CACHE);
    await cache.delete(DIAG_KEY);
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "GET_VERSION" && event.ports?.[0]) {
    event.ports[0].postMessage({ swVersion: SW_VERSION });
  }
});

function isFileLike(value) {
  return typeof value === "object" && value !== null && "size" in value && typeof value.arrayBuffer === "function";
}

function getBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  return (match?.[1] || match?.[2] || "").trim();
}

function findBytes(source, target, start = 0) {
  if (target.length === 0) return start;
  outer: for (let i = start; i <= source.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (source[i + j] !== target[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function decodeFileName(contentDisposition) {
  const encoded = /filename\*=(?:UTF-8'')?([^;\r\n]+)/i.exec(contentDisposition)?.[1]?.trim();
  const regular = /filename=(?:"([^"]*)"|([^;\r\n]+))/i.exec(contentDisposition);
  const value = encoded || regular?.[1] || regular?.[2]?.trim() || "";
  if (!value) return "";
  try {
    return decodeURIComponent(value.replace(/^"|"$/g, ""));
  } catch {
    return value.replace(/^"|"$/g, "");
  }
}

function extractMultipartFile(rawBuffer, contentType) {
  const boundary = getBoundary(contentType);
  if (!boundary) return null;

  const bytes = new Uint8Array(rawBuffer);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const boundaryBytes = encoder.encode(`--${boundary}`);
  const nextBoundaryBytes = encoder.encode(`\r\n--${boundary}`);
  const headerEndBytes = encoder.encode("\r\n\r\n");
  let boundaryIndex = findBytes(bytes, boundaryBytes);

  while (boundaryIndex >= 0) {
    let headerStart = boundaryIndex + boundaryBytes.length;
    if (bytes[headerStart] === 45 && bytes[headerStart + 1] === 45) break;
    if (bytes[headerStart] === 13 && bytes[headerStart + 1] === 10) headerStart += 2;

    const headerEnd = findBytes(bytes, headerEndBytes, headerStart);
    if (headerEnd < 0) break;
    const headers = decoder.decode(bytes.slice(headerStart, headerEnd));
    const bodyStart = headerEnd + headerEndBytes.length;
    const nextBoundary = findBytes(bytes, nextBoundaryBytes, bodyStart);
    if (nextBoundary < 0) break;

    const disposition = /content-disposition:\s*([^\r\n]+)/i.exec(headers)?.[1] || "";
    const fileName = decodeFileName(disposition);
    const fileType = /content-type:\s*([^;\r\n]+)/i.exec(headers)?.[1]?.trim() || "";
    const isSupportedType = fileType.startsWith("image/") || fileType === "application/pdf";
    if ((fileName || isSupportedType) && nextBoundary > bodyStart) {
      return {
        bytes: bytes.slice(bodyStart, nextBoundary),
        fileName: fileName || (fileType === "application/pdf" ? "comprovante.pdf" : "comprovante.jpg"),
        fileType: fileType || "application/octet-stream",
      };
    }

    boundaryIndex = nextBoundary + 2;
  }
  return null;
}

async function storeSharedFile(bytes, fileName, fileType) {
  const cache = await caches.open(SHARE_CACHE);
  await cache.put(
    SHARE_KEY,
    new Response(bytes, {
      headers: {
        "Content-Type": fileType || "image/jpeg",
        "X-File-Name": encodeURIComponent(fileName || "comprovante.jpg"),
      },
    }),
  );
  return Boolean(await cache.match(SHARE_KEY));
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/receipt-share") return;
  const rawRequest = event.request.clone();

  event.respondWith(
    (async () => {
      const contentType = event.request.headers.get("content-type");
      const diag = {
        swVersion: SW_VERSION,
        at: new Date().toISOString(),
        contentType,
        rawBodyLength: null,
        formDataEntryCount: 0,
        fields: [],
        stored: false,
        error: null,
        multipartFallbackUsed: false,
        filePartFound: false,
        fileName: null,
        fileType: null,
        fileSize: null,
      };
      const rawBodyResult = (async () => {
        try {
          const rawBuffer = await rawRequest.arrayBuffer();
          return { buffer: rawBuffer, error: null };
        } catch (e) {
          return { buffer: null, error: e && e.message ? e.message : String(e) };
        }
      })();

      let file = null;
      try {
        const formData = await event.request.formData();
        for (const [name, value] of formData.entries()) {
          diag.formDataEntryCount++;
          const fileLike = isFileLike(value);
          diag.fields.push(
            fileLike
              ? { name, kind: "file", fileName: value.name || "", type: value.type || "", size: value.size }
              : { name, kind: "text", length: String(value).length },
          );
          if (!file && fileLike && value.size > 0) file = value;
        }
      } catch (e) {
        diag.error = e && e.message ? e.message : String(e);
      }

      const rawBody = await rawBodyResult;
      diag.rawBodyLength = rawBody.buffer?.byteLength ?? null;
      if (rawBody.error) diag.error = [diag.error, `raw body: ${rawBody.error}`].filter(Boolean).join("; ");

      try {
        let fileBytes = null;
        let fileName = "";
        let fileType = "";
        if (file) {
          fileBytes = await file.arrayBuffer();
          fileName = file.name || "comprovante.jpg";
          fileType = file.type || "image/jpeg";
          diag.filePartFound = true;
        } else if (diag.formDataEntryCount === 0 && rawBody.buffer) {
          const boundary = getBoundary(contentType);
          const minimumMultipartLength = boundary
            ? Math.max(128, new TextEncoder().encode(`--${boundary}--\r\n`).byteLength)
            : Infinity;
          if (rawBody.buffer.byteLength > minimumMultipartLength) {
            diag.multipartFallbackUsed = true;
            const extracted = extractMultipartFile(rawBody.buffer, contentType);
            diag.filePartFound = Boolean(extracted);
            if (extracted) {
              fileBytes = extracted.bytes;
              fileName = extracted.fileName;
              fileType = extracted.fileType;
            }
          }
        }

        if (fileBytes && fileBytes.byteLength > 0) {
          diag.fileName = fileName;
          diag.fileType = fileType;
          diag.fileSize = fileBytes.byteLength;
          diag.stored = await storeSharedFile(fileBytes, fileName, fileType);
          if (diag.stored) diag.storedSize = fileBytes.byteLength;
        }
      } catch (e) {
        const processingError = e && e.message ? e.message : String(e);
        diag.error = [diag.error, processingError].filter(Boolean).join("; ");
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
