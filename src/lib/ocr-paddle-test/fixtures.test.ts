import { describe, expect, it } from "vitest";
import { drogalRegions } from "./__fixtures__/drogal.fixture";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";

describe("PaddleOCR runtime fixtures", () => {
  it("preserves the Drogal regions", () => {
    const texts = drogalRegions.map((region) => region.text);

    expect(drogalRegions).toHaveLength(61);
    expect(texts.some((text) => text.includes("POSTEC POMADA 20G"))).toBe(true);
    expect(texts.some((text) => text.includes("MAMADES 75MCG 28CPR"))).toBe(true);
    expect(texts.some((text) => text.includes("CAFEINA+CARISOPRODO"))).toBe(true);
    expect(texts.some((text) => text.includes("ME OXICAM 1SMG 10CPR"))).toBe(true);
    expect(drogalRegions).toContainEqual({
      text: "16204 POSTEC POMADA 20G",
      confidence: 0.98,
      bbox: [[179, 446], [537, 449], [536, 480], [179, 477]],
    });
  });

  it("preserves the Fonseca regions and anomalous vertical bbox", () => {
    const texts = fonsecaRegions.map((region) => region.text);

    expect(fonsecaRegions).toHaveLength(112);
    expect(texts).toContain("9995251");
    expect(texts).toContain("4,");
    expect(texts).toContain("99");
    expect(texts).toContain("0.742KG");
    expect(texts).toContain("0.464KG");
    expect(texts).toContain("0.402KG");
    expect(texts).toContain("1.127KG");
    expect(fonsecaRegions).toContainEqual({
      text: "CNPJ do En1tenta 57.032.427/0001-99",
      confidence: 0.96,
      bbox: [[297, 72], [779, 64], [779, 102], [297, 110]],
    });
    expect(fonsecaRegions).toContainEqual({
      text: "9995251",
      confidence: 0.79,
      bbox: [[954, 877], [998, 876], [1003, 1096], [960, 1097]],
    });
  });
});
