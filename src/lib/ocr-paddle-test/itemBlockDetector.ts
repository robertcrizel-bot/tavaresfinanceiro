import { isHeaderLine } from "./spatialGrouper";
import type { GridLine } from "./spatialGrouper";

export type ItemBlockClassification = "strong" | "ambiguous" | "fragment";

type BlockRegion = GridLine["regions"][number];

export interface ItemLineBlock {
  lineIndices: number[];
  startLine: number;
  endLine: number;
  classification?: ItemBlockClassification;
  signals?: string[];
  excludedRegions?: ReadonlySet<BlockRegion>;
  structuralExtras?: readonly BlockRegion[];
}

export interface ItemBlockDetectionResult {
  blocks: ItemLineBlock[];
  areaStart: number | null;
  areaEnd: number | null;
}

const ITEM_COUNT_SUMMARY_RE =
  /(?:qtde|quantidade|qtd)\.?\s*total\s*de\s*itens|total\s*de\s*itens/i;

const COMPLEMENT_PREFIX_RE = /^(?:de|por|desconto)\b/i;
const DIGIT_RE = /\d/;
const UNIT_TOKEN_RE =
  /(?:^|[\s.,])(?:un|und|unidade|kg|g|ml|lt|l)(?=$|[\s.,])/i;
const MONEY_RE = /\d+[.,]\d{2}(?!\d)/;
const QTY_PATTERN_RE =
  /(?<!\d)\d+(?:[.,]\d+)?\s*(?:[xX]\s*)?(?:UN|KG|ML|LT|L|G)X?(?![A-Za-z])/;
const LEADING_CODE_RE = /^\d{3,}\s+\S/;
const PURE_CODE_RE = /^\d{1,8}$/;
const ADJUSTMENT_LABEL_RE =
  /^(?:valor\s*(?:liquido|líquido|total|pago)|desconto|acrescimo|acr[eé]scimo|subtotal)\b/i;
const UNIT_STRIP_RE = /(?<![A-Za-z])(?:UN|UND|UNIDADE|KG|ML|LT|L|G|X)(?![A-Za-z])/gi;
const FISCAL_NOTE_RE =
  /(?:ICMS|conv[eê]nio|monof[aá]sico|monol[aá]sico)/i;
const ANOMALOUS_HEIGHT_FACTOR = 2;
const LOOKAHEAD_MAX = 4;

type LineClass =
  | "complement"
  | "single-product"
  | "quant-only"
  | "code-only"
  | "text"
  | "other";

function lineText(line: GridLine): string {
  return line.regions.map((region) => region.text).join(" ");
}

function isSummaryLine(line: GridLine): boolean {
  return ITEM_COUNT_SUMMARY_RE.test(lineText(line));
}

function isComplementLine(line: GridLine): boolean {
  return line.regions.some((region) =>
    COMPLEMENT_PREFIX_RE.test(region.text.trim()),
  );
}

function hasSignificantAlphabetic(text: string): boolean {
  return text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "").length >= 3;
}

function productLikeAlpha(text: string): boolean {
  const stripped = text.replace(UNIT_STRIP_RE, "").replace(/[^a-zA-Z\u00C0-\u024F]/g, "");
  return stripped.length >= 3;
}

function hasLeadingCode(text: string): boolean {
  return LEADING_CODE_RE.test(text.trim());
}

function hasQtyPattern(text: string): boolean {
  return QTY_PATTERN_RE.test(text);
}

function hasMoney(text: string): boolean {
  return MONEY_RE.test(text);
}

function classifyLine(line: GridLine): LineClass {
  const text = lineText(line);
  if (isComplementLine(line)) return "complement";
  if (ADJUSTMENT_LABEL_RE.test(text.trim())) return "complement";
  if (productLikeAlpha(text) && hasQtyPattern(text)) {
    return "single-product";
  }
  if (hasQtyPattern(text) || (hasMoney(text) && !hasSignificantAlphabetic(text))) {
    return "quant-only";
  }
  if (PURE_CODE_RE.test(text.trim())) return "code-only";
  if (hasSignificantAlphabetic(text)) return "text";
  if (hasMoney(text)) return "quant-only";
  return "other";
}

