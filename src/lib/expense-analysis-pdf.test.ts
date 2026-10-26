import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportCompleteExpenseAnalysisPdf,
  shouldStartFreshAnalysisPage,
} from "@/lib/expense-analysis-pdf";
import type { FinancialReport } from "@/lib/financial-data-export";

const events = vi.hoisted(() => ({
  currentPage: 1,
  pages: 1,
  autoBreaks: 0,
  filename: "",
  text: [] as string[],
  tables: [] as { title: string; page: number; startY: number; rows: number; headRows: number }[],
}));

vi.mock("jspdf", () => ({
  default: class MockPdf {
    internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };
    lastAutoTable?: { finalY: number };
    setFillColor = vi.fn();
    setDrawColor = vi.fn();
    setLineWidth = vi.fn();
    setTextColor = vi.fn();
    setFont = vi.fn();
    setFontSize = vi.fn();
    rect = vi.fn();
    roundedRect = vi.fn();
    circle = vi.fn();
    line = vi.fn();
    text(value: string | string[]) {
      events.text.push(Array.isArray(value) ? value.join("\n") : value);
    }
    splitTextToSize(value: string) { return [value]; }
    addPage() { events.currentPage++; events.pages++; }
    setPage(n: number) { events.currentPage = n; }
    getNumberOfPages() { return events.pages; }
    getCurrentPageInfo() { return { pageNumber: events.currentPage }; }
    save(filename: string) { events.filename = filename; }
  },
}));

vi.mock("jspdf-autotable", () => ({
  default: (doc: {
    lastAutoTable?: { finalY: number };
    addPage: () => void;
  }, options: {
    startY: number;
    head: Array<Array<{ content?: string } | string>>;
    body: string[][];
    foot?: string[][];
    willDrawPage?: () => void;
  }) => {
    const estimate = 18 + options.body.length * 8.4 + (options.foot?.length ? 9 : 0);
    let top = options.startY;
    if (top + estimate > 194) {
      // Simulate AutoTable's own page break if the caller was not careful.
      doc.addPage();
      events.autoBreaks++;
      top = 47;
    }
    options.willDrawPage?.();
    const h = options.head[0][0];
    events.tables.push({
      title: typeof h === "string" ? h : h.content ?? "",
      page: events.currentPage,
      startY: top,
      rows: options.body.length,
      headRows: options.head.length,
    });
    doc.lastAutoTable = { finalY: top + estimate };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  events.currentPage = 1;
  events.pages = 1;
  events.autoBreaks = 0;
  events.filename = "";
  events.text = [];
  events.tables = [];
});

describe("complete expense analysis PDF pagination", () => {
  it("moves an analysis to a fresh page when it won't fit; does not scatter small blocks", () => {
    expect(shouldStartFreshAnalysisPage(47, 110)).toBe(false);
    expect(shouldStartFreshAnalysisPage(100, 42)).toBe(false);
    expect(shouldStartFreshAnalysisPage(157, 60)).toBe(true);
    expect(shouldStartFreshAnalysisPage(160, 200)).toBe(true);
    expect(shouldStartFreshAnalysisPage(47, 200)).toBe(false);
    expect(shouldStartFreshAnalysisPage(182, 16)).toBe(true);
  });

  it("keeps payment and budget analysis together, avoiding a nearly empty orphan page", async () => {
    const categories = Array.from({ length: 11 }, (_, i) => ({
      category: "Categoria " + (i + 1),
      total: 1500 - i * 100,
      share: 18 - i,
    }));
    const payments = ["Transferência", "Cartão", "Pix", "Dinheiro", "Outro"].map((method, i) => ({
      method, total: 4500 - i * 300, count: 8 - i, percentage: 35 - i * 5,
    }));
    const report: FinancialReport = {
      worksheetName: "Resumo",
      fileName: "FinanceControl_Analise_2026-10.xlsx",
      title: "Análise de Despesas",
      subtitle: "Despesas de 01/10/2026 a 26/10/2026 · 62 registros",
      filterDescription: "Sem filtros adicionais",
      metrics: [
        { label: "Gastos do período", value: "R$ 8.301,30" },
        { label: "Média diária", value: "R$ 319,28" },
        { label: "Maior categoria", value: "Moradia" },
        { label: "Variação", value: "Queda de 17,5%" },
      ],
      columns: ["Categoria", "Valor"],
      columnWidths: [35, 20],
      amountColumn: "Valor",
      rows: [],
      categories,
      graphs: [
        { kind: "category", title: "Categorias", points: categories.map(c => ({
          name: c.category, value: c.total,
        })) },
        { kind: "evolution", title: "Evolução", points: [
          { name: "01/10", value: 200 }, { name: "26/10", value: 400 },
        ] },
      ],
      analysis: {
        payments,
        changes: Array.from({ length: 9 }, (_, i) => ({
          category: "Categoria " + (i + 1),
          current: 200, previous: 100, delta: 100, pct: 100,
        })),
        budget: {
          totalBudget: 1500, totalSpent: 2100, available: -600, percentage: 140,
          rows: [
            { category: "Alimentação", budget: 1000, spent: 1700, available: -700, percentage: 170 },
            { category: "Educação", budget: 500, spent: 400, available: 100, percentage: 80 },
          ],
        },
        insights: ["Moradia representa 26% dos gastos."],
        previousEvolution: [300, 350],
        comparisonLabel: "mês anterior",
      },
    };

    await exportCompleteExpenseAnalysisPdf(report);

    expect(events.tables.map(t => t.title)).toEqual([
      "Gastos por categoria · valor e participação",
      "Gastos por forma de pagamento",
      "Orçamento x realizado",
      "Variações por categoria · mês anterior",
    ]);
    expect(events.tables.map(t => t.page)).toEqual([2, 3, 3, 4]);
    expect(events.tables.every(t => t.headRows === 2)).toBe(true);
    expect(events.tables[1].startY).toBe(47);
    expect(events.autoBreaks).toBe(0);
    expect(events.pages).toBe(4);
    expect(events.text).toContain("Queda de 17,5%");
    expect(events.text.some(t => /[↑↓→]/.test(t))).toBe(false);
    expect(events.filename).toBe("FinanceControl_Analise_2026-10.pdf");
  });
});
