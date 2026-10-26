import { describe, expect, it } from "vitest";
import { buildFinancialReportCsv, type FinancialReport } from "@/lib/financial-data-export";

const report: FinancialReport = {
  worksheetName: "Analise",
  fileName: "FinanceControl_Analise_2026-10.xlsx",
  title: "Análise de Despesas",
  subtitle: "Outubro de 2026",
  filterDescription: "Categoria: Alimentação · Conta: Inter",
  metrics: [
    { label: "Gastos", value: "R$ 113,89" },
    { label: "Registros", value: "1" },
  ],
  columns: ["Data", "Estabelecimento", "Valor", "Descrição"],
  columnWidths: [16, 35, 20, 55],
  amountColumn: "Valor",
  descriptionColumn: "Descrição",
  rows: [
    { Data: "25/10/2026", Estabelecimento: "Mercado", Valor: 113.89,
      Descrição: 'COXA MOLE; 0,720 kg · R$ 45,99/kg\nGELATINA "UVA"' },
  ],
  graphs: [
    { title: "Gastos por categoria", kind: "category", points: [{ name: "Alimentação", value: 113.89, color: "hsl(159 55% 56%)" }] },
    { title: "Evolução", kind: "evolution", points: [{ name: "25/10", value: 113.89 }] },
  ],
};

describe("exports from analytics and finance pages", () => {
  it("exports only provided filtered rows, preserves Brazilian decimal commas and escapes receipts", () => {
    const csv = buildFinancialReportCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Data;Estabelecimento;Valor;Descrição");
    expect(csv).toContain("25/10/2026;Mercado;113,89;");
    expect(csv).toContain('"COXA MOLE; 0,720 kg · R$ 45,99/kg\nGELATINA ""UVA"""');
    expect(csv).not.toContain("Conta: Inter");
  });

  it("neutralizes spreadsheet formulas in externally supplied descriptions", () => {
    const csv = buildFinancialReportCsv({
      ...report,
      rows: [{ Data: "25/10/2026", Estabelecimento: "Fornecedor", Valor: 1, Descrição: "=SUM(A1:A9)" }],
    });
    expect(csv).toContain(";'=SUM(A1:A9)");
  });

  it("never combines several transfers into income or expense automatically", () => {
    const transfers: FinancialReport = {
      ...report, title: "Transferências", columns: ["Origem", "Destino", "Valor"],
      rows: [{ Origem: "Inter", Destino: "Caixa", Valor: 250 }],
      metrics: [
        { label: "Volume transferido", value: "R$ 250,00" },
        { label: "Receita gerada", value: "R$ 0,00" },
        { label: "Despesa gerada", value: "R$ 0,00" },
      ],
    };
    expect(buildFinancialReportCsv(transfers)).toContain("Inter;Caixa;250");
    expect(buildFinancialReportCsv(transfers)).not.toContain("Receita gerada");
  });
});