function lineHasAnomalousHeight(line: GridLine, medianHeight: number): boolean {
  return line.regions.some(
    (region) => region.height > medianHeight * ANOMALOUS_HEIGHT_FACTOR,
  );
}

function hasLookaheadQuant(
  lines: GridLine[],
  textIdx: number,
  areaEnd: number,
): boolean {
  const stop = Math.min(textIdx + LOOKAHEAD_MAX, areaEnd);
  for (let i = textIdx + 1; i <= stop; i++) {
    const line = lines[i];
    if (!line || isSummaryLine(line)) return false;
    const text = lineText(line);
    if (hasQtyPattern(text) || hasMoney(text)) return true;
    if (hasSignificantAlphabetic(text) && hasLeadingCode(text)) return false;
  }
  return false;
}

function nextQuantLine(
  lines: GridLine[],
  textIdx: number,
  areaEnd: number,
): { text: string } | null {
  const stop = Math.min(textIdx + LOOKAHEAD_MAX, areaEnd);
  for (let i = textIdx + 1; i <= stop; i++) {
    const line = lines[i];
    if (!line || isSummaryLine(line)) return null;
    const text = lineText(line);
    if (
      FISCAL_NOTE_RE.test(text) &&
      !hasMoney(text) &&
      !hasQtyPattern(text)
    ) {
      continue;
    }
    if (hasQtyPattern(text) || hasMoney(text)) return { text };
  }
  return null;
}

function overlapsBand(region: BlockRegion, band: { minX: number; maxX: number }): boolean {
  return region.minX <= band.maxX && region.maxX >= band.minX;
}

function descriptionBandOf(
  lines: GridLine[],
  open: OpenBlock,
): { minX: number; maxX: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let found = false;
  for (const index of open.lineIndices) {
    const line = lines[index];
    if (!line) continue;
    for (const region of line.regions) {
      if (open.excludedRegions?.has(region)) continue;
      const alpha = region.text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "");
      if (alpha.length < 4) continue;
      if (MONEY_RE.test(region.text)) continue;
      found = true;
      minX = Math.min(minX, region.minX);
      maxX = Math.max(maxX, region.maxX);
    }
  }
  return found ? { minX, maxX } : null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function itemAreaMedianHeight(
  lines: GridLine[],
  areaStart: number,
  areaEnd: number,
): number {
  const heights: number[] = [];
  for (let i = areaStart; i <= areaEnd; i++) {
    for (const region of lines[i].regions) {
      heights.push(region.height);
    }
  }
  return median(heights);
}

interface BlockEvidence {
  signals: string[];
  classification: ItemBlockClassification;
}

function classifyBlock(
  lines: GridLine[],
  block: ItemLineBlock,
  medianHeight: number,
): BlockEvidence {
  const signals: string[] = [];
  const blockLines = block.lineIndices.map((i) => lines[i]);
  const firstText = lineText(blockLines[0]);
  const description = hasSignificantAlphabetic(firstText);

  let money = false;
  let unit = false;
  let digits = false;
  let anomalousHeight = false;

  for (const line of blockLines) {
    for (const region of line.regions) {
      const text = region.text;
      if (MONEY_RE.test(text)) money = true;
      if (UNIT_TOKEN_RE.test(text) || UNIT_TOKEN_RE.test(` ${text} `)) unit = true;
      if (DIGIT_RE.test(text)) digits = true;
      if (region.height > medianHeight * ANOMALOUS_HEIGHT_FACTOR) {
        anomalousHeight = true;
      }
    }
  }

  if (description) signals.push("description");
  if (money) signals.push("money");
  if (unit) signals.push("unit");
  if (digits) signals.push("digits");
  if (anomalousHeight) signals.push("anomalous-height");

  let classification: ItemBlockClassification;
  if (!description) {
    classification = "fragment";
  } else if (anomalousHeight) {
    classification = "ambiguous";
  } else if (money || (unit && digits)) {
    classification = "strong";
  } else if (digits || unit) {
    classification = "ambiguous";
  } else {
    classification = "fragment";
  }

  return { signals, classification };
}

interface OpenBlock {
  lineIndices: number[];
  complete: boolean;
  excludedRegions?: Set<BlockRegion>;
  structuralExtras?: BlockRegion[];
  handoffRegions?: BlockRegion[];
}

