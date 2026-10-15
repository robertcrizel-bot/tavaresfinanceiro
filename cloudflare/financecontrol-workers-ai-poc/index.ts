import { resolveAllowedOrigins, verifySupabaseUser, type Env } from "../financecontrol-gemini-free/src/index";
import {
  buildFreeReceiptInstruction, createFreeAiHandler, FREE_AI_MESSAGES,
  FreeAiError, parseImageDataUrl, type FreeAiRateBucket,
} from "../../supabase/functions/parse-receipt-free/lib";
import { GEMMA_MAX_COMPLETION_TOKENS, parseGemmaResponse } from "./response";

export const MODEL = "@cf/google/gemma-4-26b-a4b-it";
export interface PocEnv extends Omit<Env, "GEMINI_API_KEY"> {
  BUILD_COMMIT?: string;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}
const buckets = new Map<string, FreeAiRateBucket>();

export async function runGemma(env: PocEnv, instruction: string, imageDataUrl: string) {
  if (!env.AI) throw new Error("AI binding missing");
  return await env.AI.run(MODEL, {
    messages: [{ role: "user", content: [
      { type: "text", text: instruction },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ] }],
    stream: false,
    temperature: 0,
    max_completion_tokens: GEMMA_MAX_COMPLETION_TOKENS,
    response_format: { type: "json_object" },
    store: false,
  });
}

/** Gemma provider: reuse the verified Supabase user, CORS, limits, prompt and
 * ParsedReceipt normalization. Inference exclusively uses the AI binding. */
export function createPocHandler(env: PocEnv, authFetch: typeof fetch = fetch) {
  const handle = createFreeAiHandler({
    envGet: () => undefined,
    isConfigured: () => typeof env.AI?.run === "function",
    allowedOrigins: resolveAllowedOrigins(env.ALLOWED_ORIGINS),
    verifyUser: token => verifySupabaseUser(env, token, authFetch),
    rateBuckets: buckets,
    requestReceipt: async input => {
      parseImageDataUrl(input.imageDataUrl, input.imageLimits);
      let output: Awaited<ReturnType<typeof runGemma>>;
      try {
        output = await runGemma(env, buildFreeReceiptInstruction(
          input.categories, input.accounts, new Date().toISOString().split("T")[0],
        ), input.imageDataUrl);
      } catch (error) {
        // Provider messages may contain input: log only numeric error codes.
        const failure = error as { status?: unknown; code?: unknown } | null;
        const status = failure?.status === 429 ? 429 : 503;
        input.log?.({ scope: "workers-ai", model: MODEL, status,
          cloudflareCode: typeof failure?.code === "number" ? failure.code : undefined });
        throw new FreeAiError(status, status === 429 ? FREE_AI_MESSAGES.quotaExceeded : FREE_AI_MESSAGES.unavailable);
      }
      return parseGemmaResponse(output, input.log);
    },
  });
  return (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === "/version" && request.method === "GET") {
      return Promise.resolve(Response.json({ commit: env.BUILD_COMMIT ?? "development",
        model: MODEL, maxCompletionTokens: GEMMA_MAX_COMPLETION_TOKENS },
      { headers: { "Cache-Control": "no-store" } }));
    }
    return path === "/" ? handle(request) : Promise.resolve(new Response(null, { status: 404 }));
  };
}

export default {
  fetch(request: Request, env: PocEnv) { return createPocHandler(env)(request); },
};
