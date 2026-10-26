/**
 * Complete, analysis-only financial PDF. No individual transactions:
 * itemized movements already have their own Registros export.
 * Three editorial sections use exactly the filtered analytics datasets.
 */
import type { FinancialReport, ExportGraph } from "@/lib/financial-data-export";
import type jsPDF from "jspdf";

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value: number) => value.toLocaleString("pt-BR", {
  minimumFractionDigits: 0, maximumFractionDigits: 1,
}) + "%";

const INK = [25, 47, 64] as const;
const MUTED = [76, 99, 115] as const;
const MINT = [33, 178, 156] as const;
const NAVY = [22, 39, 57] as const;
const CORAL = [213, 103, 84] as const;
const BLUE = [105, 147, 218] as const;

type RGB = readonly [number, number, number];

function rgb(color: string | undefined): RGB {
  if (!color) return MINT;
  const match = /^hsl\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/.exec(color);
  if (!match) return MINT;
  const h = Number(match[1]) / 60;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(h % 2 - 1));
  const adjustment = lightness - chroma / 2;
  const channels: number[] =
    h < 1 ? [chroma, secondary, 0] : h < 2 ? [secondary, chroma, 0] :
    h < 3 ? [0, chroma, secondary] : h < 4 ? [0, secondary, chroma] :
    h < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return channels.map(n => Math.round((n + adjustment) * 255)) as unknown as RGB;
}

function reportHeader(doc: jsPDF, title: string, subtitle: string, filters: string, page: number) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FINANCECONTROL  /  " + title.toUpperCase(), 11, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, 11, 31, { maxWidth: w - 22 });
  doc.text("Filtros: " + filters, 11, 37, { maxWidth: w - 22 });
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text("Relatório de análise  |  " + page, w - 11, 201, { align: "right" });
}

function box(doc: jsPDF, x: number, y: number, width: number, height: number) {
  doc.setFillColor(243, 247, 249);
  doc.setDrawColor(214, 226, 233);
  doc.roundedRect(x, y, width, height, 2, 2, "FD");
}

function heading(doc: jsPDF, label: string, x: number, y: number) {
  doc.setFillColor(...MINT);
  doc.roundedRect(x, y - 4, 1.5, 4.5, 0.5, 0.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(label, x + 4, y);
}

function drawKpis(doc: jsPDF, report: FinancialReport) {
  const width = (275 - 3 * 4) / 4;
  for (const [i, metric] of report.metrics.slice(0, 4).entries()) {
    const x = 11 + i * (width + 4);
    box(doc, x, 45, width, 24);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(metric.label.slice(0, 36), x + 3, 53);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.text(metric.value.slice(0, 34), x + 3, 63);
  }
}

function drawCategories(doc: jsPDF, chart: ExportGraph | undefined) {
  const x = 11, y = 75, w = 134, h = 85;
  box(doc, x, y, w, h);
  heading(doc, "Gastos por categoria", x + 4, y + 9);
  const points = chart?.points ?? [];
  if (!points.length) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.text("Nenhuma despesa neste período.", x + 6, y + 26);
    return;
  }
  const max = Math.max(1, ...points.map(p => p.value));
  // Categories here are a visual breakdown, not another ranking section.
  for (const [i, p] of points.slice(0, 11).entries()) {
    const baseline = y + 17 + i * 5.75;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...INK);
    doc.text(p.name.slice(0, 20), x + 4, baseline + 1);
    doc.setFillColor(216, 227, 233);
    doc.roundedRect(x + 45, baseline - 1.7, 44, 3, 0.6, 0.6, "F");
    doc.setFillColor(...rgb(p.color));
    doc.roundedRect(x + 45, baseline - 1.7, 44 * Math.max(0, p.value) / max, 3, 0.6, 0.6, "F");
    doc.setTextColor(...MUTED);
    doc.text(money(p.value), x + w - 4, baseline + 1, { align: "right" });
  }
}

function drawEvolution(doc: jsPDF, graph: ExportGraph | undefined, previous: number[] | null | undefined) {
  const x = 150, y = 75, w = 136, h = 85;
  box(doc, x, y, w, h);
  heading(doc, "Evolução dos gastos", x + 4, y + 9);
  const entries = graph?.points ?? [];
  if (!entries.length) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Sem série histórica neste período.", x + 6, y + 28);
    return;
  }

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.setFillColor(...MINT); doc.circle(x + 5, y + 15.5, 1.2, "F");
  doc.text("Atual", x + 8, y + 16.5);
  if (previous?.length) {
    doc.setFillColor(...BLUE); doc.circle(x + 30, y + 15.5, 1.2, "F");
    doc.text("Anterior", x + 33, y + 16.5);
  }

  const left = x + 10, right = x + w - 6;
  const top = y + 24, bottom = y + h - 13;
  const max = Math.max(1, ...entries.map(p => p.value), ...(previous || []));
  doc.setDrawColor(212, 225, 232);
  for (let i = 0; i <= 3; i++) {
    const lineY = top + (bottom - top) * i / 3;
    doc.line(left, lineY, right, lineY);
  }
  const trace = (values: number[], color: RGB) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(.55);
    for (let i = 1; i < values.length; i++) {
      const prevX = left + ((i - 1) / Math.max(1, values.length - 1)) * (right - left);
      const nextX = left + (i / Math.max(1, values.length - 1)) * (right - left);
      const prevY = bottom - Math.max(0, values[i - 1]) / max * (bottom - top);
      const nextY = bottom - Math.max(0, values[i]) / max * (bottom - top);
      doc.line(prevX, prevY, nextX, nextY);
    }
  };
  // Both lines share a value axis; never compare two independently scaled curves.
  if (previous?.length === entries.length) trace(previous, BLUE);
  trace(entries.map(p => p.value), MINT);
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  doc.text(entries[0].name, left, y + h - 5);
  doc.text(entries[entries.length - 1].name, right, y + h - 5, { align: "right" });
}