function blockHasMoney(lines: GridLine[], open: OpenBlock): boolean {
  return open.lineIndices.some((index) => hasMoney(lineText(lines[index])));
}

function firstLineCoded(lines: GridLine[], open: OpenBlock): boolean {
  const first = open.lineIndices[0];
  if (first === undefined) return false;
  return hasLeadingCode(lineText(lines[first]));
}

function closeBlock(
  lines: GridLine[],
  open: OpenBlock,
  medianHeight: number,
  blocks: ItemLineBlock[],
): void {
  if (open.lineIndices.length === 0) return;
  const block: ItemLineBlock = {
    lineIndices: [...open.lineIndices],
    startLine: open.lineIndices[0],
    endLine: open.lineIndices[open.lineIndices.length - 1],
  };
  if (open.excludedRegions && open.excludedRegions.size > 0) {
    block.excludedRegions = new Set(open.excludedRegions);
  }
  if (open.structuralExtras && open.structuralExtras.length > 0) {
    block.structuralExtras = [...open.structuralExtras];
  }
  const evidence = classifyBlock(lines, block, medianHeight);
  block.classification = evidence.classification;
  block.signals = evidence.signals;
  blocks.push(block);
}

export function detectItemBlocks(
  lines: GridLine[],
): ItemBlockDetectionResult {
  const headerIndex = lines.findIndex((line) =>
    isHeaderLine(line.regions.map((region) => region.text.trim())),
  );
  if (headerIndex < 0) return { blocks: [], areaStart: null, areaEnd: null };

  const areaStart = headerIndex + 1;
  if (areaStart >= lines.length) {
    return { blocks: [], areaStart, areaEnd: null };
  }

  let summaryIndex = -1;
  for (let i = areaStart; i < lines.length; i++) {
    if (isSummaryLine(lines[i])) {
      summaryIndex = i;
      break;
    }
  }
  if (summaryIndex < 0) return { blocks: [], areaStart, areaEnd: null };

  const areaEnd = summaryIndex - 1;
  if (areaEnd < areaStart) return { blocks: [], areaStart, areaEnd };

  const medianHeight = itemAreaMedianHeight(lines, areaStart, areaEnd);
  const blocks: ItemLineBlock[] = [];
  let open: OpenBlock | null = null;

  for (let index = areaStart; index <= areaEnd; index++) {
    const line = lines[index];
    const lineClass = classifyLine(line);
    const text = lineText(line);

    if (FISCAL_NOTE_RE.test(text) && !hasMoney(text) && !hasQtyPattern(text)) {
      continue;
    }

    if (lineClass === "complement") {
      if (open) open.lineIndices.push(index);
      continue;
    }

    if (lineClass === "quant-only") {
      if (!open) continue;
      if (!open.complete) {
        open.lineIndices.push(index);
        open.complete = blockHasMoney(lines, open);
        continue;
      }

      const hasQtyPrefix = /^\d+(?:[.,]\d+)?[A-Za-z]/.test(text.trim());
      if (hasQtyPrefix || hasQtyPattern(text)) {
        const band = descriptionBandOf(lines, open);
        if (band) {
          const aligned = line.regions.filter((region) =>
            overlapsBand(region, band),
          );
          const unaligned = line.regions.filter(
            (region) => !overlapsBand(region, band),
          );
          if (aligned.length > 0 && unaligned.length > 0) {
            open.lineIndices.push(index);
            open.excludedRegions = new Set([
              ...(open.excludedRegions ?? []),
              ...unaligned,
            ]);
            open.handoffRegions = [
              ...(open.handoffRegions ?? []),
              ...unaligned,
            ];
            continue;
          }
          if (unaligned.length === 0 && aligned.length > 0) {
            open.lineIndices.push(index);
            open.complete = blockHasMoney(lines, open) || open.complete;
            continue;
          }
        }
      }

      if (hasQtyPrefix && blockHasMoney(lines, open)) {
        const handoff = open.handoffRegions;
        closeBlock(lines, open, medianHeight, blocks);
        open = {
          lineIndices: [index],
          complete: false,
          structuralExtras: handoff,
        };
        continue;
      }
      const labelRemainder = text.replace(/\d+[.,]\d{2}/g, "").trim();
      const hasShortLabel =
        !hasQtyPrefix &&
        /[A-Za-z\u00C0-\u024F]{1,}/.test(labelRemainder);
      if (hasShortLabel) continue;
      open.lineIndices.push(index);
      continue;
    }

    if (lineClass === "single-product") {
      if (open && !open.complete && !blockHasMoney(lines, open)) {
        open.lineIndices.push(index);
        open.complete = true;
        continue;
      }
      if (open) closeBlock(lines, open, medianHeight, blocks);
      const hasDescAlpha = hasSignificantAlphabetic(
        text.replace(/(?<![A-Za-z])(?:UN|KG|ML|LT|L|G|X)(?![A-Za-z])/gi, " "),
      );
      open = {
        lineIndices: [index],
        complete: hasDescAlpha || hasMoney(text),
      };
      continue;
    }

    if (lineClass === "code-only") {
      if (open && lineHasAnomalousHeight(line, medianHeight)) {
        open.lineIndices.push(index);
        continue;
      }
      if (open && !open.complete) {
        open.lineIndices.push(index);
      } else {
        if (open) closeBlock(lines, open, medianHeight, blocks);
        open = { lineIndices: [index], complete: false };
      }
      continue;
    }

    if (lineClass === "text") {
      const coded = hasLeadingCode(text);
      const openMoney = open ? blockHasMoney(lines, open) : false;
      const hasPureMoneyRegion = line.regions.some((region) =>
        /^\d+[.,]\d{2}$/.test(region.text.trim()),
      );
      const auxiliary =
        hasMoney(text) &&
        !hasQtyPattern(text) &&
        !coded &&
        openMoney &&
        !(hasSignificantAlphabetic(text) && hasPureMoneyRegion);

      if (!open) {
        open = {
          lineIndices: [index],
          complete: hasMoney(text) || hasQtyPattern(text),
        };
        continue;
      }

      if (!open.complete) {
        if (hasMoney(text) || hasQtyPattern(text)) {
          open.lineIndices.push(index);
          open.complete = true;
          continue;
        }
        if (!coded && hasLookaheadQuant(lines, index, areaEnd)) {
          open.lineIndices.push(index);
        } else {
          closeBlock(lines, open, medianHeight, blocks);
          open = {
            lineIndices: [index],
            complete: hasMoney(text) || hasQtyPattern(text),
          };
        }
        continue;
      }

      if (auxiliary) continue;

      if (
        !coded &&
        !hasMoney(text) &&
        !hasQtyPattern(text) &&
        hasSignificantAlphabetic(text)
      ) {
        if (!open.complete) {
          open.lineIndices.push(index);
          continue;
        }
        const nextQuant = nextQuantLine(lines, index, areaEnd);
        const nextIsSelfContainedProduct =
          nextQuant !== null && productLikeAlpha(nextQuant.text);
        const nextHasRealMoney =
          nextQuant !== null && hasMoney(nextQuant.text);
        const looksLikeContinuation =
          nextQuant !== null &&
          (nextIsSelfContainedProduct || !nextHasRealMoney);
        if (looksLikeContinuation) {
          open.lineIndices.push(index);
          continue;
        }
        const handoff = open.handoffRegions;
        closeBlock(lines, open, medianHeight, blocks);
        open = {
          lineIndices: [index],
          complete: false,
          structuralExtras: handoff,
        };
        continue;
      }

      if (
        coded &&
        !hasMoney(text) &&
        !hasQtyPattern(text) &&
        openMoney &&
        !firstLineCoded(lines, open)
      ) {
        open.lineIndices.push(index);
        continue;
      }

      {
        const handoff = open.handoffRegions;
        closeBlock(lines, open, medianHeight, blocks);
        open = {
          lineIndices: [index],
          complete: hasMoney(text) || hasQtyPattern(text),
          structuralExtras: handoff,
        };
      }
      continue;
    }

    if (open) {
      open.lineIndices.push(index);
      if (lineClass === "other" && hasMoney(text)) open.complete = true;
    }
  }

  if (open) closeBlock(lines, open, medianHeight, blocks);

  return { blocks, areaStart, areaEnd };
}
