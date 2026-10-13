/**
 * parse-receipt-free — reads Brazilian financial receipts with Google Gemini
 * on the FREE tier only (model pinned to gemini-2.5-flash).
 *
 * Setup required before this function works:
 *   supabase secrets set GEMINI_API_KEY=<key from Google AI Studio>
 *
 * The key never reaches the frontend. Requests require a valid Supabase JWT
 * (verified upstream by the platform) and are rate-limited per user. There is
 * NO fallback to any paid provider: quota, auth or billing failures stop the
 * request with a clear message.
 */
import { createFreeAiHandler, GEMINI_API_KEY_ENV } from "./lib.ts";

const handler = createFreeAiHandler({
  envGet: (name: string) => {
    if (name === GEMINI_API_KEY_ENV) return Deno.env.get(GEMINI_API_KEY_ENV);
    return Deno.env.get(name);
  },
});

Deno.serve(handler);
