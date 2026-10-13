/**
 * Compile-time contract between the free AI Edge Function and the frontend.
 *
 * The function (supabase/functions/parse-receipt-free) carries its own local
 * copy of the receipt types so the Deno bundler never touches ../../../src.
 * This file is the single place where tsc guarantees the two contracts stay
 * aligned: if the function types drift from the frontend ParsedReceipt,
 * `npx tsc --noEmit` fails here.
 */
import type { ParsedReceipt } from "@/lib/receipt";
import type { ParsedReceipt as FreeAiParsedReceipt } from "../../supabase/functions/parse-receipt-free/types";

type Extends<A, B> = [A] extends [B] ? true : false;

export type FreeAiContractCompatible = Extends<FreeAiParsedReceipt, ParsedReceipt> extends true
  ? Extends<ParsedReceipt, FreeAiParsedReceipt> extends true
    ? "both-ways"
    : "function-to-frontend-only"
  : "incompatible";

const compatibility: FreeAiContractCompatible = "both-ways";
void compatibility;
