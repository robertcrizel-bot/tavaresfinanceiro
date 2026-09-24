export interface LabStrategy {
  id: string;
  name: string;
  description: string;
  configLabel: string;
}

export interface LabResult {
  strategyId: string;
  strategyName: string;
  confidence: number;
  timeMs: number;
  text: string;
  error?: string;
}

export interface LabReport {
  strategyId: string;
  strategyName: string;
  configLabel: string;
  confidence: number;
  timeMs: number;
  text: string;
  lineCount: number;
  charCount: number;
  error?: string;
}

export interface StrategyConfig {
  lang: string;
  psm: string;
  oem: number | undefined;
  params: Record<string, string>;
  preprocessVariant: "default" | "threshold" | "upscale3x" | "threshold+upscale3x";
}

export interface LabRunOptions {
  imageDataUrl: string;
  onProgress?: (strategyId: string, index: number, total: number) => void;
  signal?: AbortSignal;
}

export const STRATEGIES: LabStrategy[] = [
  {
    id: "A",
    name: "Baseline PSM 3",
    description: "Configuração oficial atual (PSM 3, por+eng, preprocessing padrão)",
    configLabel: "PSM 3 | por+eng | preprocessing padrão",
  },
  {
    id: "B",
    name: "PSM 6 SINGLE_BLOCK",
    description: "Força tratamento como bloco único de texto",
    configLabel: "PSM 6 | por+eng | preprocessing padrão",
  },
  {
    id: "C",
    name: "PSM 3 + Threshold Otsu",
    description: "Binarização Otsu após grayscale (preto/branco puro)",
    configLabel: "PSM 3 | por+eng | threshold Otsu",
  },
  {
    id: "D",
    name: "PSM 3 + Upscale 3x",
    description: "Upscale para 3000px (maior resolução bruta)",
    configLabel: "PSM 3 | por+eng | upscale 3000px",
  },
  {
    id: "E",
    name: "PSM 3 + Threshold + Upscale 3x",
    description: "Binarização Otsu + upscale maior combinados",
    configLabel: "PSM 3 | por+eng | threshold + upscale 3000px",
  },
  {
    id: "F",
    name: "Linha a linha PSM 7",
    description: "Detecta linhas via baseline, lê cada linha individualmente com PSM 7",
    configLabel: "PSM 7 (linha) | por+eng | rectangle individual",
  },
  {
    id: "G",
    name: "PSM 11 SPARSE_TEXT",
    description: "Busca texto sem assumir ordem de layout",
    configLabel: "PSM 11 | por+eng | preprocessing padrão",
  },
  {
    id: "H",
    name: "PSM 3 + preserve_interword_spaces",
    description: "Preserva espaços entre palavras (evita normalização do Tesseract)",
    configLabel: "PSM 3 | por+eng | preserve_interword_spaces=1",
  },
];

export const STRATEGY_CONFIGS: Record<string, StrategyConfig> = {
  A: {
    lang: "por+eng",
    psm: "3",
    oem: undefined,
    params: {},
    preprocessVariant: "default",
  },
  B: {
    lang: "por+eng",
    psm: "6",
    oem: undefined,
    params: {},
    preprocessVariant: "default",
  },
  C: {
    lang: "por+eng",
    psm: "3",
    oem: undefined,
    params: {},
    preprocessVariant: "threshold",
  },
  D: {
    lang: "por+eng",
    psm: "3",
    oem: undefined,
    params: {},
    preprocessVariant: "upscale3x",
  },
  E: {
    lang: "por+eng",
    psm: "3",
    oem: undefined,
    params: {},
    preprocessVariant: "threshold+upscale3x",
  },
  F: {
    lang: "por+eng",
    psm: "7",
    oem: undefined,
    params: {},
    preprocessVariant: "default",
  },
  G: {
    lang: "por+eng",
    psm: "11",
    oem: undefined,
    params: {},
    preprocessVariant: "default",
  },
  H: {
    lang: "por+eng",
    psm: "3",
    oem: undefined,
    params: { preserve_interword_spaces: "1" },
    preprocessVariant: "default",
  },
};
