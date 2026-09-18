import type { PurchasedItem } from "@/lib/receipt";

const brl = (value: number) =>
  `R$ ${value.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, ".")}`;

export function formatPurchasedItem(item: PurchasedItem, valuesAreFinal?: boolean): string | null {
  const name = (item.name ?? "").trim();
  if (!name) return null;

  const qty = item.quantity != null && item.quantity > 0 && item.quantity !== 1 ? `${item.quantity}x ` : "";
  if (valuesAreFinal === false) {
    return `${qty}${name}`;
  }
  const value = item.total ?? (item.quantity != null && item.unit_price != null ? item.quantity * item.unit_price : item.unit_price);
  return value != null ? `${qty}${name} — ${brl(value)}` : `${qty}${name}`;
}

/** Minimal shape shared by both ParsedReceipt (AI) and LocalParsedReceipt (local OCR). */
interface DescriptionSource {
  purchased_items?: PurchasedItem[];
  item_values_are_final?: boolean;
  notes?: string | null;
  receipt_id?: string | null;
}

export function formatReceiptDescription(parsed: DescriptionSource): string | undefined {
  const items = (parsed.purchased_items ?? [])
    .map((item) => formatPurchasedItem(item, parsed.item_values_are_final))
    .filter((line): line is string => Boolean(line));

  return (
    [
      items.length > 0 ? `Itens:\n${items.join("\n")}` : null,
      parsed.notes?.trim() || null,
      parsed.receipt_id ? `ID do comprovante: ${parsed.receipt_id}` : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined
  );
}
