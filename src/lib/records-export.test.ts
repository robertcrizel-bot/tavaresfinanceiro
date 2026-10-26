import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRecordsCsv, exportRecordsToCsv, exportRecordsToPdf, type RecordsExportPayload } from "@/lib/records-export";

const pdfMocks = vi.hoisted(() => ({ save: vi.fn(), table: vi.fn(), text: vi.fn() }));
vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
    setFillColor: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    rect: vi.fn(),
    text: pdfMocks.text,
    splitTextToSize: vi.fn((text: string) => [text]),
    roundedRect: vi.fn(),
    save: pdfMocks.save,
  })),
}));
vi.mock("jspdf-autotable", () => ({ default: pdfMocks.table }));

const downloadMocks = vi.hoisted(() => ({ name: "", parts: [] as BlobPart[] }));
const sample: RecordsExportPayload = {
  title: "Meus registros",
  subtitle: "2 lançamentos filtrados",
  filterDescription: "Categoria: Alimentação",
  metrics: [
    { label: "Entradas", value: "R$ 0,00" },
    { label: "Saídas", value: "R$ 120,39" },
    { label: "Saldo", value: "-R$ 120,39" },
    { label: "Registros", value: "2" },
  ],
  columns: ["Data", "Título", "Categoria", "Tipo", "Pagamento", "Conta/Cartão", "Valor (R$)", "Descrição"],
  amountColumn: "Valor (R$)",
  fileName: "FinanceControl_Registros_2026-10-26.xlsx",
  rows: [
    { "Data": "26/10/2026", "Título": "Supermercado", "Categoria": "Alimentação",
      "Tipo": "Saída", "Pagamento": "Pix", "Conta/Cartão": "Inter",
      "Valor (R$)": -113.89, "Descrição": 'Coxa mole; 0,720 kg\n"R$ 45,99/kg" = algo' },
    { "Data": "25/10/2026", "Título": "Padaria", "Categoria": "Alimentação",
      "Tipo": "Saída", "Pagamento": "Pix", "Conta/Cartão": "Inter",
      "Valor (R$)": -6.50, "Descrição": '=SUM(A1:A2)' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  downloadMocks.name = "";
  downloadMocks.parts = [];
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:records"),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal("Blob", vi.fn((parts: BlobPart[]) => {
    downloadMocks.parts = parts;
    return { parts, type: "test" } as unknown as Blob;
  }));
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      href: "", download: "", click: vi.fn(function (this: { download: string }) {
        downloadMocks.name = this.download;
      }),
    })),
  });
});

describe("Records PDF and CSV exports", () => {
  it("exports only filtered records as semicolon-separated CSV with decimal comma and escaped receipt text", () => {
    const csv = buildRecordsCsv(sample);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Data;Título;Categoria;Tipo;Pagamento;Conta/Cartão;Valor (R$);Descrição");
    expect(csv).toContain("-113,89");
    expect(csv).toContain('"Coxa mole; 0,720 kg\n""R$ 45,99/kg"" = algo"');
    expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv.split("\r\n")).toHaveLength(3); // Embedded receipt newline remains within a quoted field.

    exportRecordsToCsv(sample);
    expect(downloadMocks.name).toBe("FinanceControl_Registros_2026-10-26.csv");
    expect(downloadMocks.parts[0]).toBe(csv);
  });

  it("exports a readable landscape PDF with same filtered data, amounts and description", async () => {
    await exportRecordsToPdf(sample);
    expect(pdfMocks.save).toHaveBeenCalledWith("FinanceControl_Registros_2026-10-26.pdf");
    expect(pdfMocks.table).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [sample.columns],
        body: expect.any(Array),
      }),
    );
    const options = pdfMocks.table.mock.calls[0][1];
    expect(options.body).toHaveLength(2);
    expect(String(options.body[0][6]).replace(/\s/g, " ")).toContain("-R$ 113,89");
    expect(options.body[0][7]).toContain("R$ 45,99/kg");
    expect(options.body[1][7]).toBe("=SUM(A1:A2)");
    expect(options.showHead).toBe("everyPage");
  });
});
