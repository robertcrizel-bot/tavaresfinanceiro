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

const COMPLEMENT_PREFIX_RE = /^(?:de|por|desconto)\b/i;
const LEADING_CODE_RE = /^\d+\s+/;

const ALLOWED_UNITS = new Set(["UN", "KG", "G", "ML", "LT", "L"]);

const QTY_UNIT_RE =
  /(?<!\d)(\d+(?:[.,]\d+)?)(?:\s*[Xx]\s*|\s*)(UN|KG|ML|LT|L|G)X?(?![A-Za-z])/i;
const QTY_ONLY_RE = /^(\d+(?:[.,]\d+)?)([A-Za-z]{1,3})(?=\s|$)/;
const DESCRIPTION_TRAILING_QTY_RE =
  /(?:^|\s)(\d+)(?:\s*[Xx]\s*|\s*)(UN)$/i;

const MONEY_FULL_RE = /^\d+[.,]\d{2}$/;
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
  return /\d+[.,]\d{2}(?!\d)/.test(text);
}

function isComplementText(text: string): boolean {
  return COMPLEMENT_PREFIX_RE.test(text.trim());
}

function isComplementLine(line: GridLine): boolean {
  return line.regions.some((region) => isComplementText(region.text));
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
  if (!MONEY_FULL_RE.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function extractMoneyValue(text: string): number | null {
  const trimmed = text.trim();
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
    const moneyMatch = remainder.match(/\d+[.,]\d{2}/);
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
): MoneyCandidate[] {
  const heights: number[] = [];
  const raw: MoneyCandidate[] = [];
  const descriptionLineIndex = block.lineIndices[0];

  for (const lineIndex of block.lineIndices) {
    const line = lines[lineIndex];
    if (!line || isComplementLine(line)) continue;
    const parsed = new Set<ItemRegion>();
    for (const region of line.regions) {
      heights.push(region.height);
      const value = extractMoneyValue(region.text);
      if (value === null) continue;
      parsed.add(region);
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
      const joined = tryJoinAdjacentMoney(left, right, line);
      if (joined === null) continue;
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
    const tokens = remainder.match(/\d+[.,]\d{2}/g) ?? [];
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
): MoneyCandidate | null {
  const excluded = new Set(descriptionPick.pieces);
  if (descriptionPick.region) excluded.add(descriptionPick.region);
  const descriptionLineIndex = block.lineIndices[0];
  for (const lineIndex of block.lineIndices) {
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
): { unitPrice: number | null; originalTotal: number | null } {
  const collected = collectMoneyCandidates(lines, block);
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

function extractDescontoFinalValue(
  lines: GridLine[],
  block: ItemLineBlock,
): number | null {
  let bestValue: number | null = null;
  let bestCx = -Infinity;

  for (const lineIndex of block.lineIndices) {
    const line = lines[lineIndex];
    if (!line || !isComplementLine(line) || !isDescontoLine(line)) continue;

    const regions = [...line.regions].sort((a, b) => a.minX - b.minX);

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];

      const value = extractMoneyValue(region.text);
      if (value !== null && value > 0) {
        if (region.cx > bestCx) {
          bestValue = value;
          bestCx = region.cx;
        }
        continue;
      }

      if (i < regions.length - 1) {
        const joined = tryJoinAdjacentMoney(region, regions[i + 1], line);
        if (joined !== null) {
          const joinCx = Math.max(region.cx, regions[i + 1].cx);
          if (joinCx > bestCx) {
            bestValue = joined;
            bestCx = joinCx;
          }
        }
      }
    }
  }

  return bestValue;
}

function extractMonetary(
  lines: GridLine[],
  block: ItemLineBlock,
  descriptionPick: DescriptionPick,
): {
  unitPrice: number | null;
  originalTotal: number | null;
  explicitFinalValue: number | null;
} {
  const suffixAnchor = findSuffixAnchor(lines, block, descriptionPick);
  const suffixUnitPrice = suffixAnchor ? suffixAnchor.value : null;
  const bands = deriveMonetaryBands(lines, block, suffixAnchor);
  const { por, de } = extractMarkers(lines, block);

  let suffixTotal: number | null = null;
  for (const lineIndex of block.lineIndices) {
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

  const descontoFinal =
    por === null ? extractDescontoFinalValue(lines, block) : null;

  return {
    unitPrice: resolvedUnitPrice,
    originalTotal,
    explicitFinalValue: por ?? descontoFinal,
  };
}

export function extractItemBlock(
  lines: GridLine[],
  block: ItemLineBlock,
): ExtractedItemBlock {
  const descriptionPick = pickDescription(lines, block);
  const { quantity, unit } = extractQuantityUnit(lines, block, descriptionPick);
  const monetary = extractMonetary(lines, block, descriptionPick);

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
