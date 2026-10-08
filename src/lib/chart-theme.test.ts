import { describe, expect, it } from "vitest";
import {
  CHART_CATEGORICAL,
  CHART_GRID,
  CHART_SEMANTIC,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  chartColor,
} from "@/lib/chart-theme";

describe("chart-theme", () => {
  it("exposes a varied categorical palette", () => {
    expect(CHART_CATEGORICAL.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CHART_CATEGORICAL).size).toBe(CHART_CATEGORICAL.length);
    for (const color of CHART_CATEGORICAL) {
      expect(color).toMatch(/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
    }
  });

  it("cycles colors by index", () => {
    expect(chartColor(0)).toBe(CHART_CATEGORICAL[0]);
    expect(chartColor(CHART_CATEGORICAL.length)).toBe(CHART_CATEGORICAL[0]);
    expect(chartColor(CHART_CATEGORICAL.length + 3)).toBe(CHART_CATEGORICAL[3]);
  });

  it("provides semantic, grid, tick and tooltip tokens", () => {
    expect(Object.keys(CHART_SEMANTIC).sort()).toEqual(["expense", "income", "previous", "trend"]);
    expect(CHART_GRID).toMatch(/^hsl\(/);
    expect(CHART_TICK.fontSize).toBeGreaterThanOrEqual(10);
    expect(CHART_TOOLTIP_STYLE.borderRadius).toBe(8);
  });
});
