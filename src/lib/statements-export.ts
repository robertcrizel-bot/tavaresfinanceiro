export interface StatementsExportSummary {
  label: string;
  value: string;
}

export interface StatementsExportCategory {
  category: string;
  total: number;
  share: number;
}

export interface StatementsExportPayload {
  originLabel: string;
  start: string;
  end: string;
  appliedFilters: string[];
  summary: StatementsExportSummary[];
  categories: StatementsExportCategory[];
  rows: Record<string, string | number>[];
}

export const STATEMENT_EXPORT_COLUMNS = [
  "Data",
  "Descrição",
  "Categoria",
  "Origem",
  "Tipo",
  "Forma de pagamento",
  "Valor",
] as const;

const fmt = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateBR = (iso: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

const formatDateTimeBR = (date: Date): string =>
  `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

export const sanitizeExportName = (name: string): string =>
  name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_");

export function statementExportFileName(
  originLabel: string,
  start: string,
  end: string,
  ext: "xlsx" | "csv" | "pdf",
): string {
  return `FinanceControl_Extrato_${sanitizeExportName(originLabel)}_${start}_${end}.${ext}`;
}

function escapeCsvCell(value: string | number): string {
  const text = typeof value === "number"
    ? value.toFixed(2).replace(".", ",")
    : value;
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildStatementsCsv(payload: StatementsExportPayload): string {
  const header = STATEMENT_EXPORT_COLUMNS.join(";");
  const lines = payload.rows.map((row) =>
    STATEMENT_EXPORT_COLUMNS.map((column) => escapeCsvCell(row[column] ?? "")).join(";"),
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportStatementsToCsv(payload: StatementsExportPayload): void {
  const blob = new Blob([buildStatementsCsv(payload)], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, statementExportFileName(payload.originLabel, payload.start, payload.end, "csv"));
}

import { exportFinanceExcel } from "@/lib/finance-excel-report";

export async function exportStatementsToExcel(payload: StatementsExportPayload): Promise<void> {
  return exportFinanceExcel({
    worksheetName: "Extrato",
    fileName: statementExportFileName(payload.originLabel, payload.start, payload.end, "xlsx"),
    title: "Extrato financeiro",
    subtitle: `Origem: ${payload.originLabel}     |     Período: ${formatDateBR(payload.start)} a ${formatDateBR(payload.end)}`,
    filterDescription: payload.appliedFilters.join(" · ") || "Sem filtros adicionais",
    metrics: payload.summary,
    categories: payload.categories,
    columns: STATEMENT_EXPORT_COLUMNS,
    columnWidths: [15, 37, 20, 19, 22, 20, 18],
    amountColumn: "Valor",
    descriptionColumn: "Descrição",
    rows: payload.rows,
  });
}

export async function exportStatementsToPdf(payload: StatementsExportPayload): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("Extrato", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${payload.originLabel}  ·  ${formatDateBR(payload.start)} a ${formatDateBR(payload.end)}`, margin, y);
  y += 5;
  doc.text(
    payload.appliedFilters.length > 0 ? `Filtros: ${payload.appliedFilters.join(" · ")}` : "Sem filtros adicionais",
    margin,
    y,
  );
  y += 8;

  const boxWidth = (pageWidth - margin * 2 - 3 * 4) / 4;
  payload.summary.slice(0, 4).forEach((card, index) => {
    const x = margin + index * (boxWidth + 4);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, boxWidth, 18, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + 3, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(card.value, x + 3, y + 13);
  });
  y += 24;

  if (payload.categories.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Por categoria", margin, y);
    y += 5;
    const barArea = pageWidth - margin * 2 - 90;
    const maxShare = Math.max(...payload.categories.map((slice) => slice.share), 1);
    for (const slice of payload.categories.slice(0, 6)) {
      if (y > pageHeight - 20) break;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(slice.category.slice(0, 28), margin, y);
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(margin + 62, y - 3.5, barArea, 4, 1, 1, "F");
      doc.setFillColor(22, 163, 74);
      doc.roundedRect(margin + 62, y - 3.5, Math.max(2, (barArea * slice.share) / maxShare), 4, 1, 1, "F");
      doc.text(
        `${slice.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%  ·  ${fmt(slice.total)}`,
        margin + 62 + barArea + 3,
        y,
      );
      y += 6;
    }
    y += 3;
  }

  autoTable(doc, {
    startY: y,
    head: [STATEMENT_EXPORT_COLUMNS.map((column) => column)],
    body: payload.rows.map((entry) =>
      STATEMENT_EXPORT_COLUMNS.map((column) => {
        const value = entry[column] ?? "";
        if (column === "Valor" && typeof value === "number") {
          const text = fmt(Math.abs(value));
          return value >= 0 ? `+ ${text}` : `- ${text.replace("-", "")}`;
        }
        return String(value);
      }),
    ),
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    showHead: "everyPage",
    didDrawPage: (data) => {
      const footer = `Exportado em ${formatDateTimeBR(new Date())}  ·  Página ${data.pageNumber} de ${doc.getNumberOfPages()}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(footer, pageWidth / 2, pageHeight - 8, { align: "center" });
    },
  });

  doc.save(statementExportFileName(payload.originLabel, payload.start, payload.end, "pdf"));
}
