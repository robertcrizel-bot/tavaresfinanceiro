import { supabase } from "@/integrations/supabase/client";

const BATCH_SIZE = 500;

type ExportPage = {
  data: unknown[] | null;
  error: { message: string } | null;
};

type PageLoader = (first: number, last: number) => PromiseLike<ExportPage>;

async function collectAll(getPage: PageLoader): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let start = 0; ; start += BATCH_SIZE) {
    const { data, error } = await getPage(start, start + BATCH_SIZE - 1);
    if (error) throw new Error("Não foi possível exportar todos os registros desta conta.");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) return rows;
  }
}

/**
 * Export only the caller's rows. RLS remains the real authorization boundary.
 * The JSON contains private financial information; no file is uploaded to
 * another service. Attachment metadata is included, binary images/PDFs are not.
 */
export async function buildOwnFinancialExport(userId: string, email?: string) {
  const tables: Array<{ name: string; getPage: PageLoader }> = [
    { name: "profiles", getPage: (a, b) => supabase.from("profiles").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "accounts", getPage: (a, b) => supabase.from("accounts").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "credit_cards", getPage: (a, b) => supabase.from("credit_cards").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "categories", getPage: (a, b) => supabase.from("categories").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "transactions", getPage: (a, b) => supabase.from("transactions").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "transfers", getPage: (a, b) => supabase.from("transfers").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "recurring_bills", getPage: (a, b) => supabase.from("recurring_bills").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "bill_payments", getPage: (a, b) => supabase.from("bill_payments").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "credit_card_invoices", getPage: (a, b) => supabase.from("credit_card_invoices").select("*").eq("user_id", userId).order("created_at").range(a, b) },
    { name: "transaction_attachments", getPage: (a, b) => supabase.from("transaction_attachments").select("*").eq("user_id", userId).order("created_at").range(a, b) },
  ];

  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    data[table.name] = await collectAll(table.getPage);
  }

  return {
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    account: { id: userId, email: email ?? null },
    notices: [
      "Esta cópia contém informações financeiras particulares. Guarde em local seguro.",
      "Este arquivo JSON inclui os dados e o catálogo dos comprovantes, mas não inclui as imagens/PDFs armazenados. Para solicitar uma cópia completa dos arquivos, contate o suporte.",
      "Esta exportação não exclui nem modifica seus registros.",
    ],
    data,
  };
}

export async function downloadOwnFinancialExport(userId: string, email?: string): Promise<void> {
  const data = await buildOwnFinancialExport(userId, email);
  const payload = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(payload);
  try {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `financecontrol-dados-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Some browsers need the blob URL to survive briefly after anchor.click.
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}
