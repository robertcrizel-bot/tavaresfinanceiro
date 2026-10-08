import type { LocalReceiptInput } from "./schema";

export function buildLocalReceiptPrompt(input: LocalReceiptInput): string {
  const lines = input.groupedLines.length > 0
    ? input.groupedLines.map((line) => `[${line.index}] ${line.text}`).join("\n")
    : input.rawText;
  const categories = input.categories.length > 0
    ? `\nCategories: ${input.categories.join(", ")}`
    : "";

  return `Extract receipt JSON. Copy only text below. Never invent. T12/T18 are fiscal codes, never prices. Attach value lines to the previous product.${categories}
Return ONLY this JSON: {"is_receipt":true,"type":"expense","amount":null,"date":null,"time":null,"counterparty":null,"institution":null,"payment_method":"","category_hint":null,"receipt_id":null,"merchant_name":null,"tax_id":null,"fiscal_document_number":null,"card_brand":null,"card_last_four":null,"title":null,"notes":null,"purchased_items":[{"name":"","quantity":null,"unit_price":null,"total":null}],"low_confidence_fields":[]}
OCR:
${lines}`;
}
