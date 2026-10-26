import { describe, expect, it } from "vitest";
import {
  CHART_CATEGORICAL,
  CHART_GRID,
  CHART_SEMANTIC,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  chartColor,
  categoryColor,
  paymentColor,
  entityColor,
} from "@/lib/chart-theme";

describe("chart-theme", () => {
  it("exposes a varied categorical palette", () => {
    expect(CHART_CATEGORICAL.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CHART_CATEGORICAL).size).toBe(CHART_CATEGORICAL.length);
    for (const color of CHART_CATEGORICAL) {
      expect(color).toMatch(/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
    }
  });

  it("keeps identities stable through reordering, filtering and new categories", () => {
    const names = ["Alimentação", "Moradia", "Categoria personalizada"];
    const colors = Object.fromEntries(names.map(name => [name, categoryColor(name)]));
    categoryColor("Outra categoria");
    for (const name of [...names].reverse().slice(1)) expect(categoryColor(name)).toBe(colors[name]);
    expect(categoryColor("  ALIMENTACAO ")).toBe(categoryColor("Alimentação"));
    expect(categoryColor("Alimentação")).toBe(CHART_CATEGORICAL[0]);
    expect(categoryColor("Moradia")).not.toBe(categoryColor("Alimentação"));
    expect(chartColor("stable-id")).toBe(chartColor("stable-id"));
  });

  it("gives familiar spending categories distinct, stable colors across every page", () => {
    const names = [
      "Moradia", "Alimentação", "Financiamento", "Transporte",
      "Supérfluos", "Educação", "Leite/Fralda", "Outros", "Saúde",
      "Internet/Telefone", "Bichos",
    ];
    const palette = names.map(categoryColor);
    expect(new Set(palette).size).toBe(names.length);
    expect(categoryColor("SUPERFLUOS")).toBe(categoryColor("Supérfluos"));
    expect(categoryColor("SAUDE")).toBe(categoryColor("Saúde"));
    expect(categoryColor("LEITE/FRALDA")).toBe(categoryColor("Leite/Fralda"));
    expect(categoryColor("Internet/Telefone")).toBe(categoryColor("internet/telefone"));
    expect(categoryColor("Alimentação")).toBe(CHART_CATEGORICAL[0]);
    expect(names.slice().reverse().map(categoryColor).reverse()).toEqual(palette);
  });

  it("uses stable payment identities and registered account/card colors", () => {
    expect(paymentColor("Crédito")).toBe(paymentColor("Cartão de Crédito"));
    expect(paymentColor("Pix")).not.toBe(paymentColor("Dinheiro"));
    expect(entityColor("a:123", "purple")).toBe("#a855f7");
    expect(entityColor("c:456", "purple")).toBe(entityColor("a:123", "purple"));
    expect(entityColor("a:123", "#123456")).toBe("#123456");
    expect(entityColor("a:123")).toBe(entityColor("a:123", "invalid"));
    expect(CHART_TOOLTIP_STYLE.color).toContain("var(--popover-foreground)");
    expect(CHART_TICK.fill).toContain("var(--muted-foreground)");
  });

  it("provides semantic, grid, tick and tooltip tokens", () => {
    expect(Object.keys(CHART_SEMANTIC).sort()).toEqual(["expense", "income", "previous", "trend"]);
    expect(CHART_GRID).toMatch(/^hsl\(/);
    expect(CHART_TICK.fontSize).toBeGreaterThanOrEqual(10);
    expect(CHART_TOOLTIP_STYLE.borderRadius).toBe(8);
  });
});