function renderInsights(doc: jsPDF, insights: string[]) {
  heading(doc, "Destaques do período", 12, 171);
  if (!insights.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Ainda não há destaques suficientes para este recorte.", 16, 179);
    return;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  doc.setTextColor(...INK);
  let y = 179;
  for(const insight of insights.slice(0, 4)) {
    const lines: string[] = doc.splitTextToSize("- " + insight, 266);
    if (y + lines.length * 3.5 > 199) break;
    doc.text(lines, 16, y);
    y += 3.8 * lines.length + 1.2;
  }
}

function tableHeading(doc: jsPDF, name: string, y: number) {
  heading(doc, name, 11, y);
}

export async function exportCompleteExpenseAnalysisPdf(report: FinancialReport): Promise<void> {
  const analysis = report.analysis;
  if (!analysis) throw new Error("O relatório analítico não contém os dados de análise.");
  const { default: JsPdf } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a4" });
  const filters = report.filterDescription || "Sem filtros adicionais";

  // Page 1: executive overview, two distinct visualizations, actionable insights.
  reportHeader(doc, "Análise de despesas", report.subtitle, filters, 1);
  drawKpis(doc, report);
  drawCategories(doc, report.graphs?.find(g => g.kind === "category"));
  drawEvolution(doc, report.graphs?.find(g => g.kind === "evolution"), analysis.previousEvolution);
  renderInsights(doc, analysis.insights);

  const tableOpts = {
    margin: { top: 15, left: 11, right: 11, bottom: 14 },
    theme: "striped" as const,
    headStyles: { fillColor: NAVY as unknown as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontSize: 9, fontStyle: "bold" as const },
    bodyStyles: { fontSize: 8.5, cellPadding: 2.4 },
    alternateRowStyles: { fillColor: [241, 246, 249] as [number, number, number] },
    didDrawPage: () => {},
  };

  // Page 2: exactly ONE detailed category breakdown plus payment-method view.
  doc.addPage();
  reportHeader(doc, "Distribuição de despesas", report.subtitle, filters, 2);
  tableHeading(doc, "Gastos por categoria: valor e participação", 48);
  autoTable(doc, {
    ...tableOpts, startY: 52,
    head: [["Categoria", "Valor gasto", "% do total"]],
    body: (report.categories ?? []).map(c => [c.category, money(c.total), percent(c.share)]),
    styles: { ...tableOpts.bodyStyles, cellPadding: 2.25 },
  });
  const afterCategory = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 58;
  if (afterCategory > 156) {
    doc.addPage();
  }
  const methodY = afterCategory > 156 ? 47 : afterCategory + 11;
  tableHeading(doc, "Gastos por forma de pagamento", methodY);
  autoTable(doc, {
    ...tableOpts, startY: methodY + 4,
    head: [["Forma de pagamento", "Valor gasto", "Participação", "Registros"]],
    body: analysis.payments.map(p => [p.method, money(p.total), percent(p.percentage), String(p.count)]),
  });

  // Page 3: movement versus the comparable period and budget versus actual.
  doc.addPage();
  reportHeader(doc, "Comparativos e orçamento", report.subtitle, filters, 3);
  tableHeading(doc, "Variações por categoria - " + analysis.comparisonLabel, 48);
  autoTable(doc, {
    ...tableOpts, startY: 52,
    head: [["Categoria", "Período anterior", "Período atual", "Diferença", "Variação"]],
    body: analysis.changes.map(c => [
      c.category, money(c.previous), money(c.current),
      (c.delta > 0 ? "+" : "") + money(c.delta),
      c.pct == null ? "Novo no período" : (c.pct > 0 ? "+" : "") + percent(c.pct),
    ]),
  });
  let cursor = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 58;
  if (cursor > 156) {
    doc.addPage();
    cursor = 40;
  }
  const budgetY = cursor + 11;
  tableHeading(doc, "Orçamento x realizado", budgetY);
  if (analysis.budget) {
    autoTable(doc, {
      ...tableOpts, startY: budgetY + 4,
      head: [["Categoria", "Orçamento", "Realizado", "Disponível", "% utilizado"]],
      body: analysis.budget.rows.map(b => [
        b.category, money(b.budget), money(b.spent), money(b.available), percent(b.percentage),
      ]),
      foot: [[
        "Total de categorias orçadas",
        money(analysis.budget.totalBudget),
        money(analysis.budget.totalSpent),
        money(analysis.budget.available),
        percent(analysis.budget.percentage),
      ]],
      footStyles: { fillColor: NAVY as unknown as [number, number, number], textColor: [255, 255, 255], fontStyle: "bold" },
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Nenhum orçamento definido para este período.", 15, budgetY + 8);
  }

  // AutoTable may add overflow pages; label each page with a stable footer.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("FinanceControl · Página " + page + " de " + pageCount, 286, 205, { align: "right" });
  }

  doc.save(report.fileName.replace(/\.xlsx$/i, ".pdf"));
}
