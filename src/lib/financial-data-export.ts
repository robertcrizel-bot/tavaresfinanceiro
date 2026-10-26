/** Export bridge for the four reporting pages: PDF, Excel and CSV.
 *  All rows and aggregates are prepared by their source pages; this module
 *  never recomputes balances or changes persistent financial records.
 */
import type { FinanceExcelReport } from "@/lib/finance-excel-report";
import { exportFinanceExcel } from "@/lib/finance-excel-report";

export type ExportGraph = {
  title: string;
  kind: "category" | "evolution";
  points: { name: string; value: number; color?: string }[];
};

export interface AnalysisBreakdown {
  payments: { method: string; total: number; count: number; percentage: number }[];
  changes: { category: string; current: number; previous: number; delta: number; pct: number | null }[];
  budget: null | {
    totalBudget: number;
    totalSpent: number;
    available: number;
    percentage: number;
    rows: { category: string; budget: number; spent: number; available: number; percentage: number }[];
  };
  insights: string[];
  previousEvolution: number[] | null;
  comparisonLabel: string;
}

export interface FinancialReport extends FinanceExcelReport {
  graphs?: ExportGraph[];
  analysis?: AnalysisBreakdown;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const csvSafe = (value: string | number): string => {
  if (typeof value === "number") return String(value).replace(".", ",");
  // Protect spreadsheet consumers from formula injection when descriptions
  // start with user-supplied = + - @, while preserving ordinary narrative.
  const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return /[;"\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
};

export function buildFinancialReportCsv(report: FinancialReport): string {
  const lines = [report.columns.map(csvSafe).join(";")];
  if (report.sections?.length) {
    for (const section of report.sections) {
      lines.push([csvSafe(section.title), ...report.columns.slice(1).map(() => "")].join(";"));
      for (const row of section.rows) {
        lines.push(report.columns.map(c => csvSafe(row[c] ?? "")).join(";"));
      }
    }
  } else {
    for (const row of report.rows) {
      lines.push(report.columns.map(c => csvSafe(row[c] ?? "")).join(";"));
    }
  }
  return "\uFEFF" + lines.join("\r\n");
}

function download(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportFinancialReportCsv(report: FinancialReport): void {
  download(
    new Blob([buildFinancialReportCsv(report)], { type: "text/csv;charset=utf-8" }),
    report.fileName.replace(/\.xlsx$/i, ".csv"),
  );
}

export async function exportFinancialReportExcel(report: FinancialReport): Promise<void> {
  // The analysis page already lists categories in its main grid; don't
  // render an identical second "ranking" above that same grid.
  await exportFinanceExcel(report.analysis ? { ...report, categories: undefined } : report);
}

function pdfColorFromHsl(hsl: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hsl) return fallback;
  const match = hsl.match(/hsl\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!match) return fallback;
  const h = (Number(match[1]) % 360) / 60;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const m = l - chroma / 2;
  const rgb: [number, number, number] =
    h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] :
    h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] :
    h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return rgb.map(v => Math.round((v + m) * 255)) as [number, number, number];
}

function graphColors(color: string | undefined): [number, number, number] {
  return pdfColorFromHsl(color, [45, 183, 169]);
}

/**
 * Export actual category spending and actual period evolution as vector marks.
 * These charts are not screenshots: they draw using the same filtered numbers
 * as the accompanying export rows.
 */
