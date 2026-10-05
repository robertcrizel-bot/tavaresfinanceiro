import { describe, expect, it } from "vitest";
import {
  buildPaddleReceiptResult,
  selectEffectiveValue,
} from "./receiptResult";
import { paddleToParsedReceipt } from "./paddleToParsedReceipt";
import { drogalRegions } from "./__fixtures__/drogal.fixture";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";
import { hortifrutiRegions } from "./__fixtures__/hortifruti.fixture";
import { padaria1716FragmentedRegions } from "./__fixtures__/padaria-1716-fragmented.fixture";

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

describe("buildPaddleReceiptResult fragmented padaria fixture", () => {
  it("recovers the four printed product blocks after the degraded summary marker", () => {
    const result = buildPaddleReceiptResult(padaria1716FragmentedRegions);

    expect(result.items).toHaveLength(4);
    expect(result.items.map((item) => item.description)).toEqual([
      "SALAME AURORA ITALIAND",
      "QUEL0 MUSSARELA AVIAS",
      "RANCES",
      "QUEIJO",
    ]);
    expect(result.items.map((item) => item.quantity)).toEqual([0.06, 0.043, 0.264, null]);
    expect(result.items.map((item) => item.unitPrice)).toEqual([115, 79, 21.99, 35]);
    expect(result.items.map((item) => item.originalTotal)).toEqual([6.9, 3.4, null, null]);
    expect(result.items.map((item) => item.effectiveValue)).toEqual([6.9, 3.4, null, null]);
  });

  it("recovers 17,16 only from the explicit adjacent OCR fragments", () => {
    const result = buildPaddleReceiptResult(padaria1716FragmentedRegions);

    expect(result.receiptTotal).toBe(17.16);
  });
});

