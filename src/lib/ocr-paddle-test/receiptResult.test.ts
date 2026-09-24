import { describe, expect, it } from "vitest";
import {
  buildPaddleReceiptResult,
  selectEffectiveValue,
} from "./receiptResult";
import { drogalRegions } from "./__fixtures__/drogal.fixture";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";
import { hortifrutiRegions } from "./__fixtures__/hortifruti.fixture";

describe("selectEffectiveValue", () => {
  it("prefers explicitFinalValue over originalTotal", () => {
    expect(selectEffectiveValue(114.32, 152.43)).toBe(114.32);
  });

  it("uses originalTotal when explicitFinalValue is null", () => {
    expect(selectEffectiveValue(null, 8.7)).toBe(8.7);
  });

  it("returns null when both are null", () => {
    expect(selectEffectiveValue(null, null)).toBeNull();
  });
});

describe("buildPaddleReceiptResult Drogal", () => {
  const result = buildPaddleReceiptResult(drogalRegions);

  it("extracts 4 items", () => {
    expect(result.items).toHaveLength(4);
  });

  it("selects the correct effectiveValue on all 4 items", () => {
    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      114.32, 35.6, 18.8, 16.34,
    ]);
  });

  it("sums known item values to 185.06", () => {
    expect(result.sumKnownItemValues).toBeCloseTo(185.06, 2);
  });

  it("reads receiptTotal 185.06 from Valor a Pagar", () => {
    expect(result.receiptTotal).toBeCloseTo(185.06, 2);
  });

  it("difference from receipt total is zero (or cent rounding only)", () => {
    expect(result.differenceFromReceiptTotal).not.toBeNull();
    expect(Math.abs(result.differenceFromReceiptTotal!)).toBeLessThanOrEqual(0.01);
  });

  it("extracts merchant, cnpj and date without hardcoding", () => {
    expect(result.merchant).toBeTruthy();
    expect(result.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    expect(result.date).toBe("2026-09-11");
    expect(result.time).toBe("14:28:59");
  });

  it("does not use receiptTotal from item sum when marker exists", () => {
    expect(result.receiptTotal).not.toBeNull();
    expect(result.receiptTotal).toBeCloseTo(185.06, 2);
  });
});

