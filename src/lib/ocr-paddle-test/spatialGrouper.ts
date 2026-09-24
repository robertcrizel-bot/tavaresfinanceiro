import type {
  PaddleOcrRegion,
  SpatialItem,
  SpatialHeaderColumnMapping,
  SpatialHeaderColumns,
} from "./types";

export interface RegionGeometry {
  cx: number;
  cy: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GridLine {
  regions: (PaddleOcrRegion & RegionGeometry)[];
  avgY: number;
}

export interface ColumnRange {
  minX: number;
  maxX: number;
  centerX: number;
}

export type HeaderSemanticCategory =
  | "code"
  | "description"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "total";

export interface HeaderRegionSemantics {
  text: string;
  categories: HeaderSemanticCategory[];
}

export interface SpatialGroupResult {
  items: SpatialItem[];
  headerColumns: SpatialHeaderColumnMapping | null;
  headerSemantics: HeaderRegionSemantics[];
  lines: GridLine[];
  columns: ColumnRange[];
  allText: string;
}

const REGION_MERGE_Y_FACTOR = 0.5;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

const SUMMARY_LINE_RE =
  /(?:subtotal|total\s*geral|total\s*incid|descont|troco|valor\s*total)/i;
const NON_DATA_RE =
  /(?:cnpj|cpf|inscri[çc][ãa]o|nota\s*fiscal|n[ºo°]| serie| protocolo| impresso| emitido| documento| chave|pix|pagamento|forma\s*pagto|cart[ãa]o|bandeira)/i;

function computeGeometry(region: PaddleOcrRegion): RegionGeometry {
  const xs = region.bbox.map((p) => p[0]);
  const ys = region.bbox.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    minX,
    maxX,
    minY,
    maxY,
  };
}

function enrichRegions(
  regions: PaddleOcrRegion[]
): (PaddleOcrRegion & RegionGeometry)[] {
  return regions.map((r) => ({ ...r, ...computeGeometry(r) }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function recomputeLineY(lines: GridLine[]): void {
  for (const line of lines) {
    line.avgY = median(line.regions.map((r) => r.cy));
    line.regions.sort((a, b) => a.cx - b.cx);
  }
}

function reassignNearLines(lines: GridLine[], yThreshold: number): void {
  for (let pass = 0; pass < 4; pass++) {
    const moves: {
      from: number;
      to: number;
      region: (typeof lines)[0]["regions"][number];
    }[] = [];
    for (let i = 0; i < lines.length; i++) {
      for (const region of lines[i].regions) {
        let bestIdx = i;
        let bestDist = Math.abs(region.cy - lines[i].avgY);
        for (let k = 0; k < lines.length; k++) {
          if (k === i) continue;
          const dist = Math.abs(region.cy - lines[k].avgY);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = k;
          }
        }
        if (bestIdx !== i && bestDist <= yThreshold) {
          moves.push({ from: i, to: bestIdx, region });
        }
      }
    }
    if (moves.length === 0) break;
    for (const move of moves) {
      const line = lines[move.from];
      const idx = line.regions.indexOf(move.region);
      if (idx >= 0) line.regions.splice(idx, 1);
      const target = lines[move.to];
      if (target) target.regions.push(move.region);
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].regions.length === 0) lines.splice(i, 1);
    }
    recomputeLineY(lines);
  }
}

function groupByY(
  regions: (PaddleOcrRegion & RegionGeometry)[]
): GridLine[] {
  if (regions.length === 0) return [];

  const sorted = [...regions].sort((a, b) => a.cy - b.cy);
  const heights = sorted.map((r) => r.height);
  const medianHeight = median(heights);
  const yThreshold = Math.max(8, medianHeight * REGION_MERGE_Y_FACTOR);

  const lines: GridLine[][] = [];
  let currentLine: (PaddleOcrRegion & RegionGeometry)[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const region = sorted[i];
    const lastLineY = median(currentLine.map((r) => r.cy));
    if (Math.abs(region.cy - lastLineY) <= yThreshold) {
      currentLine.push(region);
    } else {
      lines.push([currentLine]);
      currentLine = [region];
    }
  }
  lines.push([currentLine]);

  const gridLines: GridLine[] = lines.map((lineRegions) => {
    const flat = lineRegions.flat();
    return {
      regions: flat.sort((a, b) => a.cx - b.cx),
      avgY: median(flat.map((r) => r.cy)),
    };
  });
  reassignNearLines(gridLines, yThreshold);
  return gridLines;
}

