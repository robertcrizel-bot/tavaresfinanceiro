import { describe, expect, it, vi } from "vitest";
import { GEMMA_MAX_COMPLETION_TOKENS, parseGemmaResponse } from "../../cloudflare/financecontrol-workers-ai-poc/response";
import { FreeAiError } from "../../supabase/functions/parse-receipt-free/lib";

const receipt = { is_receipt: true, amount: 25, merchant_name: "SYNTHETIC MARKET", purchased_items: [] };
const text = JSON.stringify(receipt);
const completion = (content: unknown, finish_reason = "stop", completion_tokens = 100) => ({
  choices: [{ message: { content }, finish_reason }], usage: { completion_tokens, prompt_tokens: 200 },
});
function failure(output: unknown, reason: string, evidence?: string) {
  const log = vi.fn();
  expect(() => parseGemmaResponse(output, log)).toThrow(FreeAiError);
  expect(log).toHaveBeenCalledWith(expect.objectContaining({ scope: "workers-ai-response", reason,
    ...(evidence ? { truncationEvidence: evidence } : {}) }));
  expect(JSON.stringify(log.mock.calls)).not.toContain("SYNTHETIC MARKET");
  expect(JSON.stringify(log.mock.calls)).not.toContain('"amount":25');
  return log;
}
describe("Gemma response formats and safe diagnostics", () => {
  it("distinguishes unsupported envelopes without recording their keys or values", () => {
    const log = failure({ private_unknown_field: "SYNTHETIC MARKET" }, "response-incompatible");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private_unknown_field");
  });
  it("preserves complete OpenAI-format receipt JSON", () => {
    expect(parseGemmaResponse(completion(text))).toEqual(receipt);
  });
  it("accepts text content parts while excluding reasoning", () => {
    expect(parseGemmaResponse(completion([
      { type: "reasoning", text: '{"amount":999}' },
      { type: "text", text: text.slice(0, 20) },
      { type: "text", text: text.slice(20) },
    ]))).toEqual(receipt);
  });
  it("accepts a native Workers AI text response", () => {
    expect(parseGemmaResponse({ response: text })).toEqual(receipt);
  });
  it("accepts an already parsed native response without filling any fields", () => {
    expect(parseGemmaResponse({ response: { amount: 25 } })).toEqual({ amount: 25 });
  });
  it("accepts BOM, fenced JSON and surrounding prose with later braces", () => {
    expect(parseGemmaResponse(completion(`\uFEFFAqui esta:\n\`\`\`json\n${text}\n\`\`\`\nFim {nota}.`))).toEqual(receipt);
  });
  it("ignores completed thinking blocks instead of extracting their amounts", () => {
    expect(parseGemmaResponse(completion(`<think>{"amount":999}</think>\n${text}`))).toEqual(receipt);
  });
  it("respects braces and escaped quotes inside strings", () => {
    const data = { merchant_name: 'Loja {Teste} "Brasil"', amount: null };
    expect(parseGemmaResponse(completion(`Resultado: ${JSON.stringify(data)}\n{nota}`))).toEqual(data);
  });
  it("diagnoses missing text without logging provider payloads", () => {
    failure({ choices: [{ message: { reasoning_content: "SYNTHETIC MARKET" } }] }, "text-absent");
  });
  it("diagnoses blank content separately from invalid JSON", () => {
    failure(completion("   "), "text-absent");
    failure(completion('SYNTHETIC MARKET {"amount":not_a_number}'), "json-invalid");
  });
  it("rejects explicit length termination even if a JSON object is complete", () => {
    failure(completion(text, "length"), "response-truncated", "finish-reason");
    failure({ response: receipt, finish_reason: "length" }, "response-truncated", "finish-reason");
  });
  it("detects an exhausted token budget with no answer", () => {
    const log = failure(completion(null, "stop", GEMMA_MAX_COMPLETION_TOKENS), "response-truncated", "token-cap");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ completionTokens: 2048, maxCompletionTokens: 2048, capReached: true }));
  });
  it("does not salvage a nested product from truncated outer JSON", () => {
    failure(completion('{"merchant_name":"SYNTHETIC MARKET","purchased_items":[{"name":"ARROZ","total":10}]'),
      "response-truncated", "unclosed-json");
  });
  it("accepts complete JSON at the cap when the model reports a normal stop", () => {
    expect(parseGemmaResponse(completion(text, "stop", 2048))).toEqual(receipt);
  });
  it("rejects arrays and scalars rather than coercing them into receipts", () => {
    for (const value of ["[]", '[{"amount":25}]', '```json\n[{"amount":25}]\n```', '"SYNTHETIC MARKET"', "null", "25"]) {
      failure(completion(value), "json-invalid");
    }
  });
  it("does not use another choice or reasoning when the first answer is absent", () => {
    failure({ choices: [{ message: { content: null } }, { message: { content: text } }], response: text }, "text-absent");
  });
  it("never logs arbitrary finish_reason strings", () => {
    const log = failure(completion("", "SYNTHETIC MARKET"), "text-absent");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ finishReason: "unknown" }));
  });
  it("never salvages financial JSON from an unfinished reasoning block", () => {
    failure(completion(`Resposta: <think>${text}`), "text-absent");
  });
});
