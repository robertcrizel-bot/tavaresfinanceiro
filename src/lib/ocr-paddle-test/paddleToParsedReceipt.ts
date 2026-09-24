import type { ParsedReceipt } from "@/lib/receipt";
import type { PaddleReceiptResult } from "./receiptResult";

export function paddleToParsedReceipt(result: PaddleReceiptResult): ParsedReceipt {
  const { merchant, cnpj, date, time, receiptTotal, items, differenceFromReceiptTotal } = result;

  const isReceipt =
    receiptTotal !== null || items.length > 0 || (merchant !== null && cnpj !== null);

  const lowConfidenceFields: string[] = [];
  if (receiptTotal === null) lowConfidenceFields.push("amount");
  if (date === null) lowConfidenceFields.push("date");
  if (merchant === null) lowConfidenceFields.push("counterparty");
  if (
    items.some((item) => item.effectiveValue === null) ||
    (differenceFromReceiptTotal !== null && differenceFromReceiptTotal !== 0)
  ) {
    lowConfidenceFields.push("purchased_items");
  }

  return {
    is_receipt: isReceipt,
    type: "expense",
    amount: receiptTotal,
    date,
    time,
    counterparty: merchant,
    institution: null,
    payment_method: "",
    category_hint: null,
    receipt_id: null,
    merchant_name: merchant,
    tax_id: cnpj,
    fiscal_document_number: null,
    card_brand: null,
    card_last_four: null,
    title: merchant,
    notes: null,
    purchased_items: items.map((item) => ({
      name: item.description ?? "",
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.effectiveValue,
    })),
    item_values_are_final: items.every((item) => item.effectiveValue !== null),
    low_confidence_fields: lowConfidenceFields,
  };
}
