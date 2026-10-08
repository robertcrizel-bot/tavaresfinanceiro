import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptImport from "@/pages/ReceiptImport";
import { buildPaddleReceiptResult } from "@/lib/ocr-paddle-test/receiptResult";
import { paddleToParsedReceipt } from "@/lib/ocr-paddle-test/paddleToParsedReceipt";
import { formatReceiptDescription } from "@/lib/receipt-description";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  fastOcrRecognize: vi.fn(),
  paddleRecognize: vi.fn(),
  takeSharedReceiptWithDiagnostics: vi.fn(),
  disposePaddleRecognizer: vi.fn(),
  prepareReceiptForLocalOcr: vi.fn(),
  receiptToImageDataUrl: vi.fn(),
  releaseDocumentOrientationSession: vi.fn(),
  duplicateLimit: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ addTransaction: mocks.addTransaction, transactions: [] }),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({ accounts: [], creditCards: [] }),
}));
vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({
    allCategoryNames: ["Alimentação", "Outros"],
    categories: [],
    getCategoriesByType: () => ["Alimentação", "Outros"],
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/shared-receipt", () => ({
  takeSharedReceiptWithDiagnostics: mocks.takeSharedReceiptWithDiagnostics,
  isShareWorkerOutdated: (version: unknown) => typeof version === "string" && version !== "share-v5",
}));
vi.mock("@/lib/receipt", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/receipt")>(),
  parseReceipt: vi.fn(),
  receiptToImageDataUrl: mocks.receiptToImageDataUrl,
  prepareReceiptForLocalOcr: mocks.prepareReceiptForLocalOcr,
}));
vi.mock("@/lib/ocr-paddle-test/recognize", () => ({
  paddleRecognize: mocks.paddleRecognize,
  disposePaddleRecognizer: mocks.disposePaddleRecognizer,
}));
vi.mock("@/lib/fast-ocr", () => ({ fastOcrRecognize: mocks.fastOcrRecognize }));
vi.mock("@/lib/receipt-image-orientation", () => ({
  correctDocumentOrientation: vi.fn(async (image: File) => image),
  releaseDocumentOrientationSession: mocks.releaseDocumentOrientationSession,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ limit: mocks.duplicateLimit }) }),
    }),
  },
}));
vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? <>{children}</> : null,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogDescription: Wrapper,
  };
});
vi.mock("@/components/ui/select", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Select: ({ children }: { children?: ReactNode }) => <>{children}</>,
    SelectContent: Wrapper,
    SelectTrigger: Wrapper,
    SelectValue: () => null,
    SelectItem: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

function makeRegion(
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  confidence = 0.95,
): PaddleOcrRegion {
  return {
    text,
    confidence,
    bbox: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  };
}

const CREAMS = [
  "7898080640222 CREME LEITE OHT ITALAC 200G TP",
  "7898080640222 CREME LEITE UHI IIALAC 200G TP",
  "7898080640222 CREME LEITE UHT ITALAC 200G TP",
];

/**
 * Real Android geometry reported on the Fonseca cupom:
 * - item 13 = wafer morango (EAN 7896004009995) with block [13, 14];
 * - line 14 = the whole discount line "DESCONTO -30,18% R$-0,86";
 * - three creams (EAN 7898080640222) where only the first carries the price
 *   read by the OCR (2,75) and the others are filled by EAN propagation;
 * - wafer chocolate keeps its explicit 2,85 -> 1,99 promotional pair;
 * - a weight item without price keeps item_values_are_final false, exactly
 *   like the real receipt.
 */
function androidRegions(): PaddleOcrRegion[] {
  const regions: PaddleOcrRegion[] = [
    makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
  ];
  for (let i = 0; i < 12; i++) {
    const y = 130 + i * 30;
    regions.push(makeRegion(`78910000000000${i} PRODUTO TESTE ${i}`, 111, y, 420, 16));
    regions.push(makeRegion("1UN", 600, y, 40, 12));
    regions.push(makeRegion("9,90", 700, y, 50, 12));
  }

  regions.push(
    makeRegion("7896004009995 BISC WAFER MINUETO 81GR MORANGO 1UN", 111, 500, 480, 16),
  );
  regions.push(makeRegion("DESCONTO -30,18% R$-0,86", 236, 516, 474, 12));

  CREAMS.forEach((cream, index) => {
    const y = 560 + index * 30;
    regions.push(makeRegion(cream, 111, y, 480, 16));
    regions.push(makeRegion("1UN", 600, y, 40, 12));
    if (index === 0) regions.push(makeRegion("2,75", 700, y, 50, 12));
  });

  regions.push(
    makeRegion("7896004009988 BISC WAFER MINUETO 81GR CHOCOLATE 1UN", 111, 660, 480, 16),
  );
  regions.push(makeRegion("1UN", 600, 676, 40, 12));
  regions.push(makeRegion("2,85", 700, 676, 50, 12));
  regions.push(makeRegion("DESCONTO", 236, 692, 90, 12));
  regions.push(makeRegion("-30,18%", 640, 706, 70, 12));
  regions.push(makeRegion("R$-0,86", 640, 720, 70, 12));
  regions.push(makeRegion("1,99", 700, 734, 50, 12));

  regions.push(makeRegion("977 BETERRABA kg", 111, 760, 300, 16));
  regions.push(makeRegion("0.742KG", 600, 760, 80, 12));

  regions.push(makeRegion("Qtde. Total de Itens", 10, 800, 240, 12));
  regions.push(makeRegion("Valor a Pagar R$", 10, 830, 240, 12));
  regions.push(makeRegion("88,38", 700, 830, 60, 12));
  return regions;
}

function itemsWith(description: string) {
  const result = buildPaddleReceiptResult(androidRegions());
  return result.items.filter((item) => (item.description ?? "").includes(description));
}

describe("mobile OCR values reach the TransactionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.disposePaddleRecognizer.mockResolvedValue(undefined);
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({
      file: null,
      diag: null,
    });
    mocks.releaseDocumentOrientationSession.mockResolvedValue(undefined);
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    mocks.prepareReceiptForLocalOcr.mockImplementation(async (file: File) => ({
      image: file,
      metrics: {
        originalDimensions: { width: 3000, height: 4000 },
        outputDimensions: { width: 1200, height: 1600 },
        originalPixels: 1,
        outputPixels: 1,
        largestRgbaSurfaceBytes: 1,
        estimatedOrientationPeakRgbaBytes: 1,
        inputFileBytes: file.size,
        outputFileBytes: file.size,
        preparationMs: 10,
        orientationMs: 10,
        totalMs: 20,
      },
    }));
    mocks.fastOcrRecognize.mockResolvedValue({
      regions: androidRegions(),
      rawLines: [],
      initializationMs: 10,
      ocrMs: 20,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps 2,75 for the three creams after buildPaddleReceiptResult", () => {
    const creams = itemsWith("CREME LEITE");
    expect(creams).toHaveLength(3);
    expect(creams.map((item) => item.effectiveValue)).toEqual([2.75, 2.75, 2.75]);
  });

  it("keeps 1,99 for the discounted wafers after buildPaddleReceiptResult", () => {
    const morango = itemsWith("81GR MORANGO");
    expect(morango).toHaveLength(1);
    expect(morango[0].originalTotal).toBe(2.85);
    expect(morango[0].explicitFinalValue).toBe(1.99);
    expect(morango[0].effectiveValue).toBe(1.99);

    const chocolate = itemsWith("81GR CHOCOLATE");
    expect(chocolate).toHaveLength(1);
    expect(chocolate[0].effectiveValue).toBe(1.99);
  });

  it("carries the item values through paddleToParsedReceipt and the description source", () => {
    const parsed = paddleToParsedReceipt(buildPaddleReceiptResult(androidRegions()));

    expect(parsed.item_values_are_final).toBe(false);
    expect(
      (parsed.purchased_items ?? [])
        .filter((item) => item.name.includes("CREME LEITE"))
        .map((item) => item.total),
    ).toEqual([2.75, 2.75, 2.75]);
    expect(
      (parsed.purchased_items ?? []).find((item) => item.name.includes("MORANGO"))?.total,
    ).toBe(1.99);

    const description = formatReceiptDescription(parsed, true) ?? "";
    for (const cream of CREAMS) {
      expect(description).toContain(`${cream.replace(/^7898080640222 /, "")} — R$ 2,75`);
    }
    expect(description).toContain("BISC WAFER MINUETO 81GR MORANGO 1UN — R$ 1,99");
    expect(description).toContain("BISC WAFER MINUETO 81GR CHOCOLATE 1UN — R$ 1,99");
  });

  it("shows every item value in the form opened by 'Ler gratuitamente'", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["receipt"], "android-fonseca.jpg", { type: "image/jpeg" });

    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: "Ler gratuitamente" }));

    await waitFor(() =>
      expect(mocks.fastOcrRecognize).toHaveBeenCalledWith(file, expect.any(Function)),
    );

    const textarea = (await screen.findByPlaceholderText("Detalhes...")) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain("CREME LEITE"));

    for (const cream of CREAMS) {
      const name = cream.replace(/^7898080640222 /, "");
      expect(textarea.value).toContain(`${name} — R$ 2,75`);
    }
    expect(textarea.value).toContain("BISC WAFER MINUETO 81GR MORANGO 1UN — R$ 1,99");
    expect(textarea.value).toContain("BISC WAFER MINUETO 81GR CHOCOLATE 1UN — R$ 1,99");

    fireEvent.click(screen.getByRole("button", { name: "Salvar registro" }));

    await waitFor(() => expect(mocks.addTransaction).toHaveBeenCalledTimes(1));
    const [data] = mocks.addTransaction.mock.calls[0];
    const description = String(data.description ?? "");
    for (const cream of CREAMS) {
      const name = cream.replace(/^7898080640222 /, "");
      expect(description).toContain(`${name} — R$ 2,75`);
    }
    expect(description).toContain("BISC WAFER MINUETO 81GR MORANGO 1UN — R$ 1,99");
    expect(description).toContain("BISC WAFER MINUETO 81GR CHOCOLATE 1UN — R$ 1,99");
  });
});
