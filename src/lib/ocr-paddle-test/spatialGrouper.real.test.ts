import { describe, expect, it } from "vitest";
import { drogalRegions } from "./__fixtures__/drogal.fixture";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";
import { detectColumnsFromHeader, spatialGroup } from "./spatialGrouper";
import type { PaddleOcrRegion } from "./types";

type SpatialGroupResult = ReturnType<typeof spatialGroup>;

function lineTexts(result: SpatialGroupResult, lineIndex: number) {
  return result.lines[lineIndex]?.regions.map((region) => region.text) ?? [];
}

function findLineIndex(result: SpatialGroupResult, text: string) {
  return result.lines.findIndex((line) =>
    line.regions.some((region) => region.text === text),
  );
}

function findSpatialRegion(result: SpatialGroupResult, text: string) {
  return result.lines
    .flatMap((line) => line.regions)
    .find((region) => region.text === text);
}

function printDiagnostic(label: string, regions: PaddleOcrRegion[]) {
  const result = spatialGroup(regions);
  const output = [
    `=== ${label} ===`,
    `Regioes de entrada: ${regions.length}`,
    `Linhas espaciais formadas: ${result.lines.length}`,
    "Linhas espaciais:",
  ];

  result.lines.forEach((line, index) => {
    const texts = line.regions.map((region) => JSON.stringify(region.text));
    output.push(`  Linha ${index} | Y aproximado: ${line.avgY.toFixed(2)} | ${texts.join(" | ")}`);
  });

  output.push(`Itens encontrados: ${result.items.length}`);
  output.push("Itens:");

  if (result.items.length === 0) {
    output.push("  (nenhum item)");
  } else {
    result.items.forEach((item, index) => {
      output.push(
        `  Item ${index} | name=${JSON.stringify(item.name)} | quantity=${JSON.stringify(item.quantity)} | unit=${JSON.stringify(item.unit)} | unitPrice=${JSON.stringify(item.unitPrice)} | total=${JSON.stringify(item.total)}`,
      );
    });
  }

  console.log(output.join("\n"));
}

describe("spatialGrouper real fixture diagnostic", () => {
  it("prints the current Drogal result", () => {
    printDiagnostic("DROGAL", drogalRegions);
  });

  it("prints the current Fonseca result", () => {
    printDiagnostic("FONSECA", fonsecaRegions);
  });
});

describe("Drogal current spatial characterization", () => {
  const result = spatialGroup(drogalRegions);

  it.each([
    {
      descriptionTexts: [
        "16204 POSTEC POMADA 20G",
        "1X UN 152.43 152,43",
      ],
      finalValueText: "Por 114,32",
    },
    {
      descriptionTexts: ["64780 MAMADES 75MCG 28CPR"],
      finalValueText: "Por 35,60 desconto de 24,99%",
    },
    {
      descriptionTexts: ["64023 CAFEINA+CARISOPRODO"],
      finalValueText: "Por 18,80",
    },
    {
      descriptionTexts: ["27995 ME OXICAM 1SMG 10CPR"],
      finalValueText: "Por 16,34",
    },
  ])(
    "keeps $descriptionTexts followed by the printed final value",
    ({ descriptionTexts, finalValueText }) => {
      const descriptionLineIndex = findLineIndex(result, descriptionTexts[0]);

      expect(descriptionLineIndex).toBeGreaterThanOrEqual(0);
      expect(lineTexts(result, descriptionLineIndex)).toEqual(
        expect.arrayContaining(descriptionTexts),
      );
      expect(lineTexts(result, descriptionLineIndex + 1).join(" ")).toContain(
        finalValueText,
      );
    },
  );

  it("detects the compact header with a partial column mapping", () => {
    expect(result.headerColumns).toEqual({
      nameIdx: 0,
      qtyIdx: null,
      unitIdx: null,
      unitPriceIdx: null,
      totalIdx: null,
    });
  });

  it("detects multiple semantic categories in the compact OCR region", () => {
    const compactRegion = result.headerSemantics.find(
      (region) => region.text === "IQTD JUN IVL UN R$I VL ITEM R$",
    );

    expect(compactRegion?.categories).toEqual([
      "description",
      "quantity",
      "unit",
      "unitPrice",
      "total",
    ]);
  });

  it("does not derive columns from ambiguous compact header geometry", () => {
    const headerLineIndex = findLineIndex(result, "ICOD IDESC");
    const headerLine = result.lines[headerLineIndex];

    expect(
      headerLine.regions.map(({ text, minX, maxX, cx }) => ({
        text,
        minX,
        maxX,
        cx,
      })),
    ).toEqual([
      { text: "#", minX: 136, maxX: 172, cx: 154 },
      { text: "ICOD IDESC", minX: 159, maxX: 342, cx: 250.5 },
      {
        text: "IQTD JUN IVL UN R$I VL ITEM R$",
        minX: 435,
        maxX: 903,
        cx: 669,
      },
    ]);
    expect(detectColumnsFromHeader(headerLine)).toEqual([]);
  });

  // Current behavior characterization: expected to change in later stages.
  it("currently collapses the receipt into one global column", () => {
    expect(result.columns).toHaveLength(1);
  });

  // Current behavior characterization: expected to change in later stages.
  it("currently extracts no items", () => {
    expect(result.items).toHaveLength(0);
  });
});