describe("buildPaddleReceiptResult fragmented explicit total", () => {
  function region(text: string, x: number, y: number, width: number, height = 20) {
    return {
      text,
      confidence: 0.99,
      bbox: [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ] as [number, number][],
    };
  }

  const marker = () => [
    region("VALOR", 10, 300, 60),
    region("A PAGAR R$", 75, 300, 110),
  ];

  it("joins one aligned integer-plus-cents pair after an explicit marker", () => {
    const result = buildPaddleReceiptResult([
      ...marker(),
      region("17", 300, 300, 24),
      region(",16", 328, 300, 32),
    ]);

    expect(result.receiptTotal).toBe(17.16);
  });

  it("does not join the same fragments without an explicit total marker", () => {
    const result = buildPaddleReceiptResult([
      region("REFERENCIA", 10, 300, 100),
      region("17", 300, 300, 24),
      region(",16", 328, 300, 32),
    ]);

    expect(result.receiptTotal).toBeNull();
  });

  it("does not join distant fragments", () => {
    const result = buildPaddleReceiptResult([
      ...marker(),
      region("17", 300, 300, 24),
      region(",16", 380, 300, 32),
    ]);

    expect(result.receiptTotal).toBeNull();
  });

  it("does not join fragments assigned to different spatial lines", () => {
    const result = buildPaddleReceiptResult([
      ...marker(),
      region("17", 300, 300, 24),
      region(",16", 328, 350, 32),
    ]);

    expect(result.receiptTotal).toBeNull();
  });

  it("does not use a fragmented pair on a distant line after the marker", () => {
    const result = buildPaddleReceiptResult([
      ...marker(),
      region("17", 300, 350, 24),
      region(",16", 328, 350, 32),
    ]);

    expect(result.receiptTotal).toBeNull();
  });

  it("does not join fragments with another region between them", () => {
    const result = buildPaddleReceiptResult([
      ...marker(),
      region("17", 300, 300, 24),
      region("X", 326, 300, 10),
      region(",16", 338, 300, 32),
    ]);

    expect(result.receiptTotal).toBeNull();
  });

  it("abstains when more than one compatible pair follows the marker", () => {
    const result = buildPaddleReceiptResult([
      ...marker(),
      region("17", 300, 300, 24),
      region(",16", 328, 300, 32),
      region("20", 370, 300, 24),
      region(",00", 398, 300, 32),
    ]);

    expect(result.receiptTotal).toBeNull();
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

describe("buildPaddleReceiptResult OCR-degraded total labels", () => {
  function region(text: string, x: number, y: number, width: number, height = 30) {
    return {
      text,
      confidence: 0.95,
      bbox: [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ] as [number, number][],
    };
  }

  it('reads "VALOR TOTAL R$ 65,67" with comma decimals', () => {
    const result = buildPaddleReceiptResult([
      region("FONSECA SUPERMERCADOS LTDA", 120, 300, 300),
      region("VALOR TOTAL R$ 65,67", 151, 1239, 300),
    ]);

    expect(result.receiptTotal).toBeCloseTo(65.67, 2);
  });

  it('reads "VALOR TOTAL R$ 65.67" with dot decimals', () => {
    const result = buildPaddleReceiptResult([
      region("FONSECA SUPERMERCADOS LTDA", 120, 300, 300),
      region("VALOR TOTAL R$ 65.67", 151, 1239, 300),
    ]);

    expect(result.receiptTotal).toBeCloseTo(65.67, 2);
  });

  it('reads the OCR-degraded "UALOR TOTAL R$ 65.67" into amount 65.67', () => {
    const result = buildPaddleReceiptResult([
      region("FONSECA SUPERMERCADOS LTDA", 120, 300, 300),
      region("UALOR TOTAL R$ 65.67", 151, 1239, 300),
    ]);

    expect(result.receiptTotal).toBeCloseTo(65.67, 2);

    const parsed = paddleToParsedReceipt(result);
    expect(parsed.amount).toBeCloseTo(65.67, 2);
    expect(parsed.low_confidence_fields).not.toContain("amount");
  });

  it("reads label and value from separate regions of the same line", () => {
    const result = buildPaddleReceiptResult([
      region("FONSECA SUPERMERCADOS LTDA", 120, 300, 300),
      region("CARTEIRA DIGITAL", 151, 964, 200),
      region("65,67", 784, 977, 68),
      region("UALOR TOTAL", 151, 1239, 125),
      region("R$ 65.67", 467, 1257, 97, 23),
    ]);

    expect(result.receiptTotal).toBeCloseTo(65.67, 2);
  });

  it("never picks the PIX payment row as the total", () => {
    const withPix = buildPaddleReceiptResult([
      region("FONSECA SUPERMERCADOS LTDA", 120, 300, 300),
      region("CARTEIRA DIGITAL", 151, 964, 200),
      region("65,67", 784, 977, 68),
      region("UALOR TOTAL", 151, 1239, 125),
      region("R$ 65.67", 467, 1257, 97, 23),
      region("VENDA PIX COMPRA", 127, 1386, 226),
      region("12,05", 784, 1390, 68, 26),
    ]);
    expect(withPix.receiptTotal).toBeCloseTo(65.67, 2);
    expect(withPix.receiptTotal).not.toBeCloseTo(12.05, 2);

    const pixOnly = buildPaddleReceiptResult([
      region("FONSECA SUPERMERCADOS LTDA", 120, 300, 300),
      region("VENDA PIX COMPRA", 127, 1386, 226),
      region("12,05", 784, 1390, 68, 26),
    ]);
    expect(pixOnly.receiptTotal).toBeNull();
  });
});

describe("propagate repeated item prices by exact EAN", () => {
  const CREAM = "CREME LEITE UHT ITALAC 200G TP";
  const CREAM_EAN = "7898080640222";
  const OTHER_EAN = "7891132082469";

  function region(text: string, x: number, y: number, w: number, h: number) {
    return {
      text,
      confidence: 0.95,
      bbox: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ] as [number, number][],
    };
  }

  type Row = {
    y: number;
    ean?: string;
    description?: string;
    price?: string;
    discount?: string;
  };

  function build(rows: Row[]) {
    const regions = [region("PRODUTO QTD VALOR", 10, 60, 240, 12)];
    for (const row of rows) {
      const ean = row.ean ?? CREAM_EAN;
      const description = row.description ?? CREAM;
      regions.push(region(`${ean} ${description}`, 10, row.y, 340, 16));
      regions.push(region("1UN", 400, row.y + 2, 40, 12));
      if (row.price) regions.push(region(row.price, 460, row.y + 2, 50, 12));
      if (row.discount) regions.push(region(row.discount, 10, row.y + 25, 240, 12));
    }
    const lastY = rows[rows.length - 1].y;
    regions.push(region("Qtde. Total de Itens", 10, lastY + 60, 240, 12));
    return buildPaddleReceiptResult(regions);
  }

  it("fills 2,75 / 2,75 / 2,75 for three consecutive rows with the same EAN", () => {
    const result = build([
      { y: 150, price: "2,75" },
      { y: 195 },
      { y: 240 },
    ]);

    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      2.75, 2.75, 2.75,
    ]);
    expect(result.items.map((item) => item.originalTotal)).toEqual([
      2.75, 2.75, 2.75,
    ]);
    expect(result.items.every((item) => item.explicitFinalValue === null)).toBe(
      true,
    );
  });

  it("does not fill missing prices when two explicit prices differ", () => {
    const result = build([
      { y: 150, price: "2,75" },
      { y: 195, price: "3,50" },
      { y: 240 },
    ]);

    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      2.75, 3.5, null,
    ]);
  });

  it("does not propagate across different EANs even with the same description", () => {
    const result = build([
      { y: 150, price: "2,75" },
      { y: 195, ean: OTHER_EAN },
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      2.75, null,
    ]);
  });

  it("does not propagate when the same EAN is not consecutive", () => {
    const result = build([
      { y: 150, price: "2,75" },
      { y: 195, ean: OTHER_EAN, description: "REFRESCO EM PO TANG 18GR" },
      { y: 240 },
    ]);

    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      2.75, null, null,
    ]);
  });

  it("never invents a price when no item of the group has a known value", () => {
    const result = build([{ y: 150 }, { y: 195 }, { y: 240 }]);

    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      null, null, null,
    ]);
    expect(result.sumKnownItemValues).toBe(0);
  });

  it("keeps an item's own discount instead of overwriting it", () => {
    const result = build([
      { y: 150, price: "2,75" },
      { y: 195, discount: "Por 2,50" },
      { y: 240 },
    ]);

    expect(result.items).toHaveLength(3);
    expect(result.items[1].explicitFinalValue).toBe(2.5);
    expect(result.items[1].effectiveValue).toBe(2.5);
    expect(result.items[1].originalTotal).toBeNull();
    expect(result.items[0].effectiveValue).toBe(2.75);
    expect(result.items[2].effectiveValue).toBeNull();
  });

  it("keeps the three Fonseca cream rows without inventing a price", () => {
    const result = buildPaddleReceiptResult(fonsecaRegions);
    const cream = result.items.filter((item) =>
      (item.description ?? "").includes("CREME LEITE"),
    );

    expect(cream).toHaveLength(3);
    expect(cream.every((item) => item.effectiveValue === null)).toBe(true);
    expect(result.receiptTotal).toBeCloseTo(88.38, 2);
    expect(result.sumKnownItemValues).toBeCloseTo(67.54, 2);
  });
});
