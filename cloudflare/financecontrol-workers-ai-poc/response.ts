import { FREE_AI_MESSAGES, FreeAiError, parseGeminiJsonText, type FreeAiLogger } from "../../supabase/functions/parse-receipt-free/lib";

export const GEMMA_MAX_COMPLETION_TOKENS = 2048;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
const tokenCount = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/** Extract only the first balanced JSON object, respecting strings/escapes.
 * Never salvage a nested product from an incomplete receipt or repair JSON. */
function jsonObject(text: string): { candidate?: string; incomplete: boolean } {
  const start = text.indexOf("{");
  if (start < 0) return { incomplete: false };
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { candidate: text.slice(start, i + 1), incomplete: false };
  }
  return { incomplete: true };
}

/** Provider metadata only: no response text, reasoning, error messages or images. */
export function parseGemmaResponse(output: unknown, log?: FreeAiLogger): Record<string, unknown> {
  const payload = record(output);
  const choice = Array.isArray(payload?.choices) ? record(payload.choices[0]) : undefined;
  const content = record(choice?.message)?.content;
  const finish = choice?.finish_reason ?? payload?.finish_reason;
  const finishReason = ["stop", "length", "max_tokens", "tool_calls", "content_filter"].includes(String(finish))
    ? String(finish) : "unknown";
  const usage = record(payload?.usage);
  const completionTokens = tokenCount(usage?.completion_tokens);
  const capReached = completionTokens !== undefined && completionTokens >= GEMMA_MAX_COMPLETION_TOKENS;
  let text: string | undefined;
  let parsed: Record<string, unknown> | undefined;
  let format = "none";
  if (typeof content === "string") { text = content; format = "choices-string"; }
  else if (Array.isArray(content)) {
    text = content.map(record).filter(part => part?.type === "text" || part?.type === "output_text")
      .map(part => typeof part?.text === "string" ? part.text : "").join("");
    format = "choices-text-parts";
  } else if (!Array.isArray(payload?.choices) && typeof payload?.response === "string") {
    text = payload.response; format = "response-string";
  } else if (!Array.isArray(payload?.choices) && record(payload?.response)) {
    parsed = record(payload?.response); format = "response-object";
  }
  const diagnostic = {
    scope: "workers-ai-response", format, finishReason,
    promptTokens: tokenCount(usage?.prompt_tokens), completionTokens,
    maxCompletionTokens: GEMMA_MAX_COMPLETION_TOKENS, capReached,
    textLength: text?.length ?? 0,
  };
  const fail = (reason: "text-absent" | "json-invalid" | "response-truncated" | "response-incompatible", evidence?: string): never => {
    log?.({ ...diagnostic, reason, truncationEvidence: evidence });
    throw new FreeAiError(422, FREE_AI_MESSAGES.unreadable);
  };
  if (finishReason === "length" || finishReason === "max_tokens") fail("response-truncated", "finish-reason");
  if (format === "none" && !choice) fail("response-incompatible");
  if (parsed) return parsed;
  // Ignore completed reasoning blocks; never parse reasoning as financial data.
  const cleaned = text?.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\uFEFF/, "").trim()
    .replace(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i, "$1").trim();
  if (!cleaned || cleaned.includes("<think>")) {
    if (capReached) fail("response-truncated", "token-cap");
    fail("text-absent");
  }
  // A valid bare object takes precedence; reject non-object JSON explicitly.
  try {
    const bare = JSON.parse(cleaned);
    if (record(bare)) return bare;
    fail("json-invalid");
  } catch (error) {
    if (error instanceof FreeAiError) throw error;
  }
  const extracted = jsonObject(cleaned);
  if (extracted.incomplete) fail("response-truncated", "unclosed-json");
  if (!extracted.candidate) {
    if (capReached) fail("response-truncated", "token-cap");
    fail("json-invalid");
  }
  try {
    return parseGeminiJsonText(extracted.candidate);
  } catch {
    if (capReached) fail("response-truncated", "token-cap");
    fail("json-invalid");
  }
}
