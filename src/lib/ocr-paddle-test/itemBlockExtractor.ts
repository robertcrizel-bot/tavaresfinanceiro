import type { GridLine } from "./spatialGrouper";
import {
  detectHeaderCategories,
  isHeaderLine,
} from "./spatialGrouper";
import type {
  ItemBlockClassification,
  ItemLineBlock,
} from "./itemBlockDetector";

export interface ExtractedItemBlock {
  lineIndices: number[];
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  originalTotal: number | null;
  explicitFinalValue: number | null;
  classification: ItemBlockClassification;
  signals?: string[];
}

export interface ItemBlockPriceDebug {
  moneyCandidates: Array<{
    lineIndex: number;
    cx: number;
    cy: number;
    value: number;
  }>;
  discountZoneLineIndices: number[] | null;
  discountZoneCandidates: number[];
  discountZoneDiscountValue: number | null;
  discountZonePercentValue: number | null;
}

export function createItemBlockPriceDebug(): ItemBlockPriceDebug {
  return {
    moneyCandidates: [],
    discountZoneLineIndices: null,
    discountZoneCandidates: [],
    discountZoneDiscountValue: null,
    discountZonePercentValue: null,
  };
}

const COMPLEMENT_PREFIX_RE = /^(?:de|por|desconto)\b/i;
const LEADING_CODE_RE = /^\d+\s+/;

const ALLOWED_UNITS = new Set(["UN", "KG", "G", "ML", "LT", "L"]);

const QTY_UNIT_RE =
  /(?<!\d)(\d+(?:[.,]\d+)?)(?:\s*[Xx]\s*|\s*)(UN|KG|ML|LT|L|G)X?(?![A-Za-z])/i;
const QTY_ONLY_RE = /^(\d+(?:[.,]\d+)?)([A-Za-z]{1,3})(?=\s|$)/;
const DESCRIPTION_TRAILING_QTY_RE =
  /(?:^|\s)(\d+)(?:\s*[Xx]\s*|\s*)(UN)$/i;

const MONEY_FULL_RE = /^\d+[.,]\d{2}$/;
const COLON_MONEY_FULL_RE = /^\d{1,3}:\d{2}(?!\d)$/;
const MONEY_TOKEN_G_RE = /\d+[.,]\d{2}|\d{1,3}:\d{2}(?!\d)/g;
const POR_RE = /\bpor\s+(\d+[.,]\d{2})\b/i;
const DE_RE = /\bde\s+(\d+[.,]\d{2})\b/gi;
const HEIGHT_GUARD_FACTOR = 2;
const BAND_GAP_RATIO = 0.4;
const DESCONTO_WORD = "desconto";

type ItemRegion = GridLine["regions"][number];

function hasSignificantAlphabetic(text: string): boolean {
  return text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "").length >= 3;
}

function hasMoneyText(text: string): boolean {
  return /\d+[.,]\d{2}(?!\d)|\d{1,3}:\d{2}(?!\d)/.test(text);
}

function isComplementText(text: string): boolean {
  return COMPLEMENT_PREFIX_RE.test(text.trim());
}

function isComplementLine(line: GridLine): boolean {
  return line.regions.some((region) => isComplementText(region.text));
}

function isPercentText(text: string): boolean {
  return text.includes("%");
}

