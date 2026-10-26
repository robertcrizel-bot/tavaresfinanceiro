/**
 * One polished Excel layout shared by Registros and Extratos.
 * No frozen panes: Excel opens with the complete report scrollable.
 * Values are copied as supplied; financial aggregation stays in the pages' own logic.
 */
import type ExcelJS from "exceljs";

export interface FinanceExcelMetric {
  label: string;
  value: string;
}

export interface FinanceExcelCategory {
  category: string;
  total: number;
  share: number;
}

export interface FinanceExcelExtraSheet {
  name: string;
  columns: string[];
  columnWidths: number[];
  rows: Record<string, string | number>[];
  currencyColumns?: string[];
  percentageColumns?: string[];
}

export interface FinanceExcelReport {
  worksheetName: string;
  fileName: string;
  title: string;
  subtitle: string;
  filterDescription: string;
  metrics: FinanceExcelMetric[];
  categories?: FinanceExcelCategory[];
  columns: readonly string[];
  columnWidths: number[];
  amountColumn: string;
  currencyColumns?: string[];
  percentageColumns?: string[];
  extraSheets?: FinanceExcelExtraSheet[];
  descriptionColumn?: string;
  rows: Record<string, string | number>[];
}

const C = {
  navy: "FF172A3D",
  navyDeep: "FF122334",
  mint: "FF2CC5AD",
  mintPale: "FFE3F4F0",
  bluePale: "FFE9F1F6",
  alternating: "FFF1F6F9",
  white: "FFFFFFFF",
  ink: "FF223348",
  subdued: "FF54687B",
  border: "FFD5E1E9",
  green: "FF15765C",
  red: "FFA94634",
} as const;

type Cell = ExcelJS.Cell;
type Sheet = ExcelJS.Worksheet;

const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const font = (size: number, bold = false, color: string = C.ink) => ({
  name: "Aptos", size, bold, color: { argb: color },
});

function paintBand(sheet: Sheet, row: number, colCount: number, color: string) {
  for (let col = 1; col <= colCount; col++) {
    sheet.getCell(row, col).fill = fill(color);
  }
}

function joinedCell(sheet: Sheet, row: number, start: number, end: number): Cell {
  if (end > start) sheet.mergeCells(row, start, row, end);
  return sheet.getCell(row, start);
}

function footerName(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "_");
}

function downloadBuffer(buffer: ArrayBuffer | Uint8Array, name: string): void {
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = footerName(name);
  a.click();
  URL.revokeObjectURL(url);
}

function columnGroups(count: number): [number, number][] {
  if (count >= 7) {
    return [[1, 2], [3, 4], [5, 6], [7, count]];
  }
  const groups: [number, number][] = [];
  for (let i = 0; i < count; i++) groups.push([i + 1, i + 1]);
  return groups;
}

