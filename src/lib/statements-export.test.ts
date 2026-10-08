import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStatementsCsv,
  exportStatementsToCsv,
  exportStatementsToExcel,
  exportStatementsToPdf,
  statementExportFileName,
  type StatementsExportPayload,
} from "@/lib/statements-export";

const payload: StatementsExportPayload = {
  originLabel: "Conta Caixa",
  start: "2026-09-01",
  end: "2026-09-30",
  appliedFilters: ["Tipo: Saídas", "Categoria: Alimentação"],
  summary: [
    { label: "Entradas", value: "R$ 1.000,00" },
    { label: "Saídas", value: "R$ 300,00" },
    { label: "Saldo do período", value: "R$ 700,00" },
    { label: "Quantidade de movimentações", value: "2" },
  ],
  categories: [{ category: "Alimentação", total: 100, share: 66.7 }],
  rows: [
    {
      Data: "29/09/2026",
      Descrição: "Supermercado",
      Categoria: "Alimentação",
      Origem: "Conta Caixa",
      Tipo: "Saída",
      "Forma de pagamento": "Pix",
      Valor: -100,
    },
    {
      Data: "05/09/2026",
      Descrição: 'Padaria "Pão; Dourado"',
      Categoria: "Alimentação",
      Origem: "Conta Caixa",
      Tipo: "Saída",
      "Forma de pagamento": "Dinheiro",
      Valor: -2.5,
    },
  ],
};

const excelMocks = vi.hoisted(() => ({ writeBuffer: vi.fn() }));
const pdfMocks = vi.hoisted(() => ({
  save: vi.fn(),
  autoTable: vi.fn(),
  text: vi.fn(),
}));

vi.mock("exceljs", () => {
  const createCell = () => ({ value: null as unknown, font: null, fill: null, alignment: null, numFmt: "" });
  const rows = new Map<number, { cells: Map<number, ReturnType<typeof createCell>>; height: number | null }>();
  const getRow = (n: number) => {
    if (!rows.has(n)) rows.set(n, { cells: new Map(), height: null });
    return {
      getCell: (col: number) => {
        const row = rows.get(n)!;
        if (!row.cells.has(col)) row.cells.set(col, createCell());
        return row.cells.get(col)!;
      },
      set height(value: number | null) {
        rows.get(n)!.height = value;
      },
    };
  };
  const ws = {
    columns: [] as unknown[],
    mergeCells: vi.fn(),
    getRow: getRow,
    getCell: (row: number, col: number) => getRow(row).getCell(col),
    autoFilter: null as unknown,
    views: [] as unknown[],
  };
  return {
    default: {
      Workbook: vi.fn(() => ({
        creator: "",
        created: null as Date | null,
        addWorksheet: vi.fn(() => ws),
        xlsx: { writeBuffer: excelMocks.writeBuffer },
      })),
    },
  };
});

vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setFillColor: vi.fn(),
    text: pdfMocks.text,
    roundedRect: vi.fn(),
    save: pdfMocks.save,
    getNumberOfPages: vi.fn(() => 1),
  })),
}));

vi.mock("jspdf-autotable", () => ({
  default: pdfMocks.autoTable,
}));

const downloads = vi.hoisted(() => ({ blobs: [] as Blob[], filenames: [] as string[] }));

beforeEach(() => {
  vi.clearAllMocks();
  downloads.blobs = [];
  downloads.filenames = [];
  vi.stubGlobal(
    "Blob",
    vi.fn((parts: BlobPart[]) => {
      const blob = { parts, type: "mock" };
      downloads.blobs.push(blob as unknown as Blob);
      return blob;
    }),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(document, {
      createElement: vi.fn((tag: string) => {
        if (tag !== "a") return {};
        return {
          href: "",
          download: "",
          click: vi.fn(function (this: { download: string }) {
            downloads.filenames.push(this.download);
          }),
        };
      }),
    }),
  );
});

describe("statements-export", () => {
  it("builds filenames with origin and period", () => {
    expect(statementExportFileName("Conta Caixa", "2026-09-01", "2026-09-30", "xlsx")).toBe(
      "FinanceControl_Extrato_Conta_Caixa_2026-09-01_2026-09-30.xlsx",
    );
    expect(statementExportFileName("Todas", "2026-09-01", "2026-09-30", "pdf")).toBe(
      "FinanceControl_Extrato_Todas_2026-09-01_2026-09-30.pdf",
    );
  });

  it("builds CSV with pt-BR cells, quoting and BOM", () => {
    const csv = buildStatementsCsv(payload);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\n");
    expect(lines[0]).toBe("Data;Descrição;Categoria;Origem;Tipo;Forma de pagamento;Valor");
    expect(lines[1]).toContain("Supermercado");
    expect(lines[1].endsWith("-100,00")).toBe(true);
    expect(lines[2]).toContain('"Padaria ""Pão; Dourado"""');
  });

  it("exports CSV with the filtered rows and a clear filename", () => {
    exportStatementsToCsv(payload);
    expect(downloads.filenames).toEqual([
      "FinanceControl_Extrato_Conta_Caixa_2026-09-01_2026-09-30.csv",
    ]);
    expect(downloads.blobs).toHaveLength(1);
  });

  it("exports Excel with title, origin, period, filters, summary and table", async () => {
    await exportStatementsToExcel(payload);
    expect(excelMocks.writeBuffer).toHaveBeenCalledTimes(1);
    expect(downloads.filenames).toEqual([
      "FinanceControl_Extrato_Conta_Caixa_2026-09-01_2026-09-30.xlsx",
    ]);
  });

  it("exports PDF with header, summary, categories, table and dated footer filename", async () => {
    await exportStatementsToPdf(payload);
    const texts = pdfMocks.text.mock.calls.map((call) => String(call[0]));
    expect(texts).toContain("Extrato");
    expect(texts.some((text) => text.includes("Conta Caixa"))).toBe(true);
    expect(texts.some((text) => text.includes("29/09/2026") || text.includes("2026"))).toBe(true);
    expect(pdfMocks.autoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [["Data", "Descrição", "Categoria", "Origem", "Tipo", "Forma de pagamento", "Valor"]],
      }),
    );
    const body = pdfMocks.autoTable.mock.calls[0][1].body as string[][];
    expect(body).toHaveLength(2);
    expect(body[0][1]).toBe("Supermercado");
    expect(pdfMocks.save).toHaveBeenCalledWith(
      "FinanceControl_Extrato_Conta_Caixa_2026-09-01_2026-09-30.pdf",
    );
  });
});
