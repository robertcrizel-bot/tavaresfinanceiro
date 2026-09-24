import type { LabResult, LabReport } from "./types";
import { STRATEGIES, STRATEGY_CONFIGS } from "./types";

export function buildLabReports(results: LabResult[]): LabReport[] {
  return results.map((r) => {
    const strategy = STRATEGIES.find((s) => s.id === r.strategyId);
    const config = STRATEGY_CONFIGS[r.strategyId];
    const lines = r.text ? r.text.split("\n") : [];
    return {
      strategyId: r.strategyId,
      strategyName: r.strategyName,
      configLabel: strategy?.configLabel ?? config?.preprocessVariant ?? "",
      confidence: r.confidence,
      timeMs: r.timeMs,
      text: r.text,
      lineCount: lines.length,
      charCount: r.text.length,
      error: r.error,
    };
  });
}

export function formatLabReport(reports: LabReport[]): string {
  const now = new Date().toISOString().split("T")[0];
  const parts: string[] = [];

  parts.push(`=== RELATÓRIO DO LABORATÓRIO OCR ===`);
  parts.push(`Data: ${now}`);
  parts.push(`Total de estratégias: ${reports.length}`);
  parts.push("");

  for (const r of reports) {
    parts.push(`--- ${r.strategyId}: ${r.strategyName} ---`);
    parts.push(`Config: ${r.configLabel}`);
    if (r.error) {
      parts.push(`Erro: ${r.error}`);
    } else {
      parts.push(`Confiança: ${r.confidence}% | Tempo: ${(r.timeMs / 1000).toFixed(1)}s`);
      parts.push(`Linhas: ${r.lineCount} | Caracteres: ${r.charCount}`);
    }
    parts.push("");
    parts.push(r.text || "(sem texto)");
    parts.push("");
  }

  parts.push(`=== FIM ===`);
  return parts.join("\n");
}

export async function copyLabReport(results: LabResult[]): Promise<boolean> {
  const reports = buildLabReports(results);
  const text = formatLabReport(reports);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
