import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportFinanceExcel, type FinanceExcelReport } from "@/lib/finance-excel-report";

const mocks = vi.hoisted(() => ({
  writeBuffer: vi.fn().mockResolvedValue(new Uint8Array([80, 75])),
  sheets: [] as Array<{
    name: string;
    sheet: {
      views: unknown[];
      autoFilter: unknown;
      columns: unknown[];
      getCell: (row: number, col: number) => { value: unknown; numFmt: string; alignment: unknown; fill: unknown };
      getRow: (row: number) => { height: number | null };
    };
  }>,
  files: [] as string[],
}));

vi.mock("exceljs", () => {
  const Workbook = vi.fn().mockImplementation(() => ({
    creator: "",
    created: null,
    xlsx: { writeBuffer: mocks.writeBuffer },
    addWorksheet: (name: string) => {
      const cells = new Map<string, { value: unknown; numFmt: string; alignment: unknown; fill: unknown }>();
      const heights = new Map<number, { height: number | null }>();
      const getCell = (row: number, col: number) => {
        const key = row + ":" + col;
        if (!cells.has(key)) cells.set(key, { value: null, numFmt: "", alignment: null, fill: null });
        return cells.get(key)!;
      };
      const sheet = {
        columns: [] as unknown[],
        views: [] as unknown[],
        autoFilter: null as unknown,
        mergeCells: vi.fn(),
        getCell,
        getRow: (row: number) => {
          if (!heights.has(row)) heights.set(row, { height: null });
          return heights.get(row)!;
        },
      };
      mocks.sheets.push({ name, sheet });
      return sheet;
    },
  }));
  return { default: { Workbook } };
});

const report: FinanceExcelReport = {
  worksheetName: "Registros",
  fileName: "FinanceControl_Registros_2026-10-26.xlsx",
  title: "Meus registros",
  subtitle: "3 registros selecionados",
  filterDescription: "Categoria: Alimentação",
  metrics: [
    { label: "Entradas", value: "R$ 7.440,00" },
    { label: "Saídas", value: "R$ 8.301,30" },
    { label: "Saldo do recorte", value: "-R$ 861,30" },
    { label: "Registros", value: "3" },
  ],
  columns: ["Data", "Título", "Categoria", "Tipo", "Pagamento", "Conta/Cartão", "Valor (R$)", "Descrição"],
  columnWidths: [16, 38, 24, 22, 22, 29, 18, 66],
  amountColumn: "Valor (R$)",
  descriptionColumn: "Descrição",
  rows: [
    {
      Data: "25/10/2026", Título: "Mercado", Categoria: "Alimentação", Tipo: "Saída",
      Pagamento: "Pix", "Conta/Cartão": "Inter", "Valor (R$)": -113.89,
      Descrição: "Coxa mole — 0,720 kg · R$ 45,99/kg · Total R$ 33,11",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sheets = [];
  mocks.files = [];
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:export"),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      href: "",
      download: "",
      click: vi.fn(function (this: { download: string }) { mocks.files.push(this.download); }),
    })),
  });
});

describe("shared FinanceControl Excel report", () => {
  it("has readable compact title, summary, styled body, filter and no frozen pane", async () => {
    await exportFinanceExcel(report);
    const { sheet, name } = mocks.sheets[0];
    expect(name).toBe("Registros");
    expect(sheet.views).toEqual([{ state: "normal", showGridLines: false }]);
    expect(sheet.getCell(1, 1).value).toContain("FINANCECONTROL");
    expect(sheet.getCell(3, 1).value).toContain("Categoria: Alimentação");
    expect(sheet.getCell(7, 1).value).toBe("R$ 7.440,00");
    expect(sheet.getCell(7, 7).value).toBe("3");
    expect(sheet.getCell(9, 8).value).toBe("Descrição");
    expect(sheet.getCell(10, 7).value).toBe(-113.89);
    expect(sheet.getCell(10, 8).value).toContain("R$ 45,99/kg");
    expect(sheet.getCell(10, 8).alignment).toEqual(expect.objectContaining({ wrapText: true }));
    expect(sheet.getCell(10, 7).numFmt).toContain("-R$");
    expect(sheet.autoFilter).toEqual({
      from: { row: 9, column: 1 },
      to: { row: 10, column: 8 },
    });
    expect(mocks.files).toEqual([report.fileName]);
  });

  it("lays out category summary in two columns and does not freeze the table", async () => {
    await exportFinanceExcel({
      ...report,
      worksheetName: "Extrato",
      columns: ["Data", "Descrição", "Categoria", "Origem", "Tipo", "Forma de pagamento", "Valor"],
      columnWidths: [15, 37, 20, 19, 22, 20, 18],
      amountColumn: "Valor",
      rows: [{ Data: "25/10/2026", Descrição: "Mercado", Categoria: "Alimentação", Origem: "Inter", Tipo: "Saída", "Forma de pagamento": "Pix", Valor: -113.89 }],
      categories: [
        { category: "Alimentação", total: 1770.71, share: 21.3 },
        { category: "Moradia", total: 2197.74, share: 26.5 },
      ],
    });
    const { sheet } = mocks.sheets[0];
    expect(sheet.getCell(9, 1).value).toBe("DESPESAS POR CATEGORIA");
    expect(sheet.getCell(10, 1).value).toBe("Alimentação");
    expect(sheet.getCell(10, 5).value).toBe("Moradia");
    expect(sheet.getCell(12, 7).value).toBe("Valor");
    expect(sheet.getCell(13, 7).value).toBe(-113.89);
    expect(sheet.views).toEqual([{ state: "normal", showGridLines: false }]);
  });

  it("handles zero rows gracefully without an invalid filter", async () => {
    await exportFinanceExcel({ ...report, rows: [], filterDescription: "" });
    const { sheet } = mocks.sheets[0];
    expect(sheet.autoFilter).toBe(null);
    expect(sheet.getCell(10, 1).value).toContain("Nenhuma movimentação");
  });
});
