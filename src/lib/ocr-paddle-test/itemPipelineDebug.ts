import { spatialGroup } from "./spatialGrouper";
import type { GridLine } from "./spatialGrouper";
import { detectItemBlocks } from "./itemBlockDetector";
import type { ItemLineBlock } from "./itemBlockDetector";
import {
  createItemBlockPriceDebug,
  extractItemBlock,
} from "./itemBlockExtractor";
import type { PaddleReceiptItem } from "./receiptResult";
import type { PaddleOcrRegion } from "./types";

const MORANGO_EAN = "7896004009995";
const MORANGO_RE = /MORANG/i;
const MORANGO_ANY_RE = /7896004009995|MORANG/i;
const EAN_TOKEN_RE = /(?:^|\s)(\d{8}|\d{12}|\d{13}|\d{14})(?!\d)/;

type BlockRegion = GridLine["regions"][number];

function lineTextOf(line: GridLine | undefined): string {
  if (!line) return "";
  return line.regions
    .map((region) => region.text)
    .join(" ")
    .trim();
}

function fmtValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return String(value);
}

function regionText(region: BlockRegion): string {
  return `"${region.text}" conf=${region.confidence} bbox=${JSON.stringify(region.bbox)}`;
}

function eanOfBlock(lines: GridLine[], block: ItemLineBlock): string | null {
  for (const lineIndex of block.lineIndices) {
    const line = lines[lineIndex];
    if (!line) continue;
    for (const region of line.regions) {
      const match = region.text.match(EAN_TOKEN_RE);
      if (match) return match[1];
    }
  }
  return null;
}

function formatMoneyCandidates(debug: ReturnType<typeof createItemBlockPriceDebug>): string {
  if (debug.moneyCandidates.length === 0) return "(nenhum)";
  return debug.moneyCandidates
    .map(
      (candidate) =>
        `#${candidate.lineIndex} x=${Math.round(candidate.cx)} y=${Math.round(candidate.cy)} v=${candidate.value}`,
    )
    .join(" | ");
}

function formatZoneLineIndices(indices: number[] | null): string {
  if (indices === null) return "null";
  return `[${indices.map((index) => `#${index}`).join(", ")}]`;
}

function formatZoneCandidates(candidates: number[]): string {
  if (candidates.length === 0) return "[]";
  return `[${candidates.join(", ")}]`;
}

function ownerLabels(
  blocks: ItemLineBlock[],
  areaStart: number | null,
  areaEnd: number | null,
): Map<number, string> {
  const labels = new Map<number, string>();
  blocks.forEach((block, index) => {
    for (const lineIndex of block.lineIndices) {
      labels.set(lineIndex, `item ${index + 1}`);
    }
  });
  return labels;
}

function ownerLabelFor(
  lineIndex: number,
  labels: Map<number, string>,
  areaStart: number | null,
  areaEnd: number | null,
): string {
  const owned = labels.get(lineIndex);
  if (owned) return owned;
  if (areaStart !== null && lineIndex < areaStart) return "antes da área de itens";
  if (areaEnd !== null && lineIndex > areaEnd) return "após o resumo";
  return "FORA DE BLOCO";
}

function printWindow(
  out: string[],
  lines: GridLine[],
  from: number,
  to: number,
  labels: Map<number, string>,
  areaStart: number | null,
  areaEnd: number | null,
): void {
  for (let lineIndex = from; lineIndex <= to; lineIndex++) {
    const owner = ownerLabelFor(lineIndex, labels, areaStart, areaEnd);
    out.push(`  #${lineIndex} [${owner}] ${lineTextOf(lines[lineIndex])}`);
    const line = lines[lineIndex];
    if (!line) continue;
    line.regions.forEach((region, regionIndex) => {
      out.push(`      [${regionIndex}] ${regionText(region)}`);
    });
  }
}

/**
 * Compact per-item pipeline dump for the visible diagnostics panel:
 * raw grouping -> item blocks -> money candidates -> discount zone ->
 * extracted values -> final effective value after propagation.
 * Debug-only; never used by the parsing flow itself.
 */