function detectColumns(lines: GridLine[]): ColumnRange[] {
  if (lines.length === 0) return [];

  const allX = lines.flatMap((line) => line.regions.map((r) => r.cx));
  if (allX.length === 0) return [];

  const sortedX = [...allX].sort((a, b) => a - b);

  const widths = lines.flatMap((line) => line.regions.map((r) => r.width));
  const medianWidth = median(widths);
  const gapThreshold = Math.max(20, medianWidth * 0.8);

  const groups: number[][] = [[sortedX[0]]];
  for (let i = 1; i < sortedX.length; i++) {
    const lastGroup = groups[groups.length - 1];
    const lastGroupMax = lastGroup[lastGroup.length - 1];
    if (sortedX[i] - lastGroupMax <= gapThreshold) {
      lastGroup.push(sortedX[i]);
    } else {
      groups.push([sortedX[i]]);
    }
  }

  return groups.map((group) => {
    const min = Math.min(...group);
    const max = Math.max(...group);
    return { minX: min, maxX: max, centerX: (min + max) / 2 };
  });
}

function assignToColumn(
  regionCx: number,
  columns: ColumnRange[]
): number | null {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const dist = Math.abs(regionCx - columns[i].centerX);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

const HEADER_KEYWORDS = {
  name: /(?:produto|item|descri[çc][ãa]o|mercadoria|artigo)/i,
  qty: /(?:qtd|qtde|quant|q\.?td\.?)/i,
  unit: /^un$/i,
  unitPrice: /(?:pre[çc]o|unit|vlr?\s*unit|pre[çc]o\s*unit)/i,
  total: /(?:total|subtotal|vlr?\s*total|valor)/i,
};

const HEADER_SEMANTIC_PATTERNS: Record<HeaderSemanticCategory, RegExp> = {
  code: /(?:^|\s)[ij]?cod(?:igo)?(?=\s|$)/i,
  description:
    /(?:^|\s)[ij]?(?:desc(?:ricao)?|items?|itens?|produtos?|mercadoria|artigo)(?=\s|$)/i,
  quantity: /(?:^|\s)[ij]?(?:qtd|qtde|gtde|quant(?:idade)?)(?=\s|$)/i,
  unit: /(?:^|\s)[ij]?(?:un|und|unid(?:ade)?|unit)(?=\s|$)/i,
  unitPrice:
    /(?:^|\s)[ij]?(?:vl|vlr|valor|preco)\s+[ij]?(?:un|unit|unitario)(?=\s|$)/i,
  total:
    /(?:^|\s)(?:[ij]?total|[ij]?valor(?!\s+[ij]?(?:un|unit|unitario))|[ij]?(?:vl|vlr|valor)\s+[ij]?item)(?=\s|$)/i,
};

interface DetectedHeader {
  columns: SpatialHeaderColumnMapping;
  semantics: HeaderRegionSemantics[];
}

export function detectHeaderCategories(text: string): HeaderSemanticCategory[] {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9$]+/gi, " ")
    .trim();

  return (Object.entries(HEADER_SEMANTIC_PATTERNS) as [
    HeaderSemanticCategory,
    RegExp,
  ][])
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([category]) => category);
}

export function detectColumnsFromHeader(headerLine: GridLine): ColumnRange[] {
  const anchors = headerLine.regions.flatMap((region) => {
    const categories = detectHeaderCategories(region.text);
    return categories.length === 1
      ? [{ region, category: categories[0] }]
      : [];
  });
  const categoryCounts = new Map<HeaderSemanticCategory, number>();

  for (const anchor of anchors) {
    categoryCounts.set(
      anchor.category,
      (categoryCounts.get(anchor.category) ?? 0) + 1,
    );
  }

  const uniqueAnchors = anchors
    .filter((anchor) => categoryCounts.get(anchor.category) === 1)
    .sort((a, b) => a.region.cx - b.region.cx);

  if (uniqueAnchors.length < 2) return [];

  for (let i = 1; i < uniqueAnchors.length; i++) {
    if (uniqueAnchors[i - 1].region.maxX >= uniqueAnchors[i].region.minX) {
      return [];
    }
  }

  return uniqueAnchors.map(({ region }) => ({
    minX: region.minX,
    maxX: region.maxX,
    centerX: region.cx,
  }));
}

