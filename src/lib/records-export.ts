import type { FinanceExcelReport } from "@/lib/finance-excel-report";

export type RecordsExportPayload = Pick<
  FinanceExcelReport,
  "title" | "subtitle" | "filterDescription" | "metrics" | "columns" | "amountColumn" | "rows" | "fileName"
>;

const escapeCsvCell = (cell: string | number): string => {
  if (typeof cell === "number") return cell.toFixed(2).replace(".", ",");
  // Keep user-provided receipt text inert if opened by a spreadsheet app.
  const text = /^[\s]*[=+@-]/.test(cell) ? "'" + cell : cell;
  return /[;"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

export function buildRecordsCsv(payload: RecordsExportPayload): string {
  const lines = [
    payload.columns.join(";"),
    ...payload.rows.map(row => payload.columns.map(col => escapeCsvCell(row[col] ?? "")).join(";")),
  ];
  return "\uFEFF" + lines.join("\r\n");
}

export function exportRecordsToCsv(payload: RecordsExportPayload): void {
  const blob = new Blob([buildRecordsCsv(payload)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.fileName.replace(/\.xlsx$/i, ".csv");
  a.click();
  URL.revokeObjectURL(url);
}

const fmt = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function exportRecordsToPdf(payload: RecordsExportPayload): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 11;

  doc.setFillColor(23, 42, 61);
  doc.rect(0, 0, pageWidth, 25, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text("FINANCECONTROL  /  MEUS REGISTROS", margin, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 89, 105);
  const subtitle = doc.splitTextToSize(payload.subtitle, pageWidth - margin * 2);
  doc.text(subtitle, margin, 32);
  const filterLine = "Filtros: " + (payload.filterDescription || "Sem filtros adicionais");
  const filters = doc.splitTextToSize(filterLine, pageWidth - margin * 2);
  const filtersY = 33 + subtitle.length * 4.4;
  doc.text(filters, margin, filtersY);

  const summaryY = filtersY + filters.length * 4.3 + 2;
  const summaryWidth = (pageWidth - 2 * margin - 3 * 3) / 4;
  payload.metrics.slice(0, 4).forEach((metric, i) => {
    const x = margin + i * (summaryWidth + 3);
    doc.setFillColor(i % 2 === 0 ? 234 : 226, i % 2 === 0 ? 241 : 244, 245);
    doc.roundedRect(x, summaryY, summaryWidth, 17, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 100, 118);
    doc.text(metric.label.slice(0, 26), x + 2.5, summaryY + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(27, 50, 67);
    doc.text(metric.value, x + 2.5, summaryY + 12);
  });

  autoTable(doc, {
    startY: summaryY + 22,
    margin: { left: margin, right: margin, top: 10, bottom: 15 },
    head: [payload.columns.map(x => x)],
    body: payload.rows.map(row =>
      payload.columns.map(col => {
        const val = row[col] ?? "";
        if (col === payload.amountColumn && typeof val === "number") {
          return (val < 0 ? "-" : "+") + fmt(Math.abs(val));
        }
        return String(val);
      }),
    ),
    theme: "striped",
    headStyles: { fillColor: [23, 42, 61], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [241, 246, 249] },
    styles: { overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 18 }, 1: { cellWidth: 38 }, 2: { cellWidth: 26 },
      3: { cellWidth: 24 }, 4: { cellWidth: 22 }, 5: { cellWidth: 30 },
      6: { cellWidth: 24 }, 7: { cellWidth: "auto", minCellWidth: 35 },
    },
    showHead: "everyPage",
    didDrawPage: data => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("FinanceControl  ·  Página " + data.pageNumber, pageWidth - margin, pageHeight - 6, { align: "right" });
    },
  });
  doc.save(payload.fileName.replace(/\.xlsx$/i, ".pdf"));
}
