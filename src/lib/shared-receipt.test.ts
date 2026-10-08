import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

describe("shared receipt service worker diagnostics", () => {
  it("clones and measures the raw request before parsing multipart form data", () => {
    const cloneIndex = serviceWorker.indexOf("const rawRequest = event.request.clone()");
    const formDataIndex = serviceWorker.indexOf("await event.request.formData()");

    expect(cloneIndex).toBeGreaterThan(-1);
    expect(formDataIndex).toBeGreaterThan(cloneIndex);
    expect(serviceWorker).toContain("const rawBuffer = await rawRequest.arrayBuffer()");
    expect(serviceWorker).toContain("rawBodyLength: null");
    expect(serviceWorker).toContain("diag.rawBodyLength = rawBody.length");
    expect(serviceWorker).toContain("formDataEntryCount: 0");
    expect(serviceWorker).toContain("diag.formDataEntryCount++");
  });

  it("keeps the existing formData flow and receipt redirect", () => {
    expect(serviceWorker).toContain("const formData = await event.request.formData()");
    expect(serviceWorker).toContain('new URL("/receipt?shared=1", self.location.origin)');
    expect(serviceWorker).not.toMatch(/base64|readAsDataURL/);
  });
});
