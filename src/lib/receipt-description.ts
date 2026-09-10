import type { ParsedReceipt, PurchasedItem } from "@/lib/receipt";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function formatPurchasedItem(item: PurchasedItem): string | null {
  const name = (item.name ?? "").trim();
  if (!name) return null;

  const qty = item.quantity != null && item.quantity > 0 && item.quantity !== 1 ? `${item.quantity}x ` : "";
  const value = item.total ?? (item.quantity != null && item.unit_price != null ? item.quantity * item.unit_price : item.unit_price);
  return value != null ? `${qty}${name} — ${brl(value)}` : `${qty}${name}`;
}

export function formatReceiptDescription(parsed: ParsedReceipt): string | undefined {
  const items = (parsed.purchased_items ?? [])
    .map(formatPurchasedItem)
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