function extractPercentValue(text: string): number | null {
  const matches = [...text.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*%/g)];
  if (matches.length !== 1) return null;
  const value = Number(matches[0][1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function isNegativeMoneyText(text: string): boolean {
  const trimmed = text.trim();
  return /^[-−]/.test(trimmed) || /^r\s*\$\s*[-−]/i.test(trimmed);
}

/**
 * Absolute monetary discount of a promotional line (never a percentage).
 * "R$-0,86" wins over a percentage written in the same text, so a token like
 * "-30,18%" is treated as a percentage only, never as R$ 30,18.
 */
function extractNegativeMoneyValue(text: string): number | null {
  const trimmed = text.trim();
  const withPrefix = trimmed.match(
    /r\s*\$\s*[-−]\s*(\d+[.,]\d{2})(?!\d)/i,
  );
  if (withPrefix) return parseMoney(withPrefix[1]);
  if (isPercentText(trimmed)) return null;
  const match = trimmed.match(/[-−]\s*(?:r\s*\$\s*)?(\d+[.,]\d{2})(?!\d)/i);
  return match ? parseMoney(match[1]) : null;
}

function stripLeadingCode(text: string): string {
  const match = text.match(LEADING_CODE_RE);
  if (!match) return text;
  const rest = text.slice(match[0].length).trim();
  if (hasSignificantAlphabetic(rest)) return rest;
  return text;
}

function lineIsSecondaryHeader(line: GridLine): boolean {
  const texts = line.regions
    .map((region) => region.text.trim())
    .filter(Boolean);
  if (texts.length === 0) return false;
  if (!isHeaderLine(texts)) return false;
  return !texts.some((text) => hasMoneyText(text));
}

function receiptHasCodeColumn(lines: GridLine[]): boolean {
  for (const line of lines) {
    const texts = line.regions.map((region) => region.text.trim());
    if (!isHeaderLine(texts)) continue;
    if (texts.some((text) => detectHeaderCategories(text).includes("code"))) {
      return true;
    }
  }
  return false;
}

function stripStructuralLeadingCodes(
  text: string,
  allowMulti: boolean,
): string {
  let result = stripLeadingCode(text);
  if (!allowMulti) return result;
  for (;;) {
    const next = stripLeadingCode(result);
    if (next === result) return result;
    result = next;
  }
}

function normalizeUnit(raw: string): string | null {
  const unit = raw.toUpperCase();
  return ALLOWED_UNITS.has(unit) ? unit : null;
}

function parseQuantity(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseMoney(raw: string): number | null {
  const text = raw.trim();
  if (COLON_MONEY_FULL_RE.test(text)) {
    const value = Number(text.replace(":", "."));
    return Number.isFinite(value) ? value : null;
  }
  if (!MONEY_FULL_RE.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function extractMoneyValue(text: string): number | null {
  const trimmed = text.trim();
  if (COLON_MONEY_FULL_RE.test(trimmed)) return parseMoney(trimmed);
  if (MONEY_FULL_RE.test(trimmed)) return parseMoney(trimmed);
  const ocr = trimmed.match(/^(\d+[.,]\d{2})\d$/);
  if (ocr) return parseMoney(ocr[1]);
  const startMoney = trimmed.match(/^(\d+[.,]\d{2})(?!\d)/);
  if (startMoney) return parseMoney(startMoney[1]);
  return null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

interface DescriptionPick {
  text: string | null;
  region: ItemRegion | null;
  pieces: ItemRegion[];
}

const QTY_LIKE_ONLY_RE = /^[\d\sXx]{0,6}[A-Za-z]{1,3}$/;
const PACK_TOKEN_RE =
  /^\d+(?:[.,]\d+)?\s*(?:UN|KG|ML|LT|L|G)X?$/i;
const DESCRIPTION_JOIN_GAP = 40;

function pickDescription(
  lines: GridLine[],
  block: ItemLineBlock,
): DescriptionPick {
  const candidates: {
    lineIndex: number;
    cx: number;
    text: string;
    region: ItemRegion;
  }[] = [];
  let primary: { cx: number; region: ItemRegion } | null = null;

  let bandMinX = Infinity;
  let bandMaxX = -Infinity;
  for (const lineIndex of block.lineIndices) {
    const line = lines[lineIndex];
    if (!line || isComplementLine(line)) continue;
    if (lineIsSecondaryHeader(line)) continue;
    for (const region of line.regions) {
      if (block.excludedRegions?.has(region)) continue;
      const text = region.text.trim();
      if (!text) continue;
      if (!hasSignificantAlphabetic(text)) continue;
      if (MONEY_FULL_RE.test(text)) continue;
      if (QTY_LIKE_ONLY_RE.test(text)) continue;
      if (/\d+[.,]\d{2}/.test(text)) {
        const alphaLen = text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "").length;
        if (alphaLen < 6) continue;
      }
      bandMinX = Math.min(bandMinX, region.minX);
      bandMaxX = Math.max(bandMaxX, region.maxX);
    }
  }
  const hasBand = Number.isFinite(bandMinX) && Number.isFinite(bandMaxX);

  const hasCodeColumn = receiptHasCodeColumn(lines);

  for (const lineIndex of block.lineIndices) {
    const line = lines[lineIndex];
    if (!line || isComplementLine(line)) continue;
    if (lineIsSecondaryHeader(line)) continue;
    const lineHasMoney = line.regions.some((region) =>
      hasMoneyText(region.text),
    );

    for (const region of line.regions) {
      if (block.excludedRegions?.has(region)) continue;
      const text = region.text.trim();
      if (!text) continue;
      if (isComplementText(text)) continue;
      const isPackToken = PACK_TOKEN_RE.test(text);
      if (!hasSignificantAlphabetic(text) && !isPackToken) continue;
      if (MONEY_FULL_RE.test(text)) continue;
      if (isPackToken && lineHasMoney) continue;
      if (isPackToken) {
        if (!hasBand) continue;
        if (region.minX < bandMinX || region.maxX > bandMaxX) continue;
      }
      if (/\d+[.,]\d{2}/.test(text)) {
        if (isPackToken) {
          if (lineHasMoney) continue;
        } else {
          const alphaLen = text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "").length;
          if (alphaLen < 6) continue;
        }
      }
      if (QTY_LIKE_ONLY_RE.test(text) && !isPackToken) continue;
      candidates.push({ lineIndex, cx: region.cx, text, region });
      if (primary === null || region.cx < primary.cx) {
        primary = { cx: region.cx, region };
      }
    }
  }

  if (primary === null) {
    return { text: null, region: null, pieces: [] };
  }

  candidates.sort(
    (a, b) => a.lineIndex - b.lineIndex || a.cx - b.cx,
  );
  const pieces: ItemRegion[] = [];
  let rightEdge = -Infinity;
  let lastIndex = -Infinity;
  for (const candidate of candidates) {
    if (pieces.length === 0) {
      pieces.push(candidate.region);
      rightEdge = candidate.region.maxX;
      lastIndex = candidate.lineIndex;
      continue;
    }
    const sameLine = candidate.lineIndex === lastIndex;
    const closeEnough = candidate.region.minX <= rightEdge + DESCRIPTION_JOIN_GAP;
    if (!sameLine || closeEnough) {
      pieces.push(candidate.region);
      rightEdge = Math.max(rightEdge, candidate.region.maxX);
      lastIndex = candidate.lineIndex;
    }
  }

  const text = pieces
    .map((piece) => stripStructuralLeadingCodes(piece.text.trim(), hasCodeColumn))
    .filter(Boolean)
    .join(" ");

  return { text, region: primary.region, pieces };
}

function collectStructuralRegions(
  lines: GridLine[],
  block: ItemLineBlock,
  excluded: ReadonlySet<ItemRegion>,
): ItemRegion[] {
  const regions: ItemRegion[] = [];
  const seen = new Set<ItemRegion>();
  for (const lineIndex of block.lineIndices) {
    const line = lines[lineIndex];
    if (!line) continue;
    for (const region of line.regions) {
      if (excluded.has(region)) continue;
      if (block.excludedRegions?.has(region)) continue;
      if (!region.text.trim()) continue;
      if (seen.has(region)) continue;
      seen.add(region);
      regions.push(region);
    }
  }
  if (block.structuralExtras) {
    for (const region of block.structuralExtras) {
      if (excluded.has(region)) continue;
      if (block.excludedRegions?.has(region)) continue;
      if (!region.text.trim()) continue;
      if (seen.has(region)) continue;
      seen.add(region);
      regions.push(region);
    }
  }
  return regions;
}

function extractQuantityUnit(
  lines: GridLine[],
  block: ItemLineBlock,
  descriptionPick: DescriptionPick,
): { quantity: number | null; unit: string | null } {
  const excluded = new Set(descriptionPick.pieces);
  if (descriptionPick.region) excluded.add(descriptionPick.region);
  const regions = collectStructuralRegions(lines, block, excluded);
  const description = descriptionPick.text;

  for (const region of regions) {
    const match = QTY_UNIT_RE.exec(region.text);
    if (!match) continue;
    const before = region.text.slice(0, match.index ?? 0);
    if (/[a-zA-Z\u00C0-\u024F]{2,}/.test(before)) continue;
    const quantity = parseQuantity(match[1]);
    const unit = normalizeUnit(match[2]);
    if (quantity !== null && unit !== null) {
      return { quantity, unit };
    }
  }

  for (const region of regions) {
    const match = QTY_ONLY_RE.exec(region.text.trim());
    if (!match) continue;
    const quantity = parseQuantity(match[1]);
    if (quantity !== null) {
      return { quantity, unit: normalizeUnit(match[2]) };
    }
  }

  if (description) {
    const structuralFromDescription = QTY_UNIT_RE.exec(description);
    if (structuralFromDescription) {
      const quantity = parseQuantity(structuralFromDescription[1]);
      const unit = normalizeUnit(structuralFromDescription[2]);
      if (
        quantity !== null &&
        unit !== null &&
        (unit === "UN" || unit === "UND")
      ) {
        return { quantity, unit };
      }
    }
    const match = DESCRIPTION_TRAILING_QTY_RE.exec(description);
    if (match) {
      const quantity = parseQuantity(match[1]);
      const unit = normalizeUnit(match[2]);
      if (quantity !== null && unit !== null) {
        return { quantity, unit };
      }
    }
  }

  return { quantity: null, unit: null };
}

function extractSuffixUnitPrice(text: string): number | null {
  const matches = [...text.matchAll(new RegExp(QTY_UNIT_RE.source, "gi"))];
  let best: number | null = null;

  for (const match of matches) {
    const remainder = text.slice((match.index ?? 0) + match[0].length);
    const moneyMatch = remainder.match(/\d+[.,]\d{2}|\d{1,3}:\d{2}(?!\d)/);
    if (!moneyMatch) continue;
    const value = parseMoney(moneyMatch[0]);
    if (value !== null) best = value;
  }

  return best;
}

function extractPorValue(text: string): number | null {
  const match = POR_RE.exec(text);
  if (!match) return null;
  return parseMoney(match[1]);
}

function extractDeValue(text: string): number | null {
  DE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DE_RE.exec(text)) !== null) {
    const before = text.slice(0, match.index).trimEnd();
    const prevWordMatch = before.match(/[\p{L}]+$/u);
    const prevWord = prevWordMatch ? prevWordMatch[0].toLowerCase() : "";
    if (prevWord === DESCONTO_WORD) continue;
    const value = parseMoney(match[1]);
    if (value !== null) return value;
  }
  return null;
}

interface MoneyCandidate {
  cx: number;
  cy: number;
  value: number;
  height: number;
  onDescriptionLine: boolean;
}

function collectMoneyCandidates(
  lines: GridLine[],
  block: ItemLineBlock,
  excludedLines?: ReadonlySet<number>,
  debug?: ItemBlockPriceDebug,
): MoneyCandidate[] {
  const heights: number[] = [];
  const raw: MoneyCandidate[] = [];
  const descriptionLineIndex = block.lineIndices[0];

  for (const lineIndex of block.lineIndices) {
    if (excludedLines?.has(lineIndex)) continue;
    const line = lines[lineIndex];
    if (!line || isComplementLine(line)) continue;
    const parsed = new Set<ItemRegion>();
    for (const region of line.regions) {
      if (isPercentText(region.text)) continue;
      if (isNegativeMoneyText(region.text)) continue;
      heights.push(region.height);
      const value = extractMoneyValue(region.text);
      if (value === null) continue;
      parsed.add(region);
      debug?.moneyCandidates.push({
        lineIndex,
        cx: region.cx,
        cy: region.cy,
        value,
      });
      raw.push({
        cx: region.cx,
        cy: region.cy,
        value,
        height: region.height,
        onDescriptionLine: lineIndex === descriptionLineIndex,
      });
    }
    const sorted = [...line.regions].sort((a, b) => a.minX - b.minX);
    for (let i = 0; i < sorted.length - 1; i++) {
      const left = sorted[i];
      const right = sorted[i + 1];
      if (parsed.has(left) || parsed.has(right)) continue;
      if (isPercentText(left.text) || isPercentText(right.text)) continue;
      if (isNegativeMoneyText(left.text) || isNegativeMoneyText(right.text)) {
        continue;
      }
      const joined = tryJoinAdjacentMoney(left, right, line);
      if (joined === null) continue;
      debug?.moneyCandidates.push({
        lineIndex,
        cx: (left.cx + right.cx) / 2,
        cy: (left.cy + right.cy) / 2,
        value: joined,
      });
      raw.push({
        cx: (left.cx + right.cx) / 2,
        cy: (left.cy + right.cy) / 2,
        value: joined,
        height: Math.min(left.height, right.height),
        onDescriptionLine: lineIndex === descriptionLineIndex,
      });
      i++;
    }
  }

  if (raw.length === 0) return [];
  const maxHeight = median(heights) * HEIGHT_GUARD_FACTOR;
  return raw
    .filter((candidate) => candidate.height <= maxHeight)
    .sort((a, b) => a.cx - b.cx);
}

function preferOffDescriptionLine(candidates: MoneyCandidate[]): {
  candidates: MoneyCandidate[];
  droppedDescriptionLineMoney: boolean;
} {
  const nonDescription = candidates.filter(
    (candidate) => !candidate.onDescriptionLine,
  );
  if (
    nonDescription.length > 0 &&
    nonDescription.length < candidates.length
  ) {
    return { candidates: nonDescription, droppedDescriptionLineMoney: true };
  }
  return { candidates, droppedDescriptionLineMoney: false };
}

function pickTotalCandidate(candidates: MoneyCandidate[]): MoneyCandidate {
  return candidates.reduce((best, candidate) => {
    if (candidate.cy > best.cy) return candidate;
    if (candidate.cy === best.cy && candidate.cx > best.cx) return candidate;
    return best;
  });
}

function extractMoniesAfterQty(text: string): {
  unitPrice: number | null;
  total: number | null;
  count: number;
} {
  const matches = [...text.matchAll(new RegExp(QTY_UNIT_RE.source, "gi"))];
  let best: { unitPrice: number | null; total: number | null; count: number } =
    { unitPrice: null, total: null, count: 0 };

  for (const match of matches) {
    const remainder = text.slice((match.index ?? 0) + match[0].length);
    const tokens = remainder.match(MONEY_TOKEN_G_RE) ?? [];
    const values: number[] = [];
    for (const token of tokens) {
      const value = parseMoney(token);
      if (value !== null) values.push(value);
    }
    if (values.length === 0) continue;
    best = {
      unitPrice: values[0],
      total: values[values.length - 1],
      count: values.length,
    };
  }

  return best;
}

function findSuffixAnchor(
  lines: GridLine[],
  block: ItemLineBlock,
  descriptionPick: DescriptionPick,
  excludedLines?: ReadonlySet<number>,
): MoneyCandidate | null {
  const excluded = new Set(descriptionPick.pieces);
  if (descriptionPick.region) excluded.add(descriptionPick.region);
  const descriptionLineIndex = block.lineIndices[0];
  for (const lineIndex of block.lineIndices) {
    if (excludedLines?.has(lineIndex)) continue;
    const line = lines[lineIndex];
    if (!line || isComplementLine(line)) continue;
    for (const region of line.regions) {
      if (excluded.has(region)) continue;
      const value = extractSuffixUnitPrice(region.text);
      if (value === null) continue;
      return {
        cx: region.cx,
        cy: region.cy,
        value,
        height: region.height,
        onDescriptionLine: lineIndex === descriptionLineIndex,
      };
    }
  }
  for (const lineIndex of block.lineIndices) {
    if (excludedLines?.has(lineIndex)) continue;
    const line = lines[lineIndex];
    if (!line || isComplementLine(line)) continue;
    for (const region of line.regions) {
      const value = extractSuffixUnitPrice(region.text);
      if (value === null) continue;
      return {
        cx: region.cx,
        cy: region.cy,
        value,
        height: region.height,
        onDescriptionLine: lineIndex === descriptionLineIndex,
      };
    }
  }
  return null;
}

const COLUMN_GROUP_GAP = 40;

function classifySingleCandidateColumn(
  lines: GridLine[],
  candidate: MoneyCandidate,
): "unit" | "total" {
  const cxs: number[] = [];
  for (const line of lines) {
    if (isComplementLine(line)) continue;
    for (const region of line.regions) {
      if (extractMoneyValue(region.text) === null) continue;
      cxs.push(region.cx);
    }
  }
  cxs.sort((a, b) => a - b);

  const groups: number[][] = [];
  for (const cx of cxs) {
    const last = groups[groups.length - 1];
    if (last && cx - last[last.length - 1] <= COLUMN_GROUP_GAP) {
      last.push(cx);
    } else {
      groups.push([cx]);
    }
  }
  if (groups.length < 2) return "total";

  const totalGroup = groups[groups.length - 1];
  const unitGroup = groups[groups.length - 2];
  if (totalGroup.length < 2 || unitGroup.length < 2) return "total";

  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const unitCenter = mean(unitGroup);
  const totalCenter = mean(totalGroup);
  return Math.abs(candidate.cx - unitCenter) <
    Math.abs(candidate.cx - totalCenter)
    ? "unit"
    : "total";
}

function deriveMonetaryBands(
  lines: GridLine[],
  block: ItemLineBlock,
  suffixAnchor: MoneyCandidate | null,
  excludedLines?: ReadonlySet<number>,
  debug?: ItemBlockPriceDebug,
): { unitPrice: number | null; originalTotal: number | null } {
  const collected = collectMoneyCandidates(lines, block, excludedLines, debug);
  const { candidates, droppedDescriptionLineMoney } =
    preferOffDescriptionLine(collected);
  if (candidates.length === 0) {
    return { unitPrice: null, originalTotal: null };
  }

  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (droppedDescriptionLineMoney) {
      return { unitPrice: candidate.value, originalTotal: null };
    }
    if (suffixAnchor === null) {
      if (classifySingleCandidateColumn(lines, candidate) === "unit") {
        return { unitPrice: candidate.value, originalTotal: null };
      }
      return { unitPrice: null, originalTotal: candidate.value };
    }
    if (candidate.cx > suffixAnchor.cx) {
      return { unitPrice: null, originalTotal: candidate.value };
    }
    return { unitPrice: null, originalTotal: null };
  }

  const firstCx = candidates[0].cx;
  const lastCx = candidates[candidates.length - 1].cx;
  const extent = lastCx - firstCx;

  let gapIndex = 0;
  let maxGap = -Infinity;
  for (let i = 0; i < candidates.length - 1; i++) {
    const gap = candidates[i + 1].cx - candidates[i].cx;
    if (gap > maxGap) {
      maxGap = gap;
      gapIndex = i;
    }
  }

  const leftCount = gapIndex + 1;
  const rightCount = candidates.length - leftCount;
  if (
    leftCount < 1 ||
    rightCount < 1 ||
    !(extent > 0 && maxGap >= BAND_GAP_RATIO * extent)
  ) {
    return { unitPrice: null, originalTotal: null };
  }

  const left = candidates.slice(0, leftCount);
  const right = candidates.slice(leftCount);
  const totalCandidate = pickTotalCandidate(right);
  return {
    unitPrice: left[0].value,
    originalTotal: totalCandidate.value,
  };
}

function extractMarkers(
  lines: GridLine[],
  block: ItemLineBlock,
): { por: number | null; de: number | null } {
  let por: number | null = null;
  let de: number | null = null;

  for (const lineIndex of block.lineIndices) {
    const line = lines[lineIndex];
    if (!line) continue;
    for (const region of line.regions) {
      if (por === null) {
        por = extractPorValue(region.text);
      }
      if (de === null) {
        de = extractDeValue(region.text);
      }
      if (por !== null && de !== null) {
        return { por, de };
      }
    }
  }

  return { por, de };
}

function isDescontoLine(line: GridLine): boolean {
  return line.regions.some((region) =>
    /^desconto\b/i.test(region.text.trim()),
  );
}

/**
 * Promotional block attached to the item above it:
 *
 *   [original price]
 *   DESCONTO
 *   [percentage]      (optional)
 *   [negative amount] (optional)
 *   [final positive price]
 *
 * Returns the grid lines that belong to the discount block (so their money
 * never leaks into unit price / original total), plus the recognized final
 * price and discount amount for validation.
 */
interface DiscountZone {
  lineIndices: Set<number>;
  candidates: number[];
  discountValue: number | null;
  percentValue: number | null;
}

function joinLinesText(lines: GridLine[], lineIndices: number[]): string {
  return lineIndices
    .map((lineIndex) => {
      const line = lines[lineIndex];
      if (!line) return "";
      return [...line.regions]
        .sort((a, b) => a.minX - b.minX)
        .map((region) => region.text)
        .join(" ");
    })
    .filter(Boolean)
    .join(" ");
}

function findDiscountZone(
  lines: GridLine[],
  block: ItemLineBlock,
): DiscountZone | null {
  const indices = block.lineIndices;
  let start = -1;
  for (let k = 0; k < indices.length; k++) {
    const line = lines[indices[k]];
    if (line && isDescontoLine(line)) {
      start = k;
      break;
    }
  }
  if (start < 0) return null;

  const zone: number[] = [start];
  for (let k = start + 1; k < indices.length; k++) {
    const line = lines[indices[k]];
    if (!line) continue;
    if (isComplementLine(line)) {
      zone.push(k);
      continue;
    }
    const startsNewProduct = line.regions.some((region) => {
      const text = region.text;
      if (isComplementText(text)) return false;
      return text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "").length >= 4;
    });
    if (startsNewProduct) break;
    zone.push(k);
  }

  const zoneIds: number[] = zone.map((k) => indices[k]);
  // The block detector can close the block right before the absolute discount
  // amount when the item has no recognized price at all. Pull those trailing
  // discount/final lines back into the zone, stopping at the first line that
  // looks like another product or a summary/payment label.
  if (zone[zone.length - 1] === indices.length - 1) {
    const lastBlockIndex = indices[indices.length - 1];
    let tail = 0;
    for (
      let lineIndex = lastBlockIndex + 1;
      lineIndex < lines.length && tail < 3;
      lineIndex++
    ) {
      const line = lines[lineIndex];
      if (!line) break;
      if (isComplementLine(line)) {
        zoneIds.push(lineIndex);
        tail += 1;
        continue;
      }
      const looksLikeProduct = line.regions.some((region) => {
        const text = region.text;
        if (isComplementText(text)) return false;
        return text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "").length >= 4;
      });
      if (looksLikeProduct) break;
      zoneIds.push(lineIndex);
      tail += 1;
    }
  }

  const lineIndices = new Set<number>(zoneIds);

  let order = 0;
  let lastMarkerOrder = -1;
  let discountValue: number | null = null;
  let percentValue: number | null = null;
  const candidates: { order: number; value: number }[] = [];

  for (const lineIndex of zoneIds) {
    const line = lines[lineIndex];
    if (!line) continue;
    const regions = [...line.regions].sort((a, b) => a.minX - b.minX);
    const kinds: Array<"marker" | "money" | "other"> = [];

    for (const region of regions) {
      const text = region.text.trim();
      let kind: "marker" | "money" | "other" = "other";
      if (isPercentText(text) || isNegativeMoneyText(text)) {
        kind = "marker";
        if (isPercentText(text)) {
          const percent = extractPercentValue(text);
          if (percent !== null) percentValue = percent;
        }
        const negative = extractNegativeMoneyValue(text);
        if (negative !== null) discountValue = negative;
      } else if (!isComplementText(text)) {
        const value = extractMoneyValue(text);
        if (value !== null && value > 0) {
          kind = "money";
          candidates.push({ order, value });
        }
      }
      if (kind === "marker") lastMarkerOrder = order;
      kinds.push(kind);
      order += 1;
    }

    for (let i = 0; i < regions.length - 1; i++) {
      if (kinds[i] !== "other" || kinds[i + 1] !== "other") continue;
      const joined = tryJoinAdjacentMoney(regions[i], regions[i + 1], line);
      if (joined === null) continue;
      candidates.push({ order, value: joined });
      order += 1;
      i++;
    }
  }

  // The percentage is often fragmented across regions ("-30,18" plus "%") or
  // printed on the product line instead of the discount line, which no single
  // region can express. Read the joined text of the zone so both numbers of the
  // discount math come from the same, complete string. The negative amount is
  // re-read from the zone text *without* its percentage tokens, otherwise a
  // "%"-less fragment like "-30,18" would be taken for the absolute discount.
  const zoneText = joinLinesText(lines, zoneIds);
  const joinedZonePercent = extractPercentValue(zoneText);
  if (joinedZonePercent !== null) percentValue = joinedZonePercent;
  if (percentValue === null) {
    const blockIds = [
      ...new Set([...block.lineIndices, ...zoneIds]),
    ].sort((a, b) => a - b);
    percentValue = extractPercentValue(joinLinesText(lines, blockIds));
  }
  const zoneTextWithoutPercent = zoneText.replace(
    /\d+(?:[.,]\d{1,2})?\s*%/g,
    " ",
  );
  const joinedZoneDiscount = extractNegativeMoneyValue(zoneTextWithoutPercent);
  if (joinedZoneDiscount !== null) {
    discountValue = joinedZoneDiscount;
  } else if (percentValue !== null) {
    // Everything negative left in the zone is the percentage itself.
    discountValue = null;
  }

  const afterMarker = candidates.filter(
    (candidate) => candidate.order > lastMarkerOrder,
  );

  return {
    lineIndices,
    candidates: afterMarker.map((candidate) => candidate.value),
    discountValue,
    percentValue,
  };
}