export function buildItemPipelineDebugText(
  regions: PaddleOcrRegion[],
  finalItems: readonly PaddleReceiptItem[] | undefined | null,
): string {
  const items = finalItems ?? [];
  const out: string[] = [];
  const { lines } = spatialGroup(regions);
  const { blocks, areaStart, areaEnd } = detectItemBlocks(lines);
  const labels = ownerLabels(blocks, areaStart, areaEnd);

  out.push("PIPELINE DOS ITENS");
  out.push(
    `área dos itens: ${areaStart !== null && areaEnd !== null ? `#${areaStart}..#${areaEnd}` : "n/d"}`,
  );
  if (blocks.length === 0) {
    out.push("(nenhum bloco de item detectado)");
  }
  blocks.forEach((block, index) => {
    const debug = createItemBlockPriceDebug();
    const extracted = extractItemBlock(lines, block, debug);
    const finalItem = items[index] ?? null;
    out.push(`item ${index + 1}:`);
    out.push(`  EAN: ${eanOfBlock(lines, block) ?? "-"}`);
    out.push(`  descrição: ${extracted.description ?? "-"}`);
    out.push(`  classificação: ${extracted.classification}`);
    out.push(`  block lineIndices: [${block.lineIndices.join(", ")}]`);
    out.push(`  linhas do bloco:`);
    for (const lineIndex of block.lineIndices) {
      out.push(`    #${lineIndex} ${lineTextOf(lines[lineIndex])}`);
      const line = lines[lineIndex];
      if (!line) continue;
      line.regions.forEach((region, regionIndex) => {
        out.push(`      [${regionIndex}] ${regionText(region)}`);
      });
    }
    out.push(`  money candidates: ${formatMoneyCandidates(debug)}`);
    out.push(
      `  discount zone: lines=${formatZoneLineIndices(debug.discountZoneLineIndices)} candidates=${formatZoneCandidates(debug.discountZoneCandidates)} desconto=${fmtValue(debug.discountZoneDiscountValue)}`,
    );
    out.push(`  unitPrice: ${fmtValue(extracted.unitPrice)}`);
    out.push(`  originalTotal: ${fmtValue(extracted.originalTotal)}`);
    out.push(`  explicitFinalValue: ${fmtValue(extracted.explicitFinalValue)}`);
    out.push(
      `  effectiveValue (final): ${finalItem ? fmtValue(finalItem.effectiveValue) : "n/d"}`,
    );
  });

  out.push("");
  out.push("MORANGO DEBUG");

  let morangoBlockIndex = -1;
  for (let index = 0; index < blocks.length; index++) {
    const blockText = blocks[index].lineIndices
      .map((lineIndex) => lineTextOf(lines[lineIndex]))
      .join(" ");
    if (eanOfBlock(lines, blocks[index]) === MORANGO_EAN || MORANGO_RE.test(blockText)) {
      morangoBlockIndex = index;
      break;
    }
  }

  if (morangoBlockIndex >= 0) {
    const block = blocks[morangoBlockIndex];
    const debug = createItemBlockPriceDebug();
    const extracted = extractItemBlock(lines, block, debug);
    const finalItem = items[morangoBlockIndex] ?? null;
    out.push(`EAN: ${eanOfBlock(lines, block) ?? "-"}`);
    out.push(`item: ${morangoBlockIndex + 1} de ${blocks.length}`);
    out.push(`descrição: ${extracted.description ?? "-"}`);
    out.push(`block lineIndices: [${block.lineIndices.join(", ")}]`);
    const from = Math.max(0, Math.min(...block.lineIndices) - 6);
    const to = Math.min(lines.length - 1, Math.max(...block.lineIndices) + 8);
    out.push(`janela de linhas #${from}..#${to}:`);
    printWindow(out, lines, from, to, labels, areaStart, areaEnd);
    out.push(`money candidates: ${formatMoneyCandidates(debug)}`);
    out.push(
      `discount zone: lines=${formatZoneLineIndices(debug.discountZoneLineIndices)} candidates=${formatZoneCandidates(debug.discountZoneCandidates)} desconto=${fmtValue(debug.discountZoneDiscountValue)}`,
    );
    out.push(`unitPrice: ${fmtValue(extracted.unitPrice)}`);
    out.push(`originalTotal: ${fmtValue(extracted.originalTotal)}`);
    out.push(`explicitFinalValue: ${fmtValue(extracted.explicitFinalValue)}`);
    out.push(
      `effectiveValue (final): ${finalItem ? fmtValue(finalItem.effectiveValue) : "n/d"}`,
    );
  } else {
    const hitIndex = lines.findIndex((line) => MORANGO_ANY_RE.test(lineTextOf(line)));
    if (hitIndex >= 0) {
      out.push("(o morango aparece nas linhas agrupadas, mas em nenhum bloco)");
      const from = Math.max(0, hitIndex - 5);
      const to = Math.min(lines.length - 1, hitIndex + 8);
      out.push(`janela de linhas #${from}..#${to}:`);
      printWindow(out, lines, from, to, labels, areaStart, areaEnd);
    } else {
      out.push("(morango não encontrado nas linhas agrupadas — ver APÓS AGRUPAMENTO e SAÍDA BRUTA)");
    }
  }

  return out.join("\n");
}