function detectHeaders(
  lines: GridLine[],
  columns: ColumnRange[]
): DetectedHeader | null {
  if (lines.length === 0) return null;

  let headerLine: GridLine | null = null;
  for (const line of lines) {
    const texts = line.regions.map((r) => r.text.trim());
    if (isHeaderLine(texts)) {
      headerLine = line;
      break;
    }
  }
  if (!headerLine) return null;

  const result: SpatialHeaderColumnMapping = {
    nameIdx: null,
    qtyIdx: null,
    unitIdx: null,
    unitPriceIdx: null,
    totalIdx: null,
  };
  const semantics = headerLine.regions
    .map((region) => ({
      text: region.text,
      categories: detectHeaderCategories(region.text),
    }))
    .filter((region) => region.categories.length > 0);

  if (columns.length === 0) return { columns: result, semantics };

  for (const region of headerLine.regions) {
    const colIdx = assignToColumn(region.cx, columns);
    if (colIdx === null) continue;
    const text = region.text.trim();

    if (HEADER_KEYWORDS.name.test(text)) {
      result.nameIdx = colIdx;
    } else if (HEADER_KEYWORDS.qty.test(text)) {
      result.qtyIdx = colIdx;
    } else if (HEADER_KEYWORDS.unit.test(text)) {
      result.unitIdx = colIdx;
    } else if (HEADER_KEYWORDS.unitPrice.test(text)) {
      result.unitPriceIdx = colIdx;
    } else if (HEADER_KEYWORDS.total.test(text)) {
      result.totalIdx = colIdx;
    }
  }

  return { columns: result, semantics };
}

const BRL_VALUE_RE = /^R?\$?\s*[\d]{1,3}(?:[.][\d]{3})*(?:,[\d]{2})?$/;
const INTEGER_RE = /^\d+$/;
const QTY_RE = /^\d+(?:[.,]\d+)?$/;

function parseValue(text: string): number | null {
  const cleaned = text.replace(/[^\d,.]/g, "");
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
    if (afterDot.length <= 2) {
      normalized = cleaned;
    } else {
      normalized = cleaned.replace(/\./g, "");
    }
  } else {
    normalized = cleaned;
  }
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function isPrice(text: string): boolean {
  return BRL_VALUE_RE.test(text.trim()) || /^\d+[.,]\d{2}$/.test(text.trim());
}

function isQuantity(text: string): boolean {
  return INTEGER_RE.test(text.trim());
}

function buildGrid(
  lines: GridLine[],
  columns: ColumnRange[],
  headerLineIdx: number
): (string | null)[][] {
  const grid: (string | null)[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === headerLineIdx) continue;
    const row: (string | null)[] = new Array(columns.length).fill(null);
    for (const region of lines[i].regions) {
      const colIdx = assignToColumn(region.cx, columns);
      if (colIdx !== null) {
        const existing = row[colIdx];
        row[colIdx] = existing ? `${existing} ${region.text}` : region.text;
      }
    }
    grid.push(row);
  }
  return grid;
}