describe("Fonseca current spatial characterization", () => {
  const result = spatialGroup(fonsecaRegions);

  it("currently detects four global columns and a partial header mapping", () => {
    expect(result.columns).toHaveLength(4);
    expect(result.items).toHaveLength(13);
    expect(result.headerColumns).toEqual({
      nameIdx: 0,
      qtyIdx: null,
      unitIdx: null,
      unitPriceIdx: 2,
      totalIdx: null,
    });
  });

  it("keeps both OCR header regions on the same spatial line", () => {
    const headerLineIndex = findLineIndex(result, "CODIGO DESCRICAO");

    expect(headerLineIndex).toBeGreaterThanOrEqual(0);
    expect(lineTexts(result, headerLineIndex)).toEqual([
      "CODIGO DESCRICAO",
      "GTDE UN UL UNIT UL TOTAL",
    ]);
  });

  it.each([
    {
      description:
        "7899975800585 SORUETE NESILE Y.5L NAPOLITANO FLOCOS TRAD",
      nextLineTexts: ["1UM 24,99", "24,99"],
    },
    {
      description: "7622210571724 REFRESCO EM PO TANG 18GR MORANG0",
      nextLineTexts: ["1UN", "1,29", "1,29"],
    },
    {
      description: "7622210571694 REFRESCO EM PO TANG 18GR MARACUJA",
      nextLineTexts: ["1UN", "1,29", "1,29"],
    },
  ])(
    "keeps $description followed by its printed quantity and values",
    ({ description, nextLineTexts }) => {
      const descriptionLineIndex = findLineIndex(result, description);

      expect(descriptionLineIndex).toBeGreaterThanOrEqual(0);
      expect(lineTexts(result, descriptionLineIndex + 1)).toEqual(
        nextLineTexts,
      );
    },
  );

  it.each([
    {
      description: "977 BETERRABA kg",
      evidence: ["0.742KG", "99"],
    },
    {
      description: "171 CEBOLA Kg",
      evidence: ["0.464KG", "6", "79"],
    },
    {
      description: "820 MANGA TOMY kg",
      evidence: ["0.402KG", "5", "99"],
    },
    {
      description: "792 REPOLHO VERDE kg",
      evidence: ["1.127KG", "3", "37"],
    },
  ])(
    "keeps the raw weight evidence for $description on one spatial line",
    ({ description, evidence }) => {
      const productLineIndex = findLineIndex(result, description);

      expect(productLineIndex).toBeGreaterThanOrEqual(0);
      expect(lineTexts(result, productLineIndex)).toEqual([
        description,
        ...evidence,
      ]);
    },
  );

  // Current behavior characterization: expected to change in later stages.
  it("currently returns receipt metadata and summaries as false items", () => {
    const itemNames = result.items.map((item) => item.name);

    expect(itemNames).toEqual(
      expect.arrayContaining([
        "Qtde. Total de Itens",
        "Valor a Pagar R$",
        "CARTEIRA DIGITAL",
        "Fonseca Supermercados",
        "ESTAB 057032427000199",
        "CU-000926212981",
        "SJ Rio Pardo/SP",
        "16/09/26",
      ]),
    );
  });

  it.each(["2252", "999", "9995251"])(
    "keeps anomalous region %s with a much greater height than a nearby normal region",
    (text) => {
      const anomalousRegion = findSpatialRegion(result, text);
      const nearbyNormalRegion = findSpatialRegion(
        result,
        "7898080640222 CREME LEITE OHT ITALAC 200G TP",
      );

      expect(anomalousRegion).toBeDefined();
      expect(nearbyNormalRegion).toBeDefined();
      expect(anomalousRegion!.height).toBeGreaterThan(
        nearbyNormalRegion!.height * 2,
      );
    },
  );
});
