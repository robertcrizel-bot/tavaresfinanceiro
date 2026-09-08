import { compressImageFile } from "@/lib/image-compression";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedReceipt {
  is_receipt: boolean;
  type: "income" | "expense" | "unknown";
  amount: number | null;
  date: string | null;
  time: string | null;
  counterparty: string | null;
  institution: string | null;
  payment_method: string;
  category_hint: string | null;
  receipt_id: string | null;
  title: string | null;
  notes: string | null;
  low_confidence_fields: string[];
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

async function pdfFirstPageToJpeg(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 1400 / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas indisponível");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  canvas.width = 0;
  canvas.height = 0;
  await pdf.destroy();
  if (!blob) throw new Error("falha ao converter PDF");
  return new File([blob], file.name.replace(/\.pdf$/i, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
}

/** Turns an uploaded receipt (image or PDF) into a compact JPEG data URL suitable for AI reading. */
export async function receiptToImageDataUrl(file: File): Promise<string> {
  let imageFile = file;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    imageFile = await pdfFirstPageToJpeg(file);
  }
  const compressed = await compressImageFile(imageFile, { maxDimension: 1400, quality: 0.82 });
  return blobToDataUrl(compressed);
}

export async function parseReceipt(
  file: File,
  context: { categories: string[]; accounts: string[] },
): Promise<ParsedReceipt> {
  const imageDataUrl = await receiptToImageDataUrl(file);
  const { data, error } = await supabase.functions.invoke("parse-receipt", {
    body: { imageDataUrl, categories: context.categories, accounts: context.accounts },
  });

  if (error) {
    let message = "Não foi possível ler o comprovante agora.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(message);
  }

  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as ParsedReceipt;
}

const normalize = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function matchByName<T extends { id: string; name: string; bank: string }>(
  items: T[],
  institution: string | null,
): T | undefined {
  if (!institution) return undefined;
  const target = normalize(institution);
  return items.find((i) => {
    const bank = normalize(i.bank);
    const name = normalize(i.name);
    return target.includes(bank) || bank.includes(target) || target.includes(name) || name.includes(target);
  });
}

export function matchCategory(categories: string[], hint: string | null): string | undefined {
  if (!hint) return undefined;
  const target = normalize(hint);
  return categories.find((c) => normalize(c) === target) ?? categories.find((c) => normalize(c).includes(target));
}
