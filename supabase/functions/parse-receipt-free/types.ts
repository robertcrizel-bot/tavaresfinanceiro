/**
 * Local copies of the receipt contract shared with the frontend
 * (src/lib/receipt.ts). The Edge Function MUST NOT import from ../../../src:
 * the Deno/Supabase bundler cannot resolve extensionless frontend modules
 * (TS2307) and the deploy fails before the function ever runs.
 *
 * src/lib/free-ai-contract.ts compile-time-asserts that these types stay
 * assignable to the frontend ParsedReceipt; parse-receipt-free.test.ts
 * asserts the runtime shape.
 */
export interface PurchasedItem {
  name: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
}

export interface ParsedReceipt {
  is_receipt: boolean;
  type: "income" | "expense" | "unknown";
  amount: number | null;
  date: string | null;
  time: string | null;
  counterparty: string | null;
  institution: string | null;
  payment_method: string;
  category_hint: string | null;
  receipt_id: string | null;
  merchant_name: string | null;
  tax_id: string | null;
  fiscal_document_number: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  title: string | null;
  notes: string | null;
  purchased_items?: PurchasedItem[];
  low_confidence_fields: string[];
}