function extractItems(
  grid: (string | null)[][],
  headers: SpatialHeaderColumns,
  lines: GridLine[],
  columns: ColumnRange[],
  headerLineIdx: number
): SpatialItem[] {
  const items: SpatialItem[] = [];

  const dataLines = lines.filter((_, i) => i !== headerLineIdx);

  for (let rowIdx = 0; rowIdx < grid.length; rowIdx++) {
    const row = grid[rowIdx];
    const dataLine = dataLines[rowIdx];

    const nameText = row[headers.nameIdx] ?? "";
    if (!nameText) continue;

    const name = nameText.trim();
    if (!name) continue;
    if (isSummaryLine([name])) continue;
    if (isNonDataLine([name])) continue;

    const qtyText = headers.qtyIdx !== null ? row[headers.qtyIdx] : null;
    const unitText = headers.unitIdx !== null ? row[headers.unitIdx] : null;
    const unitPriceText =
      headers.unitPriceIdx !== null ? row[headers.unitPriceIdx] : null;
    const totalText =
      headers.totalIdx !== null ? row[headers.totalIdx] : null;

    const lowConfidenceFields: string[] = [];

    if (dataLine) {
      for (const region of dataLine.regions) {
        if (region.confidence < LOW_CONFIDENCE_THRESHOLD) {
          const colIdx = assignToColumn(region.cx, columns);
          if (colIdx === headers.nameIdx) {
            if (!lowConfidenceFields.includes("name"))
              lowConfidenceFields.push("name");
          } else if (colIdx === headers.qtyIdx) {
            if (!lowConfidenceFields.includes("quantity"))
              lowConfidenceFields.push("quantity");
          } else if (colIdx === headers.unitPriceIdx) {
            if (!lowConfidenceFields.includes("unitPrice"))
              lowConfidenceFields.push("unitPrice");
          } else if (colIdx === headers.totalIdx) {
            if (!lowConfidenceFields.includes("total"))
              lowConfidenceFields.push("total");
          }
        }
      }
    }

    let quantity: number | null = null;
    if (qtyText && isQuantity(qtyText)) {
      quantity = parseValue(qtyText);
    }

    const unit = unitText?.trim() ?? null;

    let unitPrice: number | null = null;
    if (unitPriceText && isPrice(unitPriceText)) {
      unitPrice = parseValue(unitPriceText);
    }

    let total: number | null = null;
    if (totalText && isPrice(totalText)) {
      total = parseValue(totalText);
    }

    items.push({
      name,
      quantity,
      unit,
      unitPrice,
      total,
      lowConfidenceFields,
    });
  }

  return items;
}

function isSummaryLine(texts: string[]): boolean {
  return texts.some((t) => SUMMARY_LINE_RE.test(t));
}

function isNonDataLine(texts: string[]): boolean {
  return texts.some((t) => NON_DATA_RE.test(t));
}

export function isHeaderLine(texts: string[]): boolean {
  const categories = new Set(
    texts.flatMap((text) => detectHeaderCategories(text)),
  );
  return categories.size >= 2;
}

function hasNameColumn(
  headers: SpatialHeaderColumnMapping,
): headers is SpatialHeaderColumns {
  return headers.nameIdx !== null;
}

function isItemLine(texts: string[]): boolean {
  if (isHeaderLine(texts)) return false;
  if (isSummaryLine(texts)) return false;
  if (isNonDataLine(texts)) return false;
  return true;
}

export function spatialGroup(regions: PaddleOcrRegion[]): SpatialGroupResult {
  if (regions.length === 0) {
    return {
      items: [],
      headerColumns: null,
      headerSemantics: [],
      lines: [],
      columns: [],
      allText: "",
    };
  }

  const enriched = enrichRegions(regions);
  const lines = groupByY(enriched);

  const itemLines = lines.filter((line) => {
    const texts = line.regions.map((r) => r.text.trim());
    return isItemLine(texts);
  });

  const itemColumns = itemLines.length > 0 ? detectColumns(itemLines) : [];
  const headerLine = lines.find((line) =>
    isHeaderLine(line.regions.map((region) => region.text.trim())),
  );
  const headerColumns = headerLine ? detectColumnsFromHeader(headerLine) : [];
  const dataColumns =
    headerColumns.length > itemColumns.length ? headerColumns : itemColumns;
  const detectedHeader = detectHeaders(lines, dataColumns);
  const headers = detectedHeader?.columns ?? null;

  let grid: (string | null)[][] = [];
  let items: SpatialItem[] = [];

  if (headers && hasNameColumn(headers) && dataColumns.length >= 2) {
    let headerLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const texts = lines[i].regions.map((r) => r.text.trim());
      if (isHeaderLine(texts)) {
        headerLineIdx = i;
        break;
      }
    }
    grid = buildGrid(lines, dataColumns, headerLineIdx);
    items = extractItems(grid, headers, lines, dataColumns, headerLineIdx);
  }

  const allText = lines
    .flatMap((line) => line.regions.map((r) => r.text))
    .join("\n");

  return {
    items,
    headerColumns: headers,
    headerSemantics: detectedHeader?.semantics ?? [],
    lines,
    columns: dataColumns,
    allText,
  };
}
