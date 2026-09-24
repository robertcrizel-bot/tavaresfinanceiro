import { spatialGroup } from "./spatialGrouper";
import type { GridLine } from "./spatialGrouper";
import { detectItemBlocks } from "./itemBlockDetector";
import { extractItemBlock } from "./itemBlockExtractor";
import type { ItemBlockClassification } from "./itemBlockDetector";
import type { PaddleOcrRegion } from "./types";

export interface PaddleReceiptItem {
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  originalTotal: number | null;
  explicitFinalValue: number | null;
  effectiveValue: number | null;
  classification: ItemBlockClassification;
}

export interface PaddleReceiptResult {
  merchant: string | null;
  cnpj: string | null;
  date: string | null;
  time: string | null;
  receiptTotal: number | null;
  items: PaddleReceiptItem[];
  warnings: string[];
  sumKnownItemValues: number;
  differenceFromReceiptTotal: number | null;
}

const TOTAL_MARKER_PATTERNS: RegExp[] = [
  /valor\s*[àa]\s*pagar/i,
  /valor\s*pago/i,
  /valor\s*total/i,
  /total\s*geral/i,
];

const EXCLUDE_TOTAL_LINE_RE =
  /(?:descont|troco|subtotal|sub\s*total|incidentes|unit[aá]rio|pre[çc]o\s*unit|vlr?\s*unit)/i;
const MONEY_TOKEN_RE = /(?:\d{1,3}(?:\.\d{3})+,\d{2}|\d+[.,]\d{2})/;

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseBrlToken(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.]/g, "");
  if (!cleaned) return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    const lastDot = cleaned.lastIndexOf(".");
    const afterDot = cleaned.slice(lastDot + 1);
    normalized = afterDot.length <= 2 ? cleaned : cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? roundCents(value) : null;
}

function lineText(line: GridLine | undefined): string {
  if (!line) return "";
  return line.regions.map((region) => region.text).join(" ");
}

function moneyAfterIndex(text: string, fromIndex: number): number | null {
  const rest = text.slice(fromIndex);
  const match = rest.match(MONEY_TOKEN_RE);
  if (!match) return null;
  return parseBrlToken(match[0]);
}

function extractReceiptTotal(
  lines: GridLine[],
  areaEnd: number | null,
): number | null {
  const searchStart = areaEnd !== null ? areaEnd + 1 : 0;

  const scan = (from: number): number | null => {
    for (const marker of TOTAL_MARKER_PATTERNS) {
      for (let i = from; i < lines.length; i++) {
        const text = lineText(lines[i]);
        if (!marker.test(text)) continue;
        if (EXCLUDE_TOTAL_LINE_RE.test(text)) continue;
        const markerMatch = marker.exec(text);
        const startIndex = markerMatch ? markerMatch.index : 0;
        const sameLine = moneyAfterIndex(text, startIndex);
        if (sameLine !== null) return sameLine;
        const nextLine = lineText(lines[i + 1]).trim();
        if (nextLine && !EXCLUDE_TOTAL_LINE_RE.test(nextLine)) {
          const nextValue = moneyAfterIndex(nextLine, 0);
          if (nextValue !== null) return nextValue;
        }
      }
    }
    return null;
  };

  if (searchStart < lines.length) {
    const afterItems = scan(searchStart);
    if (afterItems !== null) return afterItems;
  }
  return scan(0);
}

function extractMerchant(text: string): string | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 8)) {
    if (/\b(?:ltda|eireli|s\.?a\.?|epp|me)\b/i.test(line)) {
      const cleaned = line.replace(/[^\w\s\u00C0-\u024F.,&-]/g, "").trim();
      if (cleaned.length > 3) return cleaned;
    }
  }

  for (const line of lines.slice(0, 6)) {
    if (
      /[A-Z]{4,}/.test(line) &&
      !/\d{4,}/.test(line) &&
      !/R\$/.test(line) &&
      line.length > 3 &&
      line.length < 80
    ) {
      const cleaned = line.replace(/[^\w\s\u00C0-\u024F.,&-]/g, "").trim();
      if (cleaned.length > 3) return cleaned;
    }
  }

  return null;
}