function resolveDiscountFinalValue(
  zone: DiscountZone | null,
  originalTotal: number | null,
): number | null {
  if (!zone || zone.candidates.length === 0) return null;
  if (zone.candidates.length === 1) return zone.candidates[0];
  if (originalTotal !== null && zone.discountValue !== null) {
    const consistent = zone.candidates.find(
      (value) =>
        Math.abs(originalTotal - zone.discountValue - value) < 0.011,
    );
    if (consistent !== undefined) return consistent;
  }
  return zone.candidates[zone.candidates.length - 1];
}

const MAX_INFERRED_ORIGINAL_PRICE = 10000;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

interface InferredDiscountPrices {
  original: number;
  final: number;
}

/**
 * Rebuilds the promotional prices when the OCR lost every price of the item
 * but captured both the discount percentage and the absolute discount:
 *
 *   original ≈ desconto / (percentual / 100)
 *   final    ≈ original - desconto
 *
 * e.g. 0,86 / 30,18% ≈ 2,85 -> 2,85 - 0,86 = 1,99.
 *
 * Only reads values from the item's own discount zone, requires both numbers,
 * never contradicts an already recognized original total and rejects results
 * that are not plausible item prices.
 */
function inferPricesFromDiscountMath(
  zone: DiscountZone | null,
  originalTotal: number | null,
): InferredDiscountPrices | null {
  if (!zone) return null;
  const percent = zone.percentValue;
  const discount = zone.discountValue;
  if (percent === null || discount === null) return null;
  if (!(percent > 0 && percent < 100)) return null;
  if (!(discount > 0)) return null;

  const derivedOriginal = roundMoney(discount / (percent / 100));
  if (!Number.isFinite(derivedOriginal)) return null;
  if (derivedOriginal < 0.01 || derivedOriginal > MAX_INFERRED_ORIGINAL_PRICE) {
    return null;
  }

  let original = derivedOriginal;
  if (originalTotal !== null) {
    const tolerance = Math.max(0.02, derivedOriginal * 0.005);
    if (Math.abs(originalTotal - derivedOriginal) > tolerance) return null;
    original = originalTotal;
  }

  const final = roundMoney(original - discount);
  if (!Number.isFinite(final) || final < 0.01) return null;
  if (final >= original) return null;
  return { original, final };
}

