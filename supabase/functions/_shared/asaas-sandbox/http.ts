import { BillingError, fail, type Store } from "./domain.ts";
import { parseEvent, SandboxBilling, validateStart } from "./service.ts";
import type { SandboxConfig } from "./gateway.ts";

async function sameSecret(actual: string, expected: string) {
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function body(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      fail("BODY_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(joined));
  } catch {
    fail("INVALID_JSON", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("INVALID_JSON", 400);
  }
  return parsed as Record<string, unknown>;
}
export function handler(
  kind: "checkout" | "webhook" | "worker",
  config: SandboxConfig,
  store: Store,
  service: SandboxBilling,
  authenticate: (token: string) => Promise<string | null>,
) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": config.origin,
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (request.method === "OPTIONS" && kind === "checkout") {
      return new Response(null, { status: 204, headers });
    }
    try {
      if (request.method !== "POST") fail("METHOD_NOT_ALLOWED", 405);
      if (kind === "webhook") {
        if (
          !await sameSecret(
            request.headers.get("asaas-access-token") || "",
            config.webhookToken,
          )
        ) fail("UNAUTHORIZED", 401);
        await store.enqueue(parseEvent(await body(request, 65536)));
        return response({ received: true }); // only after durable persistence
      }
      if (kind === "worker") {
        if (
          !await sameSecret(
            request.headers.get("authorization") || "",
            `Bearer ${config.workerToken}`,
          )
        ) fail("UNAUTHORIZED", 401);
        return response(await service.drain());
      }
      if (
        request.headers.has("origin") &&
        request.headers.get("origin") !== config.origin
      ) fail("INVALID_ORIGIN", 403);
      const authorization = request.headers.get("authorization") || "";
      const user = authorization.startsWith("Bearer ")
        ? await authenticate(authorization.slice(7))
        : null;
      if (!user) fail("UNAUTHORIZED", 401);
      const payload = await body(request, 8192);
      if (payload.action === "start") {
        const input = validateStart(payload);
        return response(
          await service.start(user, input.method, input.name, input.cpf),
        );
      }
      if (Object.keys(payload).some((k) => k !== "action")) {
        fail("INVALID_REQUEST", 400);
      }
      if (payload.action === "status") {
        return response(await service.status(user));
      }
      if (payload.action === "cancel") {
        return response(await service.cancel(user));
      }
      fail("INVALID_ACTION", 400);
    } catch (error) {
      // No request/provider payload, identity, token or exception text in logs.
      return response({
        error: error instanceof BillingError
          ? error.code
          : "SANDBOX_OPERATION_FAILED",
      }, error instanceof BillingError ? error.status : 503);
    }
  };
}
