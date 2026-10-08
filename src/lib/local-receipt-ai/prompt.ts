import type { LocalReceiptInput } from "./schema";

function bboxSummary(bbox: [number, number][]): string {
  const xs = bbox.map(([x]) => x);
  const ys = bbox.map(([, y]) => y);
  return `${Math.round(Math.min(...xs))},${Math.round(Math.min(...ys))},${Math.round(Math.max(...xs))},${Math.round(Math.max(...ys))}`;
}

function documentLines(input: LocalReceiptInput): string {
  if (input.groupedLines.length === 0) return input.rawText;

  return input.groupedLines.map((line) => {
    const regions = line.regions.map((region) =>
      `"${region.text}" c=${region.confidence.toFixed(2)} box=${bboxSummary(region.bbox)}`
    ).join("; ");
    return `[${line.index}] ${line.text}\n  regions: ${regions}`;
  }).join("\n");
}

export function buildLocalReceiptPrompt(input: LocalReceiptInput): string {
  const categories = input.categories.length > 0 ? input.categories.join(", ") : "none";
  const accounts = input.accounts.length > 0 ? input.accounts.join(", ") : "none";

  return `You extract Brazilian financial receipts from OCR text and coordinates. Return only one valid JSON object, without markdown.

Never invent text or numbers. A value may be returned only when it is present in the OCR document below. If OCR did not recognize it, return null, an empty string, or [] as required. Preserve uncertain readable items and list purchased_items in low_confidence_fields.

Rules:
- type is income only when the receipt owner received money; otherwise expense for a purchase/payment, or unknown.
- amount is BRL as a JSON number. date is YYYY-MM-DD and time is HH:MM:SS.
- purchased_items is used only for fiscal receipts and must contain one object per readable product, in document order.
- Join a product description with adjacent quantity/price lines. Barcode and PLU codes are not separate products.
- Each item has name, quantity, unit_price and total. Keep null when a number is absent or unreadable.
- Tokens such as T12 and T18 are fiscal markers, never prices or totals.
- Never treat CNPJ, address, operator, subtotal, discount, tax, change, payment method or totals as products.
- category_hint may use one of: ${categories}.
- institution may use a matching account only when supported by OCR. Accounts: ${accounts}.
- low_confidence_fields lists uncertain field names.

Return exactly this schema, with every key present:
{"is_receipt":true,"type":"expense","amount":null,"date":null,"time":null,"counterparty":null,"institution":null,"payment_method":"","category_hint":null,"receipt_id":null,"merchant_name":null,"tax_id":null,"fiscal_document_number":null,"card_brand":null,"card_last_four":null,"title":null,"notes":null,"purchased_items":[{"name":"","quantity":null,"unit_price":null,"total":null}],"low_confidence_fields":[]}

OCR DOCUMENT
${documentLines(input)}`;
}