describe("buildPaddleReceiptResult Fonseca", () => {
  const result = buildPaddleReceiptResult(fonsecaRegions);

  it("extracts 21 items", () => {
    expect(result.items).toHaveLength(21);
  });

  it("reads receiptTotal 88.38 from Valor a Pagar", () => {
    expect(result.receiptTotal).toBeCloseTo(88.38, 2);
  });

  it("keeps fragmented/ambiguous items without effectiveValue as null", () => {
    const withoutValue = result.items.filter(
      (item) => item.effectiveValue === null,
    );
    expect(withoutValue.length).toBeGreaterThan(0);
    for (const item of withoutValue) {
      expect(item.effectiveValue).toBeNull();
      expect(item.originalTotal).toBeNull();
      expect(item.explicitFinalValue).toBeNull();
    }
  });

  it("recovers weight money only where adjacent geometry supports it", () => {
    const [beterraba, cebola, manga, repolho] = result.items.slice(16, 20);

    expect(beterraba.unitPrice).toBeNull();
    expect(beterraba.originalTotal).toBeNull();
    expect(beterraba.effectiveValue).toBeNull();

    expect(cebola.unitPrice).toBe(6.79);
    expect(cebola.originalTotal).toBeNull();
    expect(cebola.effectiveValue).toBeNull();

    expect(manga.unitPrice).toBe(5.99);
    expect(manga.originalTotal).toBeNull();
    expect(manga.effectiveValue).toBeNull();

    expect(repolho.unitPrice).toBeNull();
    expect(repolho.originalTotal).toBe(3.37);
    expect(repolho.effectiveValue).toBe(3.37);
  });

  it("allows a partial result (sum need not match receiptTotal)", () => {
    const withValue = result.items.filter(
      (item) => item.effectiveValue !== null,
    );
    expect(withValue.length).toBe(14);
    expect(result.sumKnownItemValues).toBeCloseTo(67.54, 2);
    expect(result.differenceFromReceiptTotal).not.toBeNull();
    expect(result.differenceFromReceiptTotal).toBeCloseTo(67.54 - 88.38, 2);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("extracts merchant and cnpj", () => {
    expect(result.merchant).toBeTruthy();
    expect(result.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });
});

describe("buildPaddleReceiptResult multi-line vertical association", () => {
  function makeRegion(
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    return {
      text,
      confidence: 0.95,
      bbox: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
    };
  }

  const products = [
    { name: "Produto A", qty: "1 UN", unit: "5,99", total: "5,99" },
    { name: "Produto B", qty: "0,582 KG", unit: "15,90", total: "9,25" },
    { name: "Produto C", qty: "0,658 KG", unit: "5,99", total: "3,94" },
    { name: "Produto D", qty: "1 UN", unit: "7,99", total: "7,99" },
  ];

  function buildFourLineReceipt(): ReturnType<typeof makeRegion>[] {
    const regions = [
      makeRegion("PRODUTO QTD VL UNIT VL TOTAL", 10, 60, 300, 14),
    ];
    let y = 100;
    for (const p of products) {
      regions.push(makeRegion(p.name, 10, y, 200, 16));
      regions.push(makeRegion(p.qty, 10, y + 20, 80, 14));
      regions.push(makeRegion(p.unit, 250, y + 19, 70, 14));
      regions.push(makeRegion(p.total, 360, y + 40, 70, 14));
      y += 60;
    }
    regions.push(makeRegion("Qtde. Total de Itens", 10, y + 20, 200, 14));
    regions.push(makeRegion("Valor a Pagar R$: 74,36", 10, y + 50, 220, 14));
    return regions;
  }

  it("keeps each monetary value on its own product row with Y jitter", () => {
    const result = buildPaddleReceiptResult(buildFourLineReceipt());

    expect(result.items).toHaveLength(4);
    expect(result.items.map((i) => i.description)).toEqual([
      "Produto A",
      "Produto B",
      "Produto C",
      "Produto D",
    ]);
    expect(result.items.map((i) => i.unitPrice)).toEqual([
      5.99, 15.9, 5.99, 7.99,
    ]);
    expect(result.items.map((i) => i.originalTotal)).toEqual([
      5.99, 9.25, 3.94, 7.99,
    ]);
    expect(result.items.map((i) => i.effectiveValue)).toEqual([
      5.99, 9.25, 3.94, 7.99,
    ]);
    expect(result.receiptTotal).toBe(74.36);
  });

  it("does not migrate the next row value into the previous product", () => {
    const regions = [
      makeRegion("PRODUTO QTD VL UNIT VL TOTAL", 10, 60, 300, 14),
      makeRegion("Produto A", 10, 100, 200, 16),
      makeRegion("1 UN", 10, 120, 80, 14),
      makeRegion("5,99", 250, 119, 70, 14),
      makeRegion("5,99", 360, 140, 70, 14),
      makeRegion("Produto B", 10, 160, 200, 16),
      makeRegion("0,582 KG", 10, 180, 80, 14),
      makeRegion("15,90", 250, 179, 70, 14),
      makeRegion("9,25", 360, 200, 70, 14),
      makeRegion("Produto C", 10, 220, 200, 16),
      makeRegion("Qtde. Total de Itens", 10, 300, 200, 14),
      makeRegion("Valor a Pagar R$: 15,24", 10, 330, 220, 14),
    ];

    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(3);
    expect(result.items[0].effectiveValue).toBe(5.99);
    expect(result.items[1].effectiveValue).toBe(9.25);
    expect(result.items[1].originalTotal).not.toBe(5.99);
    expect(result.items[2].effectiveValue).toBeNull();
    expect(result.items[2].originalTotal).toBeNull();
  });

  it("keeps Drogal four-item effective values", () => {
    const result = buildPaddleReceiptResult(drogalRegions);

    expect(result.items).toHaveLength(4);
    expect(result.items.map((i) => i.effectiveValue)).toEqual([
      114.32, 35.6, 18.8, 16.34,
    ]);
  });

  it("keeps Fonseca without monetary regression", () => {
    const result = buildPaddleReceiptResult(fonsecaRegions);

    expect(result.items).toHaveLength(21);
    expect(
      result.items.filter((i) => i.effectiveValue !== null),
    ).toHaveLength(14);
    expect(result.sumKnownItemValues).toBeCloseTo(67.54, 2);
  });
});

describe("buildPaddleReceiptResult real fixture hortifruti", () => {
  const result = buildPaddleReceiptResult(hortifrutiRegions);

  it("extracts the 11 products in printed order", () => {
    expect(result.items).toHaveLength(11);
    expect(result.items.map((i) => i.description)).toEqual([
      "ABACAXI PEROLA UN",
      "ALHO GRANEL K9",
      "MANGA PALMER KS",
      "UUA TOMPSON 500G",
      "UUA UITORIA 500G",
      "MAMAO FORHOSA k9",
      "MELAO AMARELO kg",
      "CEBOLA kg",
      "CABOTIA kg",
      "BETERRABA kg",
      "MELANCIA INTEIRA kg",
    ]);
  });

  it("extracts quantities and units", () => {
    expect(result.items.map((i) => i.quantity)).toEqual([
      1, 0.582, 0.658, 1, 1, 1.146, 2.105, 0.497, 0.696, 0.411, 2.623,
    ]);
    expect(result.items.map((i) => i.unit)).toEqual([
      "UN", "KG", "KG", "UN", "UN", "KG", "KG", "KG", "KG", "KG", "KG",
    ]);
  });

  it("keeps unit prices null when fragments lack an adjacent partner", () => {
    expect(result.items.map((i) => i.unitPrice)).toEqual([
      5.99, 15.9, null, null, null, 11.97, null, null, null, null, 1.99,
    ]);
  });

  it("associates each originalTotal to its own row", () => {
    expect(result.items.map((i) => i.originalTotal)).toEqual([
      5.99, 9.25, 3.94, 7.99, 8.99, 13.72, 12.61, 2.93, null, 1.64, 5.22,
    ]);
  });

  it("selects the correct effectiveValue on all 11 items", () => {
    expect(result.items.map((i) => i.effectiveValue)).toEqual([
      5.99, 9.25, 3.94, 7.99, 8.99, 13.72, 12.61, 2.93, null, 1.64, 5.22,
    ]);
  });

  it("joins adjacent fragments but keeps unsupported ones null (CABOTIA)", () => {
    expect(result.items[5].unitPrice).toBe(11.97);
    expect(result.items[7].originalTotal).toBe(2.93);
    expect(result.items[7].effectiveValue).toBe(2.93);
    expect(result.items[8].originalTotal).toBeNull();
    expect(result.items[8].effectiveValue).toBeNull();
  });

  it("reads receiptTotal 74.36 from Valor a Pagar", () => {
    expect(result.receiptTotal).toBeCloseTo(74.36, 2);
  });

  it("sums known item values from effectiveValues only", () => {
    expect(result.sumKnownItemValues).toBeCloseTo(72.28, 2);
  });

  it("keeps differenceFromReceiptTotal as sum minus receiptTotal", () => {
    expect(result.differenceFromReceiptTotal).not.toBeNull();
    expect(result.differenceFromReceiptTotal).toBeCloseTo(-2.08, 2);
  });
});

describe("buildPaddleReceiptResult rules", () => {
  it("receiptTotal comes from the printed marker, never from item sum", () => {
    const regions = [
      {
        text: "PRODUTO QTD VALOR",
        confidence: 0.99,
        bbox: [
          [10, 100],
          [210, 100],
          [210, 112],
          [10, 112],
        ],
      },
      {
        text: "PRODUTO TESTE",
        confidence: 0.99,
        bbox: [
          [10, 150],
          [210, 150],
          [210, 162],
          [10, 162],
        ],
      },
      {
        text: "1UN",
        confidence: 0.99,
        bbox: [
          [300, 150],
          [340, 150],
          [340, 162],
          [300, 162],
        ],
      },
      {
        text: "10,00",
        confidence: 0.99,
        bbox: [
          [380, 150],
          [420, 150],
          [420, 162],
          [380, 162],
        ],
      },
      {
        text: "Qtde. Total de Itens",
        confidence: 0.99,
        bbox: [
          [10, 250],
          [210, 250],
          [210, 262],
          [10, 262],
        ],
      },
      {
        text: "Valor a Pagar R$: 99,99",
        confidence: 0.99,
        bbox: [
          [10, 300],
          [260, 300],
          [260, 312],
          [10, 312],
        ],
      },
    ];

    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].effectiveValue).toBe(10);
    expect(result.sumKnownItemValues).toBe(10);
    expect(result.receiptTotal).toBe(99.99);
    expect(result.differenceFromReceiptTotal).toBe(-89.99);
  });

  it("warns when no items and no total are found", () => {
    const result = buildPaddleReceiptResult([
      {
        text: "Documento qualquer",
        confidence: 0.9,
        bbox: [
          [10, 10],
          [110, 10],
          [110, 22],
          [10, 22],
        ],
      },
    ]);

    expect(result.items).toHaveLength(0);
    expect(result.receiptTotal).toBeNull();
    expect(result.warnings).toContain("Nenhum item identificado");
    expect(result.warnings).toContain("Total do cupom não identificado");
    expect(result.sumKnownItemValues).toBe(0);
    expect(result.differenceFromReceiptTotal).toBeNull();
  });

  it("prefers Valor a Pagar over Valor Total", () => {
    const result = buildPaddleReceiptResult([
      {
        text: "PRODUTO QTD VALOR",
        confidence: 0.99,
        bbox: [
          [10, 100],
          [210, 100],
          [210, 112],
          [10, 112],
        ],
      },
      {
        text: "PRODUTO TESTE",
        confidence: 0.99,
        bbox: [
          [10, 150],
          [210, 150],
          [210, 162],
          [10, 162],
        ],
      },
      {
        text: "1UN 10,00",
        confidence: 0.99,
        bbox: [
          [300, 150],
          [420, 150],
          [420, 162],
          [300, 162],
        ],
      },
      {
        text: "Valor Total R$: 50,00",
        confidence: 0.99,
        bbox: [
          [10, 220],
          [210, 220],
          [210, 232],
          [10, 232],
        ],
      },
      {
        text: "Valor a Pagar R$: 40,00",
        confidence: 0.99,
        bbox: [
          [10, 250],
          [230, 250],
          [230, 262],
          [10, 262],
        ],
      },
      {
        text: "Qtde. Total de Itens",
        confidence: 0.99,
        bbox: [
          [10, 300],
          [210, 300],
          [210, 312],
          [10, 312],
        ],
      },
    ]);

    expect(result.receiptTotal).toBe(40);
  });
});
