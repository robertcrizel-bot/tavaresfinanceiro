/**
 * financecontrol-gemini-free — Cloudflare Worker (Free plan) behind the
 * "✨ Ler com IA grátis (teste)" button of FinanceControl.
 *
 * Security model (fail-closed, mirrors the Supabase Edge Function):
 *   1. The access token is verified against Supabase Auth `/auth/v1/user`
 *      with the project's public anon key. A self-decoded JWT `sub` claim is
 *      NEVER trusted: the Auth server must recognize the token.
 *   2. Requests without/with an invalid token are rejected with 401 before
 *      GEMINI_API_KEY is read and before Google is called.
 *   3. CORS is an exact-match allowlist (production domain + local dev
 *      origins). Not a public, unrestricted Google proxy.
 *   4. Per-user sliding-window rate limit + body/image size caps live in the
 *      shared handler (supabase/functions/parse-receipt-free/lib.ts).
 *
 * Billing protection: the key MUST come from a Google project WITHOUT
 * billing. Quota/billing/auth failures stop the request with a clear message
 * — there is NO fallback to any paid provider or model.
 *
 * Setup: npx wrangler secret put GEMINI_API_KEY   (typed by the operator in
 * the terminal; never committed, never logged, never sent to the browser).
 */
import {
  createFreeAiHandler,
  type FreeAiRateBucket,
} from "../../../supabase/functions/parse-receipt-free/lib.ts";

export interface Env {
  GEMINI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

/** Published app + the origins the local Vite dev/preview servers actually use. */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://tavares1989finance.lovable.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

/** Union of the built-in allowlist and any extra origins from ALLOWED_ORIGINS. */
export function resolveAllowedOrigins(raw?: string): string[] {
  const fromEnv = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv])];
}

/** Longest Supabase JWT we accept; anything bigger is garbage, not a session. */
export const MAX_ACCESS_TOKEN_LENGTH = 4096;

/**
 * Real token validation: asks Supabase Auth who the user is. Returns the user
 * id, or null (reject). Never logs the token.
 */
export async function verifySupabaseUser(
  env: Pick<Env, "SUPABASE_URL" | "SUPABASE_ANON_KEY">,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const baseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!baseUrl || !anonKey) return null; // not configured = reject everything
  if (!token || token.length > MAX_ACCESS_TOKEN_LENGTH) return null;
  try {
    const response = await fetchImpl(`${baseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { id?: unknown } | null;
    const id = body?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Isolates share nothing between deployments, but rate buckets MUST survive
 * across requests inside one isolate — so the map lives at module scope.
 */
const rateBuckets = new Map<string, FreeAiRateBucket>();

function readStringEnv(env: Env, name: string): string | undefined {
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/** Builds the shared handler bound to this request's `env` bindings. */
export function createWorkerHandler(
  env: Env,
  options: {
    fetchImpl?: typeof fetch;
    /** Test seam: production always uses the isolate-wide bucket map. */
    rateBuckets?: Map<string, FreeAiRateBucket>;
    /** Test seam: production keeps the sanitized default logger. */
    log?: (entry: Record<string, unknown>) => void;
  } = {},
): (request: Request) => Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return createFreeAiHandler({
    envGet: (name) => readStringEnv(env, name),
    allowedOrigins: resolveAllowedOrigins(env.ALLOWED_ORIGINS),
    rateBuckets: options.rateBuckets ?? rateBuckets,
    log: options.log,
    fetchImpl,
    verifyUser: (token) => verifySupabaseUser(env, token, fetchImpl),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return createWorkerHandler(env)(request);
  },
};