export async function exportFinancialReportPdf(report: FinancialReport): Promise<void> {
  if (report.analysis) {
    const { exportCompleteExpenseAnalysisPdf } = await import("@/lib/expense-analysis-pdf");
    return exportCompleteExpenseAnalysisPdf(report);
  }
  const { default: JsPdf } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new JsPdf({ orientation: "landscape", format: "a4", unit: "mm" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 11;
  const printableWidth = pageWidth - 2 * margin;

  doc.setFillColor(20, 39, 54);
  doc.rect(0, 0, pageWidth, 23, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FINANCECONTROL  /  " + report.title.toUpperCase(), margin, 14);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(69, 89, 105);
  doc.setFontSize(9);
  const intro = doc.splitTextToSize(report.subtitle, printableWidth);
  doc.text(intro, margin, 29);
  const filterText = doc.splitTextToSize("Filtros: " + (report.filterDescription || "Sem filtros adicionais"), printableWidth);
  const filtersY = 29 + intro.length * 4.5;
  doc.text(filterText, margin, filtersY);

  const summaryY = filtersY + filterText.length * 4.5 + 2;
  const metricWidth = (printableWidth - 3 * 3) / 4;
  report.metrics.slice(0, 4).forEach((metric, i) => {
    const x = margin + i * (metricWidth + 3);
    doc.setFillColor(i % 2 === 0 ? 231 : 224, i % 2 === 0 ? 241 : 243, 245);
    doc.roundedRect(x, summaryY, metricWidth, 17, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(75, 95, 111);
    doc.text(metric.label.substring(0, 32), x + 3, summaryY + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(22, 47, 64);
    doc.text(metric.value.substring(0, 34), x + 3, summaryY + 12.5);
  });

  let tableStartY = summaryY + 22;
  const graphs = (report.graphs || []).filter(g => g.points.length > 0).slice(0, 2);
  if (graphs.length > 0) {
    const gap = 5;
    const width = (printableWidth - gap) / 2;
    const top = tableStartY;
    const chartHeight = 61;
    for (const [index, graph] of graphs.entries()) {
      const x = margin + index * (width + gap);
      doc.setDrawColor(212, 226, 232);
      doc.setFillColor(243, 247, 249);
      doc.roundedRect(x, top, width, chartHeight, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(28, 50, 67);
      doc.text(graph.title.substring(0, 48), x + 3, top + 7);

      // Show the first and last day even for a 31-day month. A uniform
      // sample avoids falsely making the timeline stop on day 24.
      const series = graph.kind === "category"
        ? graph.points.slice(0, 7)
        : graph.points.length <= 24
          ? graph.points
          : Array.from({ length: 24 }, (_, i) =>
              graph.points[Math.round(i * (graph.points.length - 1) / 23)]);
      const max = Math.max(1, ...series.map(p => Math.max(0, p.value)));
      if (graph.kind === "category") {
        series.forEach((p, i) => {
          const y = top + 13 + i * 6.5;
          const [r, g, b] = graphColors(p.color);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(52, 68, 84);
          doc.text(p.name.slice(0, 24), x + 3, y + 2);
          doc.setFillColor(215, 226, 232);
          doc.roundedRect(x + 45, y - 1, width - 76, 3.4, 1, 1, "F");
          doc.setFillColor(r, g, b);
          doc.roundedRect(x + 45, y - 1, (width - 76) * Math.max(0, p.value) / max, 3.4, 1, 1, "F");
          doc.text(fmt(p.value), x + width - 3, y + 2, { align: "right" });
        });
      } else {
        const xMin = x + 8;
        const plotWidth = width - 16;
        const yBottom = top + 48;
        const plotHeight = 31;
        doc.setDrawColor(207, 223, 232);
        doc.line(xMin, yBottom, xMin + plotWidth, yBottom);
        doc.setDrawColor(36, 178, 163);
        doc.setLineWidth(0.55);
        series.forEach((p, i) => {
          const px = xMin + (i / Math.max(1, series.length - 1)) * plotWidth;
          const py = yBottom - Math.max(0, p.value) / max * plotHeight;
          if (i > 0) {
            const prev = series[i - 1];
            const xPrev = xMin + ((i - 1) / Math.max(1, series.length - 1)) * plotWidth;
            const yPrev = yBottom - Math.max(0, prev.value) / max * plotHeight;
            doc.line(xPrev, yPrev, px, py);
          }
        });
        doc.setFontSize(7);
        doc.setTextColor(78, 99, 114);
        if (series[0]) doc.text(series[0].name, xMin, top + 56);
        if (series.at(-1)) doc.text(series[series.length - 1].name, x + width - 5, top + 56, { align: "right" });
      }
    }
    tableStartY = top + 66;
  }

  const makeTable = (rows: Record<string, string | number>[], startY: number) => autoTable(doc, {
    startY,
    margin: { left: margin, right: margin, top: 12, bottom: 12 },
    head: [report.columns.map(c => c)],
    body: rows.map(row => report.columns.map(col => {
      const value = row[col] ?? "";
      if (typeof value === "number") {
        return col === report.amountColumn || report.currencyColumns?.includes(col)
          ? fmt(value)
          : String(value).replace(".", ",");
      }
      return String(value);
    })),
    theme: "striped",
    headStyles: { fillColor: [20, 39, 54], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: report.columns.length >= 7 ? 7.5 : 9, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [241, 246, 249] },
    styles: { cellPadding: 2, overflow: "linebreak" },
    showHead: "everyPage",
    didDrawPage: data => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(111, 130, 142);
      doc.text("FinanceControl · Página " + data.pageNumber, pageWidth - margin, pageHeight - 5, { align: "right" });
    },
  });

  if (report.sections?.length) {
    let nextY = tableStartY;
    for (const section of report.sections) {
      if (nextY > pageHeight - 38) {
        doc.addPage();
        nextY = 24;
      }
      doc.setFillColor(225, 242, 238);
      doc.roundedRect(margin, nextY, printableWidth, 9, 2, 2, "F");
      doc.setTextColor(22, 63, 58);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(section.title, margin + 4, nextY + 6);
      if (section.rows.length) {
        makeTable(section.rows, nextY + 12);
        nextY = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20) + 8;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(90, 105, 121);
        doc.text("Nenhum item neste grupo.", margin + 4, nextY + 16);
        nextY += 27;
      }
    }
  } else {
    makeTable(report.rows, tableStartY);
  }
  doc.save(report.fileName.replace(/\.xlsx$/i, ".pdf"));
}