export async function exportFinanceExcel(report: FinanceExcelReport): Promise<void> {
  const { default: Excel } = await import("exceljs");
  const workbook = new Excel.Workbook();
  workbook.creator = "FinanceControl";
  workbook.created = new Date();

  const ws = workbook.addWorksheet(report.worksheetName, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });
  const cols = report.columns.length;
  ws.columns = report.columnWidths.map((width) => ({ width }));
  ws.views = [{ state: "normal", showGridLines: false }];

  // Branded heading, two compact lines of context — no oversized, frozen header.
  paintBand(ws, 1, cols, C.navyDeep);
  const heading = joinedCell(ws, 1, 1, cols);
  heading.value = "FINANCECONTROL  /  " + report.title.toUpperCase();
  heading.font = font(17, true, C.white);
  heading.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 38;

  paintBand(ws, 2, cols, C.mintPale);
  const subtitle = joinedCell(ws, 2, 1, cols);
  subtitle.value = report.subtitle;
  subtitle.font = font(11, true, C.ink);
  subtitle.alignment = { vertical: "middle", indent: 1, wrapText: true };
  ws.getRow(2).height = report.subtitle.length > 110 ? 36 : 28;

  paintBand(ws, 3, cols, C.bluePale);
  const filterText = joinedCell(ws, 3, 1, cols);
  filterText.value = "FILTROS  " + (report.filterDescription.trim() || "Sem filtros adicionais");
  filterText.font = font(10, false, C.subdued);
  filterText.alignment = { vertical: "middle", indent: 1, wrapText: true };
  ws.getRow(3).height = report.filterDescription.length > 110 ? 37 : 27;

  ws.getRow(4).height = 12;
  paintBand(ws, 5, cols, C.navy);
  const summaryHeader = joinedCell(ws, 5, 1, cols);
  summaryHeader.value = "RESUMO DO PERÍODO";
  summaryHeader.font = font(11, true, C.white);
  summaryHeader.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(5).height = 24;

  const groups = columnGroups(cols);
  for (let i = 0; i < Math.min(groups.length, report.metrics.length); i++) {
    const [start, end] = groups[i];
    for (let col = start; col <= end; col++) {
      ws.getCell(6, col).fill = fill(i % 2 === 0 ? C.bluePale : C.mintPale);
      ws.getCell(7, col).fill = fill(i % 2 === 0 ? C.bluePale : C.mintPale);
    }
    const label = joinedCell(ws, 6, start, end);
    const metric = report.metrics[i];
    label.value = metric.label.replace(/^Quantidade de (movimentações|registros)$/i, "$1");
    label.font = font(10, true, C.subdued);
    label.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    const value = joinedCell(ws, 7, start, end);
    value.value = metric.value;
    const semantic = /^(entradas|receitas)$/i.test(metric.label)
      ? C.green
      : /^(saídas|despesas)$/i.test(metric.label)
        ? C.red
        : C.navy;
    value.font = font(13, true, semantic);
    value.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  ws.getRow(6).height = 25;
  ws.getRow(7).height = 29;
  ws.getRow(8).height = 13;

  let row = 9;
  if (report.categories?.length) {
    paintBand(ws, row, cols, C.navy);
    const h = joinedCell(ws, row, 1, cols);
    h.value = "DESPESAS POR CATEGORIA";
    h.font = font(11, true, C.white);
    h.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(row).height = 24;
    row++;

    // Two balanced sets of category/value/percentage instead of a very long
    // block at the far left with empty columns to the right.
    const categories = report.categories; // Export every filtered category, not only the top ten.
    const half = Math.ceil(categories.length / 2);
    for (let i = 0; i < half; i++) {
      const pairs: { item: FinanceExcelCategory; left: number; right: number; valueCol: number; percentCol: number }[] = [];
      if (categories[i]) pairs.push({ item: categories[i], left: 1, right: 2, valueCol: 3, percentCol: 4 });
      if (categories[i + half]) pairs.push({ item: categories[i + half], left: 5, right: 5, valueCol: 6, percentCol: 7 });
      if (i % 2 === 1) paintBand(ws, row, cols, C.alternating);
      for (const { item, left, right, valueCol, percentCol } of pairs) {
        const name = joinedCell(ws, row, left, right);
        name.value = item.category;
        name.font = font(10, true, C.ink);
        name.alignment = { vertical: "middle", wrapText: false, indent: left === 1 ? 1 : 0 };
        const amount = ws.getCell(row, valueCol);
        amount.value = item.total;
        amount.numFmt = '"R$ " #,##0.00';
        amount.font = font(10, false, C.ink);
        amount.alignment = { horizontal: "right", vertical: "middle" };
        const share = ws.getCell(row, percentCol);
        share.value = item.share / 100;
        share.numFmt = "0.0%";
        share.font = font(10, false, C.subdued);
        share.alignment = { horizontal: "right", vertical: "middle" };
      }
      ws.getRow(row).height = 23;
      row++;
    }
    ws.getRow(row).height = 14;
    row++;
  }

  const headerRow = row;
  paintBand(ws, headerRow, cols, C.navyDeep);
  report.columns.forEach((key, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = key;
    cell.font = font(10, true, C.white);
    cell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
  });
  ws.getRow(headerRow).height = 29;

  for (const [index, entry] of report.rows.entries()) {
    row = headerRow + index + 1;
    if (index % 2 === 1) paintBand(ws, row, cols, C.alternating);
    let textHeight = 23;
    report.columns.forEach((key, col) => {
      const cell = ws.getCell(row, col + 1);
      const value = entry[key] ?? "";
      cell.value = value;
      cell.font = font(10, key === report.amountColumn, C.ink);
      cell.alignment = { vertical: "middle", wrapText: key === report.descriptionColumn };
      cell.border = { bottom: { style: "hair", color: { argb: C.border } } };
      if ((key === report.amountColumn || report.currencyColumns?.includes(key)) && typeof value === "number") {
        // New reporting pages express expenses/forecasts as unsigned magnitudes;
        // original statement/record exports keep their signed ledger display.
        cell.numFmt = report.currencyColumns?.includes(key)
          ? '"R$ " #,##0.00;-"R$ " #,##0.00;"R$ 0,00"'
          : '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
        cell.font = font(10, true, value < 0 ? C.red : C.green);
        cell.alignment = { vertical: "middle", horizontal: "right" };
      } else if (report.percentageColumns?.includes(key) && typeof value === "number") {
        cell.numFmt = "0.0%";
        cell.font = font(10, false, C.subdued);
        cell.alignment = { vertical: "middle", horizontal: "right" };
      } else if (key === report.descriptionColumn && typeof value === "string") {
        textHeight = Math.max(textHeight, Math.min(48, 21 + Math.floor(value.length / 85) * 14));
      }
    });
    ws.getRow(row).height = textHeight;
  }

  if (report.rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow + report.rows.length, column: cols },
    };
  } else {
    const empty = joinedCell(ws, headerRow + 1, 1, cols);
    empty.value = "Nenhuma movimentação encontrada para os filtros selecionados.";
    empty.font = font(11, false, C.subdued);
    ws.getRow(headerRow + 1).height = 28;
  }

  // Analysis-only detail sheets: charts, payment mix, category comparisons,
  // budgets and insights. Never include individual records on this report.
  for (const detail of report.extraSheets ?? []) {
    const ds = workbook.addWorksheet(detail.name);
    ds.columns = detail.columnWidths.map(width => ({ width }));
    ds.views = [{ state: "normal", showGridLines: false }];
    paintBand(ds, 1, detail.columns.length, C.navyDeep);
    const h = joinedCell(ds, 1, 1, detail.columns.length);
    h.value = "FINANCECONTROL  /  " + detail.name.toUpperCase();
    h.font = font(15, true, C.white);
    h.alignment = { vertical: "middle", indent: 1 };
    ds.getRow(1).height = 34;
    detail.columns.forEach((column, i) => {
      const cell = ds.getCell(3, i + 1);
      cell.value = column;
      cell.fill = fill(C.navy);
      cell.font = font(10, true, C.white);
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    ds.getRow(3).height = 28;
    detail.rows.forEach((item, index) => {
      const rowIndex = index + 4;
      if (index % 2 === 1) paintBand(ds, rowIndex, detail.columns.length, C.alternating);
      detail.columns.forEach((column, columnIndex) => {
        const cell = ds.getCell(rowIndex, columnIndex + 1);
        const value = item[column] ?? "";
        cell.value = value;
        cell.font = font(10, false, C.ink);
        cell.alignment = { vertical: "middle", wrapText: detail.columns.length === 1 };
        if (typeof value === "number" && detail.currencyColumns?.includes(column)) {
          cell.numFmt = '"R$ " #,##0.00;-"R$ " #,##0.00;"R$ 0,00"';
          cell.alignment = { vertical: "middle", horizontal: "right" };
        } else if (typeof value === "number" && detail.percentageColumns?.includes(column)) {
          cell.numFmt = "0.0%";
          cell.alignment = { vertical: "middle", horizontal: "right" };
        }
      });
      ds.getRow(rowIndex).height = detail.columns.length === 1 ? 35 : 24;
    });
    if (detail.rows.length) ds.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3 + detail.rows.length, column: detail.columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, report.fileName);
}
