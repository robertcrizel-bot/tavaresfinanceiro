/**
 * parse-receipt-free — reads Brazilian receipts with Google Gemini using the
 * GEMINI_API_KEY secret (never exposed). Every request (GET status and POST)
 * requires a Supabase access token verified server-side via Auth getUser.
 * Rate limiting is per instance only (best effort). No paid fallback.
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