function extractCnpj(text: string): string | null {
  const match = text.match(
    /(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-\s]?(\d{2})/,
  );
  if (!match) return null;
  const digits = `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`;
  if (digits.length !== 14) return null;
  return `${match[1]}.${match[2]}.${match[3]}/${match[4]}-${match[5]}`;
}

function extractDate(text: string): string | null {
  const full = text.match(/\b(\d{2})[-/.](\d{2})[-/.](\d{4})\b/);
  if (full) {
    const day = Number(full[1]);
    const month = Number(full[2]);
    const year = Number(full[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
      return `${full[3]}-${full[2]}-${full[1]}`;
    }
  }

  const short = text.match(/\b(\d{2})[-/.](\d{2})[-/.](\d{2})\b/);
  if (short) {
    const day = Number(short[1]);
    const month = Number(short[2]);
    const year = 2000 + Number(short[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${short[2]}-${short[1]}`;
    }
  }

  return null;
}

function validTime(hour: number, minute: number, second: number): string | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function extractTime(text: string): string | null {
  const withSeconds = text.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (withSeconds) {
    const value = validTime(
      Number(withSeconds[1]),
      Number(withSeconds[2]),
      Number(withSeconds[3]),
    );
    if (value) return value;
  }

  const hourMinute = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hourMinute) {
    const value = validTime(
      Number(hourMinute[1]),
      Number(hourMinute[2]),
      0,
    );
    if (value) return value;
  }

  const ocrVariant = text.match(/\b(\d{1,2})\.(\d{2}):(\d{2})\b/);
  if (ocrVariant) {
    const value = validTime(
      Number(ocrVariant[1]),
      Number(ocrVariant[2]),
      Number(ocrVariant[3]),
    );
    if (value) return value;
  }

  return null;
}

export function selectEffectiveValue(
  explicitFinalValue: number | null,
  originalTotal: number | null,
): number | null {
  if (explicitFinalValue !== null) return explicitFinalValue;
  if (originalTotal !== null) return originalTotal;
  return null;
}

function buildText(lines: GridLine[]): string {
  return lines.map((line) => lineText(line)).join("\n");
}

function buildWarnings(
  items: PaddleReceiptItem[],
  receiptTotal: number | null,
): string[] {
  const warnings: string[] = [];

  if (items.length === 0) {
    warnings.push("Nenhum item identificado");
  }
  if (receiptTotal === null) {
    warnings.push("Total do cupom não identificado");
  }

  items.forEach((item, index) => {
    const label = item.description
      ? `Item ${index + 1} (${item.description})`
      : `Item ${index + 1}`;
    if (item.effectiveValue === null) {
      warnings.push(`${label} sem effectiveValue`);
    }
    if (item.classification === "ambiguous") {
      warnings.push(`${label} ambíguo`);
    }
  });

  return warnings;
}

export function buildPaddleReceiptResult(
  regions: PaddleOcrRegion[],
): PaddleReceiptResult {
  const { lines } = spatialGroup(regions);
  const text = buildText(lines);
  const { blocks, areaEnd } = detectItemBlocks(lines);

  const items: PaddleReceiptItem[] = blocks.map((block) => {
    const extracted = extractItemBlock(lines, block);
    return {
      description: extracted.description,
      quantity: extracted.quantity,
      unit: extracted.unit,
      unitPrice: extracted.unitPrice,
      originalTotal: extracted.originalTotal,
      explicitFinalValue: extracted.explicitFinalValue,
      effectiveValue: selectEffectiveValue(
        extracted.explicitFinalValue,
        extracted.originalTotal,
      ),
      classification: extracted.classification,
    };
  });

  const receiptTotal = extractReceiptTotal(lines, areaEnd);

  const sumCents = items.reduce(
    (acc, item) =>
      acc + (item.effectiveValue !== null ? Math.round(item.effectiveValue * 100) : 0),
    0,
  );
  const sumKnownItemValues = sumCents / 100;
  const differenceFromReceiptTotal =
    receiptTotal !== null
      ? roundCents(sumKnownItemValues - receiptTotal)
      : null;

  return {
    merchant: extractMerchant(text),
    cnpj: extractCnpj(text),
    date: extractDate(text),
    time: extractTime(text),
    receiptTotal,
    items,
    warnings: buildWarnings(items, receiptTotal),
    sumKnownItemValues,
    differenceFromReceiptTotal,
  };
}
