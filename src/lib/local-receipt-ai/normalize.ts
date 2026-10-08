import type { ParsedReceipt, PurchasedItem } from "@/lib/receipt";
import type { LocalReceiptInput } from "./schema";

const RECEIPT_TYPES = new Set(["income", "expense", "unknown"]);
const PAYMENT_METHODS = new Set([
  "Pix",
  "Boleto",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Dinheiro",
  "Transferência",
  "Outro",
  "unknown",
  "",
]);

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("O modelo local não retornou JSON.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error("O JSON do modelo local está incompleto.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Campo local inválido: ${field}.`);
  return value.trim() || null;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Campo local inválido: ${field}.`);
  }
  return value;
}

function sourceText(input: LocalReceiptInput): string {
  return [input.rawText, ...input.regions.map((region) => region.text)].join("\n");
}

function sourceSupportsText(source: string, value: string | null): string | null {
  if (value === null) return null;
  if (value.trim() === "") return value;
  return normalizedText(source).includes(normalizedText(value)) ? value : null;
}

function sourceSupportsDate(source: string, value: string | null): string | null {
  if (value === null) return null;
  const normalizedSource = normalizedText(source);
  if (normalizedSource.includes(normalizedText(value))) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) {
    const [, year, month, day] = match;
    const variants = [`${day} ${month} ${year}`, `${day}${month}${year}`];
    if (variants.some((variant) => normalizedSource.includes(variant))) return value;
  }
  return null;
}

function sourceSupportsTime(source: string, value: string | null): string | null {
  if (value === null) return null;
  const normalizedSource = normalizedText(source);
  if (normalizedSource.includes(normalizedText(value))) return value;
  const digits = value.trim().replace(/[^0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (digits && normalizedSource.includes(digits)) return value;
  return null;
}

function sourceNumbers(source: string): number[] {
  const values: number[] = [];
  const regex = /(?:^|[^a-z0-9])(\d+(?:[.,]\d+)?)(?=(?:\s*(?:kg|g|un|und|ml|lt|l)\b)|[^a-z0-9]|$)/gi;
  for (const match of source.matchAll(regex)) {
    const parsed = Number(match[1].replace(",", "."));
    if (Number.isFinite(parsed)) values.push(parsed);
  }
  return values;
}

function sourceSupportsNumber(numbers: number[], value: number | null): number | null {
  if (value === null) return null;
  return numbers.some((candidate) => Math.abs(candidate - value) < 0.00001) ? value : null;
}

function normalizeItems(value: unknown, source: string, numbers: number[]): PurchasedItem[] {
  if (!Array.isArray(value)) throw new Error("Campo local inválido: purchased_items.");

  return value.flatMap((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`Item local inválido: ${index}.`);
    if (typeof candidate.name !== "string") throw new Error(`Nome de item local inválido: ${index}.`);
    const name = sourceSupportsText(source, candidate.name.trim());
    if (!name) return [];
    return [{
      name,
      quantity: sourceSupportsNumber(numbers, nullableNumber(candidate.quantity, `purchased_items[${index}].quantity`)),
      unit_price: sourceSupportsNumber(numbers, nullableNumber(candidate.unit_price, `purchased_items[${index}].unit_price`)),
      total: sourceSupportsNumber(numbers, nullableNumber(candidate.total, `purchased_items[${index}].total`)),
    }];
  });
}

export function normalizeLocalReceiptResponse(rawResponse: string, input: LocalReceiptInput): ParsedReceipt {
  const value = extractJsonObject(rawResponse);
  if (!isRecord(value)) throw new Error("Resposta local inválida.");
  if (typeof value.is_receipt !== "boolean") throw new Error("Campo local inválido: is_receipt.");
  if (typeof value.type !== "string" || !RECEIPT_TYPES.has(value.type)) {
    throw new Error("Campo local inválido: type.");
  }
  if (typeof value.payment_method !== "string" || !PAYMENT_METHODS.has(value.payment_method)) {
    throw new Error("Campo local inválido: payment_method.");
  }
  if (!Array.isArray(value.low_confidence_fields) || value.low_confidence_fields.some((field) => typeof field !== "string")) {
    throw new Error("Campo local inválido: low_confidence_fields.");
  }

  const source = sourceText(input);
  const numbers = sourceNumbers(source);
  const category = nullableString(value.category_hint, "category_hint");
  const categoryHint = category && input.categories.some((candidate) =>
    normalizedText(candidate) === normalizedText(category)
  ) ? category : null;

  return {
    is_receipt: value.is_receipt,
    type: value.type as ParsedReceipt["type"],
    amount: sourceSupportsNumber(numbers, nullableNumber(value.amount, "amount")),
    date: sourceSupportsDate(source, nullableString(value.date, "date")),
    time: sourceSupportsTime(source, nullableString(value.time, "time")),
    counterparty: sourceSupportsText(source, nullableString(value.counterparty, "counterparty")),
    institution: sourceSupportsText(source, nullableString(value.institution, "institution")),
    payment_method: sourceSupportsText(source, value.payment_method) ?? "",
    category_hint: categoryHint,
    receipt_id: sourceSupportsText(source, nullableString(value.receipt_id, "receipt_id")),
    merchant_name: sourceSupportsText(source, nullableString(value.merchant_name, "merchant_name")),
    tax_id: sourceSupportsText(source, nullableString(value.tax_id, "tax_id")),
    fiscal_document_number: sourceSupportsText(source, nullableString(value.fiscal_document_number, "fiscal_document_number")),
    card_brand: sourceSupportsText(source, nullableString(value.card_brand, "card_brand")),
    card_last_four: sourceSupportsText(source, nullableString(value.card_last_four, "card_last_four")),
    title: sourceSupportsText(source, nullableString(value.title, "title")),
    notes: sourceSupportsText(source, nullableString(value.notes, "notes")),
    purchased_items: normalizeItems(value.purchased_items, source, numbers),
    low_confidence_fields: value.low_confidence_fields as string[],
  };
}
