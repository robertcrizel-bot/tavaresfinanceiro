import type { PurchasedItem } from "@/lib/receipt";

const brl = (value: number) =>
  `R$ ${value.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, ".")}`;

const isValidAmount = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function displayProduct(item: PurchasedItem): { name: string; quantityLabel: string; weighed: boolean } {
  const quantity = item.quantity;
  let name = (item.name ?? "").trim().replace(/\s+/g, " ");

  // GTIN/EAN at the start of a product line is an identifier, not part of its name.
  name = name.replace(/^(?:\d{8,14})\s+(?=\S)/, "");

  // Supermarket internal codes (e.g. "3006 COXA MOLE KG") are also not names.
  // Only remove these when the remainder looks like a description, not a number-led product.
  name = name.replace(/^\d{4,7}\s+(?=[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]{3,})/, "");

  const quantityKnown = typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0;
  const fractionalQuantity = quantityKnown && Math.abs(quantity - Math.round(quantity)) > 0.00001;
  const explicitlySoldByKg = /(?:^|\s)KGS?\.?$/i.test(name) &&
    !/\b\d+(?:[.,]\d+)?\s+KGS?\.?$/i.test(name);
  const alternateUnit = name.match(/(?:^|\s)(L|LT|LTS|ML|M|MT|METRO|METROS|UN|UND|UNID)\.?$/i);
  // Pack sizes such as "refrigerante 2 L" are product names, not a loose unit.
  const packagedSize = /\b\d+(?:[.,]\d+)?\s+(?:L|LT|LTS|ML|M)\.?$/i.test(name);
  const looseUnit = alternateUnit && !packagedSize ? alternateUnit[1].toUpperCase() : null;
  const weighed = Boolean(explicitlySoldByKg || (fractionalQuantity && !alternateUnit));

  if (explicitlySoldByKg) name = name.replace(/\s+KGS?\.?$/i, "").trim();
  else if (looseUnit) name = name.replace(/\s+(?:L|LT|LTS|ML|M|MT|METRO|METROS|UN|UND|UNID)\.?$/i, "").trim();

  const quantityLabel = !quantityKnown ? "" : weighed
    ? `${quantity.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
    : looseUnit
      ? `${quantity.toLocaleString("pt-BR", { minimumFractionDigits: fractionalQuantity ? 3 : 0, maximumFractionDigits: 3 })} ${looseUnit === "LT" || looseUnit === "LTS" ? "L" : looseUnit}`
      : quantity !== 1 && !fractionalQuantity ? `${quantity.toLocaleString("pt-BR")} un` : "";

  return { name, quantityLabel, weighed };
}

export function formatPurchasedItem(
  item: PurchasedItem,
  valuesAreFinal?: boolean,
  showKnownItemValues = false,
): string | null {
  const { name, quantityLabel, weighed } = displayProduct(item);
  if (!name) return null;

  const prefix = quantityLabel ? `${name} — ${quantityLabel}` : name;
  const total = isValidAmount(item.total)
    ? item.total
    : item.quantity != null && isValidAmount(item.unit_price)
      ? item.quantity * item.unit_price
      : item.unit_price;

  const unitPrice = isValidAmount(item.unit_price) ? item.unit_price : null;
  // Keep confidently read unit prices visible, even if some item totals are uncertain.
  // Never label a non-final item value as the definitive total.
  if (valuesAreFinal === false) {
    if (!showKnownItemValues) return prefix;
    const details = [prefix];
    if (weighed && unitPrice !== null && quantityLabel) details.push(`${brl(unitPrice)}/kg`);
    if (isValidAmount(item.total)) details.push(`Valor informado ${brl(item.total)}`);
    return details.join(" · ");
  }
  if (weighed && unitPrice !== null && quantityLabel) {
    return isValidAmount(total)
      ? `${prefix} · ${brl(unitPrice)}/kg · Total ${brl(total)}`
      : `${prefix} · ${brl(unitPrice)}/kg`;
  }

  if (!weighed && item.quantity != null && item.quantity > 1 && unitPrice !== null) {
    return isValidAmount(total)
      ? `${prefix} · ${brl(unitPrice)}/un · Total ${brl(total)}`
      : `${prefix} · ${brl(unitPrice)}/un`;
  }

  return isValidAmount(total) ? `${prefix} — ${brl(total)}` : prefix;
}

/** Minimal shape shared by both ParsedReceipt (AI) and LocalParsedReceipt (local OCR). */
interface DescriptionSource {
  purchased_items?: PurchasedItem[];
  item_values_are_final?: boolean;
  notes?: string | null;
  receipt_id?: string | null;
}

export function formatReceiptDescription(
  parsed: DescriptionSource,
  showKnownItemValues = false,
): string | undefined {
  const items = (parsed.purchased_items ?? [])
    .map((item) => formatPurchasedItem(item, parsed.item_values_are_final, showKnownItemValues))
    .filter((line): line is string => Boolean(line));

  return (
    [
      items.length > 0 ? `Itens:\n${items.join("\n")}` : null,
      parsed.notes?.trim() || null,
      // For purchases, receipt references are already stored separately. Retain the
      // reference in descriptions of non-item receipts (Pix, bank transfers).
      items.length === 0 && parsed.receipt_id ? `ID do comprovante: ${parsed.receipt_id}` : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined
  );
}
