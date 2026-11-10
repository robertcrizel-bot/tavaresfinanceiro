import { describe, expect, it } from "vitest";
import { formatForecastEffectiveDate } from "./forecast-effective-date";

describe("forecast actual payment date", () => {
  it("preserves the actual day instead of the scheduled due day", () => {
    expect(formatForecastEffectiveDate("2026-11-06")).toBe("06/11/2026");
    expect(formatForecastEffectiveDate("2026-11-06T00:00:00+00:00")).toBe("06/11/2026");
  });

  it("does not shift the date when a timestamp contains a timezone", () => {
    expect(formatForecastEffectiveDate("2026-12-31T00:00:00Z")).toBe("31/12/2026");
  });

  it("does not invent an effective date for missing or invalid values", () => {
    expect(formatForecastEffectiveDate(null)).toBeNull();
    expect(formatForecastEffectiveDate("")).toBeNull();
    expect(formatForecastEffectiveDate("2026-02-31")).toBeNull();
  });
});
