import { describe, expect, it } from "vitest";
import { buildPaddleReceiptResult } from "./receiptResult";
import type { PaddleOcrRegion } from "./types";
import { fonseca12062Regions } from "./__fixtures__/fonseca-12062.fixture";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";
import { padaria734Regions } from "./__fixtures__/padaria-734.fixture";
import { tradicao15914Regions } from "./__fixtures__/tradicao-15914.fixture";
import { queijo6651Regions } from "./__fixtures__/queijo-6651.fixture";
import { drogaRaia3239Regions } from "./__fixtures__/droga-raia-3239.fixture";
import { combustivel22358Regions } from "./__fixtures__/combustivel-22358.fixture";

type FixtureCase = {
  name: string;
  regions: PaddleOcrRegion[];
  expected: {
    itemCount: number;
    receiptTotal: number;
    sumKnown?: number;
    difference?: number;
    items?: Array<{
      descriptionIncludes?: string | string[];
      descriptionNotStartsWith?: string;
      descriptionExcludes?: string | string[];
      quantity?: number | null;
      unit?: string | null;
      unitPrice?: number | null;
      originalTotal?: number | null;
      explicitFinalValue?: number | null;
      effectiveValue?: number | null;
      quantityAnyOf?: Array<{ quantity: number | null; unit: string | null }>;
    }>;
  };
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const cases: FixtureCase[] = [
  {
    name: "fonseca-8838",
    regions: fonsecaRegions,
    expected: {
      itemCount: 21,
      receiptTotal: 88.38,
      sumKnown: 67.54,
      difference: -20.84,
      items: [
        {
          descriptionIncludes: "BANANA NANICA",
          quantity: 1.246,
          unit: "KG",
          unitPrice: 6.98,
          originalTotal: 8.7,
          explicitFinalValue: null,
          effectiveValue: 8.7,
        },
        {
          descriptionIncludes: "SORUETE NESILE",
          quantity: 1,
          unit: null,
          unitPrice: null,
          originalTotal: 24.99,
          explicitFinalValue: null,
          effectiveValue: 24.99,
        },
        {
          descriptionIncludes: "REFRESCO EM PO TANG 18GR MORANG0",
          quantity: 1,
          unit: "UN",
          unitPrice: 1.29,
          originalTotal: 1.29,
          effectiveValue: 1.29,
        },
        {
          descriptionIncludes: "REFRESCO EM PO TANG 18GR MARACUJA",
          quantity: 1,
          unit: "UN",
          unitPrice: 1.29,
          originalTotal: 1.29,
          effectiveValue: 1.29,
        },
        {
          descriptionIncludes: "REFRESCO EM PO MID 20GR CAJU",
          quantity: 1,
          unit: "UN",
          unitPrice: 0.99,
          originalTotal: 0.99,
          effectiveValue: 0.99,
        },
        {
          descriptionIncludes: "REFRESCO EK PO MID 20GR CAJU",
          quantity: 1,
          unit: "UN",
          unitPrice: 0.99,
          originalTotal: 0.99,
          effectiveValue: 0.99,
        },
        {
          descriptionIncludes: "REFRESCO EM PO H1D 20GR ABACAXI",
          quantity: 1,
          unit: "UN",
          unitPrice: 0.99,
          originalTotal: 0.99,
          effectiveValue: 0.99,
        },
        {
          descriptionIncludes: "REFRESCO EN PO NID 20GR ABACAXI 1UN",
          quantity: 1,
          unit: "UN",
          unitPrice: 0.99,
          originalTotal: 0.99,
          effectiveValue: 0.99,
        },
        {
          descriptionIncludes: "REFRESCO EN PO MID 203R MANGA",
          quantity: 1,
          unit: "UN",
          unitPrice: 0.99,
          originalTotal: 0.99,
          effectiveValue: 0.99,
        },
        {
          descriptionIncludes: "UUA BRANCA AUTUNCRISP 500GR",
          quantity: 1,
          unit: "UN",
          unitPrice: 9.99,
          originalTotal: 9.99,
          effectiveValue: 9.99,
        },
        {
          descriptionIncludes: "LEITE COND PIRACANJUBA 395G TP SEMI DESN",
          quantity: 1,
          unit: "UN",
          unitPrice: 5.99,
          originalTotal: 5.99,
          explicitFinalValue: 4.99,
          effectiveValue: 4.99,
        },
        {
          descriptionIncludes: "PIRACANJUBA 395G TP SENI DESH",
          descriptionNotStartsWith: "7898215152002",
          quantity: 1,
          unit: "UN",
          unitPrice: 5.99,
          originalTotal: 5.99,
          explicitFinalValue: 4.99,
          effectiveValue: 4.99,
        },
        {
          descriptionIncludes: "CREME LEITE OHT ITALAC 200G TP",
          quantity: null,
          unit: null,
          unitPrice: null,
          originalTotal: null,
          explicitFinalValue: null,
          effectiveValue: null,
        },
        {
          descriptionIncludes: "CREME LEITE UHI IIALAC 200G TP",
          quantity: 1,
          unit: "UN",
          unitPrice: null,
          originalTotal: null,
          explicitFinalValue: null,
          effectiveValue: null,
        },
        {
          descriptionIncludes: "CREME LEITE UHT ITALAC 200G TP",
          quantity: null,
          unit: null,
          unitPrice: null,
          originalTotal: null,
          explicitFinalValue: null,
          effectiveValue: null,
        },
        {
          descriptionIncludes: "PA0 FORMA UISCONTI 400G",
          quantity: 1,
          unit: "UN",
          unitPrice: null,
          originalTotal: null,
          explicitFinalValue: null,
          effectiveValue: null,
        },
        {
          descriptionIncludes: "BETERRABA kg",
          quantity: 0.742,
          unit: "KG",
          unitPrice: null,
          originalTotal: null,
          effectiveValue: null,
        },
        {
          descriptionIncludes: "CEBOLA Kg",
          quantity: 0.464,
          unit: "KG",
          unitPrice: 6.79,
          originalTotal: null,
          effectiveValue: null,
        },
        {
          descriptionIncludes: "MANGA TOMY kg",
          quantity: 0.402,
          unit: "KG",
          unitPrice: 5.99,
          originalTotal: null,
          effectiveValue: null,
        },
        {
          descriptionIncludes: "REPOLHO VERDE kg",
          quantity: 1.127,
          unit: "KG",
          unitPrice: null,
          originalTotal: 3.37,
          effectiveValue: 3.37,
        },
        {
          descriptionIncludes: "BALA DR0PS H6LLS 28GR 8UFPFRRY",
          quantity: 1,
          unit: "UN",
          unitPrice: 2.98,
          originalTotal: 2.98,
          effectiveValue: 2.98,
        },
      ],
    },
  },
  {
    name: "fonseca-12062",
    regions: fonseca12062Regions,
    expected: {
      itemCount: 10,
      receiptTotal: 120.62,
      items: [
        {
          descriptionIncludes: "PANCETA",
          quantity: 0.332,
          unit: "KG",
          unitPrice: 26.49,
          originalTotal: 8.79,
          effectiveValue: 8.79,
        },
        {
          descriptionIncludes: "ANTARCTICA",
          quantity: 1,
          unit: "UN",
          unitPrice: 2.29,
          originalTotal: 2.29,
          effectiveValue: 2.29,
        },
        {
          descriptionIncludes: "BRAHMA",
          quantity: 1,
          unit: "UN",
          unitPrice: 2.35,
          originalTotal: 2.35,
          effectiveValue: 2.35,
        },
        {
          descriptionIncludes: "BRAHMA",
          quantity: 1,
          unit: "UN",
          unitPrice: 2.35,
          originalTotal: 2.35,
          effectiveValue: 2.35,
        },
        {
          descriptionIncludes: "BRAHMA",
          quantity: 1,
          unit: "UN",
          unitPrice: 2.35,
          originalTotal: 2.35,
          effectiveValue: 2.35,
        },
        {
          descriptionIncludes: "BRAHMA",
          quantity: 1,
          unit: "UN",
          unitPrice: 2.35,
          originalTotal: 2.35,
          effectiveValue: 2.35,
        },
        {
          descriptionIncludes: "BRAHMA",
          quantity: 1,
          unit: "UN",
          unitPrice: 2.35,
          originalTotal: 2.35,
          effectiveValue: 2.35,
        },
        {
          descriptionIncludes: "LING",
          quantity: 0.436,
          unit: "KG",
          unitPrice: 23.9,
          originalTotal: 10.42,
          effectiveValue: 10.42,
        },
        {
          descriptionIncludes: "FRALDINHA",
          quantity: 1.406,
          unit: "KG",
          unitPrice: 47.99,
          originalTotal: 67.47,
          effectiveValue: 67.47,
        },
        {
          descriptionIncludes: "CARVAO",
          quantity: 1,
          unit: "UN",
          unitPrice: 19.9,
          originalTotal: 19.9,
          effectiveValue: 19.9,
        },
      ],
    },
  },
  {
    name: "padaria-734",
    regions: padaria734Regions,
    expected: {
      itemCount: 2,
      receiptTotal: 7.34,
      items: [
        {
          descriptionIncludes: "PA0 FRANCES",
          descriptionNotStartsWith: "3917",
          quantity: 0.178,
          unit: "KG",
          unitPrice: 21.99,
          originalTotal: 3.91,
          effectiveValue: 3.91,
        },
        {
          descriptionIncludes: "PALITO MEIA CURA",
          descriptionNotStartsWith: "3335",
          quantity: 0.098,
          unit: "KG",
          unitPrice: 35,
          originalTotal: 3.43,
          effectiveValue: 3.43,
        },
      ],
    },
  },
  {
    name: "tradicao-15914",
    regions: tradicao15914Regions,
    expected: {
      itemCount: 7,
      receiptTotal: 159.14,
      items: [
        {
          descriptionIncludes: "PEITO FRANGO",
          descriptionNotStartsWith: "3205",
          quantity: 0.812,
          unit: "KG",
          unitPrice: 21.9,
          originalTotal: 17.78,
          effectiveValue: 17.78,
        },
        {
          descriptionIncludes: "FIGADO BOVINO",
          descriptionNotStartsWith: "3090",
          quantity: 0.438,
          unit: "KG",
          unitPrice: 22.9,
          originalTotal: 10.03,
          effectiveValue: 10.03,
        },
        {
          descriptionIncludes: "COXAD",
          descriptionNotStartsWith: "3069",
          quantity: 0.494,
          unit: "KG",
          unitPrice: 49.9,
          originalTotal: 24.65,
          effectiveValue: 24.65,
        },
        {
          descriptionIncludes: "CORACAO DE FRANGO",
          descriptionNotStartsWith: "3049",
          quantity: 0.47,
          unit: "KG",
          unitPrice: 44.9,
          originalTotal: 21.1,
          effectiveValue: 21.1,
        },
        {
          descriptionIncludes: "ACEM",
          descriptionNotStartsWith: "3002",
          quantity: 2.026,
          unit: "KG",
          unitPrice: 33.9,
          originalTotal: 68.68,
          effectiveValue: 68.68,
        },
        {
          descriptionIncludes: "COXA SOBRECOXA",
          descriptionNotStartsWith: "3064",
          quantity: 0.598,
          unit: "KG",
          unitPrice: 18.4,
          originalTotal: 11,
          effectiveValue: 11,
        },
        {
          descriptionIncludes: "BROCOLIS",
          descriptionNotStartsWith: "1047",
          quantity: 1,
          unit: "UN",
          unitPrice: 5.9,
          originalTotal: 5.9,
          effectiveValue: 5.9,
        },
      ],
    },
  },
  {
    name: "queijo-6651",
    regions: queijo6651Regions,
    expected: {
      itemCount: 4,
      receiptTotal: 66.51,
      items: [
        {
          descriptionIncludes: ["QUEIJO MEIA CURA", "FARTURA KG"],
          quantity: 0.124,
          unit: "KG",
          unitPrice: 47.9,
          originalTotal: 5.94,
          effectiveValue: 5.94,
        },
        {
          descriptionIncludes: ["MUSSARELA VALE", "ORIZ FATIADA KG"],
          quantity: 0.4281,
          unit: "KG",
          unitPrice: 39.9,
          originalTotal: 17.08,
          effectiveValue: 17.08,
        },
        {
          descriptionIncludes: ["COB CHIIPSHOW", "LEITE HARALD", "1,010KG"],
          quantityAnyOf: [
            { quantity: null, unit: null },
            { quantity: 1, unit: "UN" },
          ],
          unitPrice: 28.99,
          originalTotal: 28.99,
          effectiveValue: 28.99,
        },
        {
          descriptionIncludes: ["MASSALASANHA", "FRESCA ZIZAS 500GR"],
          quantity: 1,
          unit: "UN",
          unitPrice: 14.5,
          originalTotal: 14.5,
          effectiveValue: 14.5,
        },
      ],
    },
  },
  {
    name: "droga-raia-3239",
    regions: drogaRaia3239Regions,
    expected: {
      itemCount: 3,
      receiptTotal: 32.39,
      items: [
        {
          descriptionIncludes: ["NEEDS GAZE NA0 ADE 10U", "5,29"],
          descriptionNotStartsWith: "000303169",
          quantity: 1,
          unit: "UN",
          unitPrice: 5.29,
          originalTotal: 5.29,
          effectiveValue: 5.29,
        },
        {
          descriptionIncludes: "NEEDS SOL FISIO 500ML",
          unitPrice: 10.99,
          originalTotal: 10.99,
          effectiveValue: 10.99,
        },
        {
          descriptionIncludes: ["TOBRAMICIN 3MG", "5ML"],
          descriptionNotStartsWith: "000500520",
          unitPrice: 24.78,
          originalTotal: 24.78,
          explicitFinalValue: 16.11,
          effectiveValue: 16.11,
        },
      ],
    },
  },
  {
    name: "combustivel-22358",
    regions: combustivel22358Regions,
    expected: {
      itemCount: 1,
      receiptTotal: 223.58,
      items: [
        {
          descriptionIncludes: "GASOLINA COMUM",
          descriptionExcludes: "QTDE UN",
          quantity: 33.421,
          unit: "L",
          unitPrice: 6.69,
          originalTotal: 223.58,
          effectiveValue: 223.58,
        },
      ],
    },
  },
];

describe("real runtime receipts (production pipeline)", () => {
  for (const { name, regions, expected } of cases) {
    it(`${name}: item count and receipt total`, () => {
      const result = buildPaddleReceiptResult(regions);
      const itemsWithValue = result.items.filter(
        (item) => item.effectiveValue !== null,
      );

      const summary =
        `\n[${name}] items=${result.items.length} ` +
        `withValue=${itemsWithValue.length} ` +
        `receiptTotal=${result.receiptTotal} ` +
        `sum=${result.sumKnownItemValues} ` +
        `diff=${result.differenceFromReceiptTotal}\n` +
        result.items
          .map(
            (item, index) =>
              `  #${index + 1} ` +
              `desc=${JSON.stringify(item.description)} ` +
              `qty=${item.quantity} unit=${item.unit} ` +
              `up=${item.unitPrice} tot=${item.originalTotal} ` +
              `por=${item.explicitFinalValue} eff=${item.effectiveValue} ` +
              `cls=${item.classification}`,
          )
          .join("\n") +
        `\n  warnings=${JSON.stringify(result.warnings)}`;

      // eslint-disable-next-line no-console
      console.log(summary);

      expect(result.items.length, summary).toBe(expected.itemCount);
      expect(result.receiptTotal, summary).toBe(expected.receiptTotal);
      const expectedSum = expected.sumKnown ?? expected.receiptTotal;
      const expectedDiff = expected.difference ?? 0;
      expect(result.sumKnownItemValues, summary).toBe(expectedSum);
      expect(result.differenceFromReceiptTotal, summary).toBe(expectedDiff);

      if (expected.items) {
        for (const [index, spec] of expected.items.entries()) {
          const item = result.items[index];
          expect(item, summary).toBeDefined();
          if (spec.descriptionIncludes !== undefined) {
            const needles = Array.isArray(spec.descriptionIncludes)
              ? spec.descriptionIncludes
              : [spec.descriptionIncludes];
            for (const needle of needles) {
              expect(item.description ?? "", summary).toContain(needle);
            }
          }
          if (spec.descriptionNotStartsWith !== undefined) {
            expect(
              (item.description ?? "").startsWith(
                spec.descriptionNotStartsWith,
              ),
              `${summary}\n  #${index + 1} description must not start with ${spec.descriptionNotStartsWith}`,
            ).toBe(false);
          }
          if (spec.descriptionExcludes !== undefined) {
            const banned = Array.isArray(spec.descriptionExcludes)
              ? spec.descriptionExcludes
              : [spec.descriptionExcludes];
            for (const token of banned) {
              expect(
                (item.description ?? "").includes(token),
                `${summary}\n  #${index + 1} description must not contain ${token}`,
              ).toBe(false);
            }
          }
          if (spec.quantityAnyOf !== undefined) {
            const matched = spec.quantityAnyOf.some(
              (alt) =>
                item.quantity === alt.quantity && item.unit === alt.unit,
            );
            expect(
              matched,
              `${summary}\n  #${index + 1} qty=${item.quantity} unit=${item.unit} did not match any allowed pair`,
            ).toBe(true);
          } else {
            if (spec.quantity !== undefined) {
              expect(item.quantity, summary).toBe(spec.quantity);
            }
            if (spec.unit !== undefined) {
              expect(item.unit, summary).toBe(spec.unit);
            }
          }
          if (spec.unitPrice !== undefined) {
            expect(item.unitPrice, summary).toBe(spec.unitPrice);
          }
          if (spec.originalTotal !== undefined) {
            expect(item.originalTotal, summary).toBe(spec.originalTotal);
          }
          if (spec.explicitFinalValue !== undefined) {
            expect(item.explicitFinalValue, summary).toBe(
              spec.explicitFinalValue,
            );
          }
          if (spec.effectiveValue !== undefined) {
            expect(item.effectiveValue, summary).toBe(spec.effectiveValue);
          }
        }
      }

      const sumCheck = round2(
        result.items.reduce(
          (acc, item) =>
            acc + (item.effectiveValue !== null ? item.effectiveValue : 0),
          0,
        ),
      );
      expect(sumCheck, summary).toBe(expectedSum);
    });
  }
});
