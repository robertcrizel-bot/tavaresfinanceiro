import { describe, expect, it } from "vitest";
import {
  detectColumnsFromHeader,
  spatialGroup,
  SpatialItem,
} from "./spatialGrouper";
import type { PaddleOcrRegion } from "./types";
import { drogalRegions } from "./__fixtures__/drogal.fixture";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";

function makeRegion(
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  confidence = 0.9
): PaddleOcrRegion {
  return {
    text,
    confidence,
    bbox: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  };
}

describe("spatialGrouper", () => {
  it("accepts PaddleOCR regions with tuple coordinates", () => {
    const region: PaddleOcrRegion = {
      text: "REGION",
      confidence: 0.99,
      bbox: [[10, 20], [30, 20], [30, 40], [10, 40]],
    };

    expect(region.bbox[0]).toEqual([10, 20]);
  });

  it("computes finite geometry from real PaddleOCR regions", () => {
    const realSamples: PaddleOcrRegion[][] = [
      drogalRegions.slice(0, 5),
      [
        fonsecaRegions[0],
        fonsecaRegions.find((region) => region.text === "9995251")!,
      ],
    ];

    for (const regions of realSamples) {
      const result = spatialGroup(regions);
      const geometries = result.lines.flatMap((line) => line.regions);

      expect(geometries.length).toBeGreaterThan(0);
      for (const geometry of geometries) {
        expect([
          geometry.cx,
          geometry.cy,
          geometry.width,
          geometry.height,
          geometry.minX,
          geometry.maxX,
          geometry.minY,
          geometry.maxY,
        ].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("returns empty result for empty input", () => {
    const result = spatialGroup([]);
    expect(result.items).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.columns).toEqual([]);
    expect(result.headerColumns).toBeNull();
  });

  it("groups regions into lines by Y proximity", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("QTD", 200, 100, 40, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("1", 200, 150, 40, 12),
      makeRegion("FEIJAO", 10, 200, 80, 12),
      makeRegion("2", 200, 200, 40, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.lines.length).toBe(3);
  });

  it("detects header columns", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("QTD", 200, 100, 40, 12),
      makeRegion("VALOR", 300, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("1", 200, 150, 40, 12),
      makeRegion("5,99", 300, 150, 60, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.headerColumns).not.toBeNull();
    expect(result.headerColumns!.nameIdx).toBe(0);
  });

  it("detects a semantic header when there is only one global column", () => {
    const regions = [
      makeRegion("PRODUTO QTD VALOR", 10, 100, 120, 12),
      makeRegion("ARROZ", 10, 150, 120, 12),
      makeRegion("FEIJAO", 10, 200, 120, 12),
    ];

    const result = spatialGroup(regions);

    expect(result.columns).toHaveLength(1);
    expect(result.headerColumns).toEqual({
      nameIdx: 0,
      qtyIdx: null,
      unitIdx: null,
      unitPriceIdx: null,
      totalIdx: null,
    });
    expect(result.items).toHaveLength(0);
  });

  it.each([
    {
      text: "CODIGO DESCRICAO",
      categories: ["code", "description"],
    },
    {
      text: "QTD UN VL UNIT VL TOTAL",
      categories: ["quantity", "unit", "unitPrice", "total"],
    },
    {
      text: "GTDE UN VL UNIT VL TOTAL",
      categories: ["quantity", "unit", "unitPrice", "total"],
    },
    {
      text: "CODIGO DESCRICAO QTD UN VL UNIT VL TOTAL",
      categories: [
        "code",
        "description",
        "quantity",
        "unit",
        "unitPrice",
        "total",
      ],
    },
  ])(
    "detects every semantic category in compact header $text",
    ({ text, categories }) => {
      const result = spatialGroup([makeRegion(text, 10, 100, 300, 12)]);

      expect(result.headerSemantics).toEqual([{ text, categories }]);
      expect(result.headerColumns).toEqual({
        nameIdx: null,
        qtyIdx: null,
        unitIdx: null,
        unitPriceIdx: null,
        totalIdx: null,
      });
    },
  );

  it("does not invent columns inside one compact header region", () => {
    const result = spatialGroup([
      makeRegion(
        "CODIGO DESCRICAO QTD UN VL UNIT VL TOTAL",
        10,
        100,
        300,
        12,
      ),
    ]);

    expect(detectColumnsFromHeader(result.lines[0])).toEqual([]);
  });

  it("detects columns from distinct non-overlapping semantic header regions", () => {
    const result = spatialGroup([
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("QTD", 180, 100, 40, 12),
      makeRegion("TOTAL", 280, 100, 60, 12),
    ]);

    expect(detectColumnsFromHeader(result.lines[0])).toEqual([
      { minX: 10, maxX: 90, centerX: 50 },
      { minX: 180, maxX: 220, centerX: 200 },
      { minX: 280, maxX: 340, centerX: 310 },
    ]);
    expect(result.columns).toHaveLength(3);
  });

  it("extracts items from grid layout", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("QTD", 200, 100, 40, 12),
      makeRegion("VALOR", 300, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("1", 200, 150, 40, 12),
      makeRegion("5,99", 300, 150, 60, 12),
      makeRegion("FEIJAO", 10, 200, 80, 12),
      makeRegion("2", 200, 200, 40, 12),
      makeRegion("8,50", 300, 200, 60, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(2);
    expect(result.items[0].name).toBe("ARROZ");
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].total).toBe(5.99);
    expect(result.items[1].name).toBe("FEIJAO");
    expect(result.items[1].quantity).toBe(2);
    expect(result.items[1].total).toBe(8.5);
  });

  it("parses BRL values with dots and commas", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("VALOR", 200, 100, 60, 12),
      makeRegion("ITEM", 10, 150, 80, 12),
      makeRegion("1.234,56", 200, 150, 80, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(1);
    expect(result.items[0].total).toBe(1234.56);
  });

  it("skips summary lines from items", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("VALOR", 200, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("5,99", 200, 150, 60, 12),
      makeRegion("SUBTOTAL", 10, 200, 80, 12),
      makeRegion("15,00", 200, 200, 60, 12),
    ];
    const result = spatialGroup(regions);
    const hasSubtotal = result.items.some((i) =>
      i.name.toUpperCase().includes("SUBTOTAL")
    );
    expect(hasSubtotal).toBe(false);
    expect(result.items.length).toBe(1);
  });

  it("handles regions with low confidence", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("VALOR", 200, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 80, 12, 0.3),
      makeRegion("5,99", 200, 150, 60, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(1);
    expect(result.items[0].lowConfidenceFields).toContain("name");
  });

  it("builds allText from all regions", () => {
    const regions = [
      makeRegion("LINHA1", 10, 100, 80, 12),
      makeRegion("LINHA2", 10, 150, 80, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.allText).toContain("LINHA1");
    expect(result.allText).toContain("LINHA2");
  });

  it("handles single column layout gracefully", () => {
    const regions = [
      makeRegion("CABECALHO", 10, 100, 120, 12),
      makeRegion("LINHA1", 10, 150, 120, 12),
      makeRegion("LINHA2", 10, 200, 120, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(0);
    expect(result.headerColumns).toBeNull();
  });

  it("merges text from regions on same line and column", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("VALOR", 200, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 50, 12),
      makeRegion("TIPO", 60, 150, 30, 12),
      makeRegion("5,99", 200, 150, 60, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe("ARROZ TIPO");
  });

  it("detects quantity column separately from total", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("QTD", 150, 100, 40, 12),
      makeRegion("UNIT", 220, 100, 50, 12),
      makeRegion("TOTAL", 300, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("1", 150, 150, 40, 12),
      makeRegion("5,99", 220, 150, 50, 12),
      makeRegion("5,99", 300, 150, 60, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(1);
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].unitPrice).toBe(5.99);
    expect(result.items[0].total).toBe(5.99);
  });

  it("keeps total null when quantity and unit price exist without a recognized total", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("QTD", 150, 100, 40, 12),
      makeRegion("UNIT", 220, 100, 50, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("3", 150, 150, 40, 12),
      makeRegion("2,50", 220, 150, 50, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(1);
    expect(result.items[0].quantity).toBe(3);
    expect(result.items[0].unitPrice).toBe(2.5);
    expect(result.items[0].total).toBeNull();
  });

  it("preserves a recognized total associated with the item", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("QTD", 150, 100, 40, 12),
      makeRegion("UNIT", 220, 100, 50, 12),
      makeRegion("TOTAL", 300, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("3", 150, 150, 40, 12),
      makeRegion("2,50", 220, 150, 50, 12),
      makeRegion("6,75", 300, 150, 60, 12),
    ];

    const result = spatialGroup(regions);

    expect(result.items.length).toBe(1);
    expect(result.items[0].total).toBe(6.75);
  });

  it("handles receipt-like layout with 4 columns", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 100, 12),
      makeRegion("QTD", 150, 100, 40, 12),
      makeRegion("UN", 210, 100, 30, 12),
      makeRegion("VALOR", 260, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 100, 12),
      makeRegion("1", 150, 150, 40, 12),
      makeRegion("KG", 210, 150, 30, 12),
      makeRegion("5,99", 260, 150, 60, 12),
      makeRegion("FEIJAO", 10, 200, 100, 12),
      makeRegion("2", 150, 200, 40, 12),
      makeRegion("KG", 210, 200, 30, 12),
      makeRegion("8,50", 260, 200, 60, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(2);
    expect(result.items[0].unit).toBe("KG");
    expect(result.items[1].unit).toBe("KG");
    expect(result.items[0].total).toBe(5.99);
    expect(result.items[1].total).toBe(8.5);
  });

  it("handles inclined receipt with slight Y variation", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("VALOR", 200, 100, 60, 12),
      makeRegion("ARROZ", 12, 152, 80, 12),
      makeRegion("5,99", 202, 148, 60, 12),
      makeRegion("FEIJAO", 14, 204, 80, 12),
      makeRegion("8,50", 204, 202, 60, 12),
    ];
    const result = spatialGroup(regions);
    expect(result.items.length).toBe(2);
  });

  it("ignores non-data lines from items", () => {
    const regions = [
      makeRegion("PRODUTO", 10, 100, 80, 12),
      makeRegion("VALOR", 200, 100, 60, 12),
      makeRegion("ARROZ", 10, 150, 80, 12),
      makeRegion("5,99", 200, 150, 60, 12),
      makeRegion("CNPJ: 12.345.678/0001-90", 10, 200, 160, 12),
    ];
    const result = spatialGroup(regions);
    const hasCNPJ = result.items.some((i) => i.name.includes("CNPJ"));
    expect(hasCNPJ).toBe(false);
    expect(result.items.length).toBe(1);
  });
});
