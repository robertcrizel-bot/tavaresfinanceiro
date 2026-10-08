export interface PaddleOcrRegion {
  text: string;
  confidence: number;
  bbox: [number, number][];
}

export interface SpatialItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  total: number | null;
  lowConfidenceFields: string[];
}

export interface SpatialHeaderColumnMapping {
  nameIdx: number | null;
  qtyIdx: number | null;
  unitIdx: number | null;
  unitPriceIdx: number | null;
  totalIdx: number | null;
}

export interface SpatialHeaderColumns extends SpatialHeaderColumnMapping {
  nameIdx: number;
}

export interface PaddleOcrResult {
  text: string;
  confidence: number | null;
  regions: PaddleOcrRegion[];
  spatialItems: SpatialItem[];
  spatialHeaderColumns: SpatialHeaderColumnMapping | null;
  timeMs: number;
  detectedBoxes: number;
  recognizedCount: number;
  backend: string;
  error?: string;
}

export interface PaddleOcrReport {
  result: PaddleOcrResult;
  configLabel: string;
}