function tryJoinAdjacentMoney(
  left: ItemRegion,
  right: ItemRegion,
  line: GridLine,
): number | null {
  const leftText = left.text.trim();
  const separatorMatch = leftText.match(/^(\d+)[.,]$/);
  const impliedMatch = leftText.match(/^(\d{1,2})$/);
  if (!separatorMatch && !impliedMatch) return null;
  const leftDigits = separatorMatch ? separatorMatch[1] : impliedMatch![1];

  const rightMatch = right.text.trim().match(/^(\d{2})$/);
  if (!rightMatch) return null;

  const gap = right.minX - left.maxX;
  const maxGap = separatorMatch ? 30 : 15;
  if (gap < -20 || gap > maxGap) return null;

  const cyDiff = Math.abs(left.cy - right.cy);
  if (cyDiff > 15) return null;

  const minH = Math.min(left.height, right.height);
  const maxH = Math.max(left.height, right.height);
  if (minH <= 0 || maxH / minH > 2.5) return null;

  if (gap > 0) {
    for (const region of line.regions) {
      if (region === left || region === right) continue;
      if (
        region.minX >= left.maxX &&
        region.maxX <= right.minX &&
        Math.abs(region.cy - left.cy) < 20
      ) {
        return null;
      }
    }
  }

  const combined = `${leftDigits},${rightMatch[1]}`;
  const value = parseMoney(combined);
  if (value === null || value <= 0) return null;
  return value;
}

