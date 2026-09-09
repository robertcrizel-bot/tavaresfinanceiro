import type { ParsedReceipt } from "@/lib/receipt";

export function formatReceiptDescription(parsed: ParsedReceipt): string | undefined {
  const items = (parsed.purchased_items ?? []).map((item) => item.trim()).filter(Boolean);
  return [
    items.length > 0 ? `Itens: ${items.join("; ")}` : null,
    parsed.notes,
    parsed.receipt_id ? `ID do comprovante: ${parsed.receipt_id}` : null,
  ]
    .filter(Boolean)
    .join(" | ") || undefined;
}
