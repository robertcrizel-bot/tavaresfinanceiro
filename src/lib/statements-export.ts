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

const EXCEL_COLORS = {
  darkTitle: "FF0F172A",
  neutral: "FF374151",
  headerBg: "FF1E293B",
  headerText: "FFFFFFFF",
  altRow: "FFF1F5F9",
  border: "FFE2E8F0",
} as const;

export async function exportStatementsToExcel(payload: StatementsExportPayload): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinanceControl";
  wb.created = new Date();
  const ws = wb.addWorksheet("Extrato", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [{ width: 14 }, { width: 36 }, { width: 20 }, { width: 24 }, { width: 16 }, { width: 20 }, { width: 16 }];

  let row = 1;
  ws.mergeCells(row, 1, row, 7);
  const title = ws.getCell(row, 1);
  title.value = "EXTRATO";
  title.font = { name: "Calibri", size: 18, bold: true, color: { argb: EXCEL_COLORS.darkTitle } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 34;
  row += 1;

  const meta: [string, string][] = [
    ["Origem", payload.originLabel],
    ["Período", `${formatDateBR(payload.start)} a ${formatDateBR(payload.end)}`],
    ["Filtros", payload.appliedFilters.length > 0 ? payload.appliedFilters.join(" · ") : "Sem filtros adicionais"],
    ["Exportado em", formatDateTimeBR(new Date())],
  ];
  for (const [label, value] of meta) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 11, bold: true, color: { argb: EXCEL_COLORS.neutral } };
    ws.mergeCells(row, 2, row, 7);
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).font = { name: "Calibri", size: 11, color: { argb: EXCEL_COLORS.neutral } };
    ws.getRow(row).height = 20;
    row += 1;
  }
  row += 1;

  ws.mergeCells(row, 1, row, 7);
  ws.getCell(row, 1).value = "RESUMO";
  ws.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: EXCEL_COLORS.darkTitle } };
  row += 1;
  for (const card of payload.summary) {
    ws.getCell(row, 1).value = card.label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 11, bold: true, color: { argb: EXCEL_COLORS.neutral } };
    ws.mergeCells(row, 2, row, 7);
    ws.getCell(row, 2).value = card.value;
    ws.getCell(row, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: EXCEL_COLORS.darkTitle } };
    row += 1;
  }
  row += 1;

  if (payload.categories.length > 0) {
    ws.mergeCells(row, 1, row, 7);
    ws.getCell(row, 1).value = "POR CATEGORIA";
    ws.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: EXCEL_COLORS.darkTitle } };
    row += 1;
    for (const slice of payload.categories.slice(0, 10)) {
      ws.getCell(row, 1).value = slice.category;
      ws.getCell(row, 2).value = slice.total;
      ws.getCell(row, 2).numFmt = 'R$ #,##0.00';
      ws.getCell(row, 3).value = slice.share / 100;
      ws.getCell(row, 3).numFmt = "0.0%";
      row += 1;
    }
    row += 1;
  }

  const headerRow = row;
  STATEMENT_EXPORT_COLUMNS.forEach((column, index) => {
    const cell = ws.getCell(row, index + 1);
    cell.value = column;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: EXCEL_COLORS.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_COLORS.headerBg } };
    cell.alignment = { vertical: "middle" };
  });
  ws.getRow(row).height = 22;
  row += 1;

  for (const entry of payload.rows) {
    STATEMENT_EXPORT_COLUMNS.forEach((column, index) => {
      const cell = ws.getCell(row, index + 1);
      const value = entry[column] ?? "";
      cell.value = value;
      if (column === "Valor" && typeof value === "number") {
        cell.numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
      }
    });
    if (row % 2 === 0) {
      for (let col = 1; col <= STATEMENT_EXPORT_COLUMNS.length; col += 1) {
        ws.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_COLORS.altRow } };
      }
    }
    row += 1;
  }

  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: row - 1, column: STATEMENT_EXPORT_COLUMNS.length } };
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRow }];

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    statementExportFileName(payload.originLabel, payload.start, payload.end, "xlsx"),
  );
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