function extractMonetary(
  lines: GridLine[],
  block: ItemLineBlock,
  descriptionPick: DescriptionPick,
  debug?: ItemBlockPriceDebug,
): {
  unitPrice: number | null;
  originalTotal: number | null;
  explicitFinalValue: number | null;
} {
  const zone = findDiscountZone(lines, block);
  const zoneLines = zone?.lineIndices;
  if (debug) {
    debug.discountZoneLineIndices = zone ? [...zone.lineIndices] : null;
    debug.discountZoneCandidates = zone ? [...zone.candidates] : [];
    debug.discountZoneDiscountValue = zone?.discountValue ?? null;
    debug.discountZonePercentValue = zone?.percentValue ?? null;
  }
  const suffixAnchor = findSuffixAnchor(
    lines,
    block,
    descriptionPick,
    zoneLines,
  );
  const suffixUnitPrice = suffixAnchor ? suffixAnchor.value : null;
  const bands = deriveMonetaryBands(
    lines,
    block,
    suffixAnchor,
    zoneLines,
    debug,
  );
  const { por, de } = extractMarkers(lines, block);

  let suffixTotal: number | null = null;
  for (const lineIndex of block.lineIndices) {
    if (zoneLines?.has(lineIndex)) continue;
    const line = lines[lineIndex];
    if (!line || isComplementLine(line)) continue;
    for (const region of line.regions) {
      const monies = extractMoniesAfterQty(region.text);
      if (monies.total !== null && monies.count >= 1) {
        suffixTotal = monies.total;
        break;
      }
    }
    if (suffixTotal !== null) break;
  }

  const resolvedUnitPrice =
    suffixUnitPrice !== null ? suffixUnitPrice : bands.unitPrice;

  let originalTotal: number | null;
  if (de !== null) {
    originalTotal = de;
  } else if (bands.originalTotal !== null) {
    originalTotal = bands.originalTotal;
  } else if (por !== null) {
    originalTotal = null;
  } else {
    originalTotal = suffixTotal;
  }

  let descontoFinal =
    por === null ? resolveDiscountFinalValue(zone, originalTotal) : null;

  let inferredOriginal: number | null = null;
  if (por === null && descontoFinal === null) {
    const inferred = inferPricesFromDiscountMath(zone, originalTotal);
    if (inferred !== null) {
      descontoFinal = inferred.final;
      inferredOriginal = inferred.original;
    }
  }
  if (inferredOriginal !== null && originalTotal === null) {
    originalTotal = inferredOriginal;
  }

  return {
    unitPrice: resolvedUnitPrice,
    originalTotal,
    explicitFinalValue: por ?? descontoFinal,
  };
}

export function extractItemBlock(
  lines: GridLine[],
  block: ItemLineBlock,
  priceDebug?: ItemBlockPriceDebug,
): ExtractedItemBlock {
  const descriptionPick = pickDescription(lines, block);
  const { quantity, unit } = extractQuantityUnit(lines, block, descriptionPick);
  const monetary = extractMonetary(lines, block, descriptionPick, priceDebug);

  return {
    lineIndices: [...block.lineIndices],
    description: descriptionPick.text,
    quantity,
    unit,
    unitPrice: monetary.unitPrice,
    originalTotal: monetary.originalTotal,
    explicitFinalValue: monetary.explicitFinalValue,
    classification: block.classification ?? "fragment",
    signals: block.signals ? [...block.signals] : undefined,
  };
}
