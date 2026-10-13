/**
 * parse-receipt-free — reads Brazilian receipts with Google Gemini using the
 * GEMINI_API_KEY secret (never exposed, never sent to the frontend).
 *
 * Security model:
 *   1. Deployed with verify_jwt = true (supabase/config.toml): the platform
 *      rejects requests without a valid Supabase JWT before reaching the code.
 *   2. GET and POST are re-verified against Supabase Auth (auth.getUser), so
 *      a self-decoded `sub` claim is NEVER trusted (fail-closed).
 *   3. Requests are rate-limited per authenticated user (PROVISIONAL
 *      in-memory window; not shared across isolates).
 *   4. Images are type- and size-limited (JPEG/PNG/WebP/HEIC, ≤ 5 MB) and
 *      the request body is capped at 8 MB.
 *
 * Billing protection: pinning gemini-2.5-flash does NOT guarantee free tier.
 * The operator MUST configure GEMINI_API_KEY from a Google project WITHOUT
 * billing. Quota/billing/auth failures stop the request with a clear message
 * — there is NO fallback to any paid provider or model.
 *
 * Setup required before this function works:
 *   supabase secrets set GEMINI_API_KEY=<key from a no-billing Google project>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { createFreeAiHandler } from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createFreeAiHandler({
  envGet: (name: string) => Deno.env.get(name),
  verifyUser: async (token: string) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  },
});

Deno.serve(handler);
