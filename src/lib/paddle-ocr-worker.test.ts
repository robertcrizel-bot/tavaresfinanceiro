import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PADDLE_OCR_TIMEOUT_MESSAGE,
  PADDLE_OCR_TIMEOUT_MS,
  paddleRecognizeWorker,
} from "@/lib/paddle-ocr-worker";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

const createWorker = () => {
  const worker = new FakeWorker();
  return worker as unknown as Worker;
};

function makeFile(): File {
  const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
  file.arrayBuffer = async () => new ArrayBuffer(8);
  return file;
}

const lastWorker = async () => {
  await vi.waitFor(() => expect(FakeWorker.instances.length).toBeGreaterThan(0));
  return FakeWorker.instances[FakeWorker.instances.length - 1];
};

function resultPayload(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "result",
    regions: [{ text: "PAO FRANCES", confidence: 0.99, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] }],
    text: "PAO FRANCES",
    confidence: 0.99,
    initializationMs: 100,
    ocrMs: 200,
    detectedBoxes: 1,
    recognizedCount: 1,
    ...overrides,
  };
}

describe("paddleRecognizeWorker", () => {
  afterEach(() => {
    FakeWorker.instances = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses a 35s safety timeout", () => {
    expect(PADDLE_OCR_TIMEOUT_MS).toBe(35_000);
  });

  it("returns regions and terminates the worker after success", async () => {
    const file = makeFile();
    const onProgress = vi.fn();
    const pending = paddleRecognizeWorker(file, onProgress, { createWorker, timeoutMs: 1000 });
    const worker = await lastWorker();
    expect(worker.posted).toHaveLength(1);
    expect((worker.posted[0] as { image: unknown }).image).toBeInstanceOf(ArrayBuffer);

    worker.onmessage?.({ data: { id: 1, type: "progress", message: "Carregando OCR..." } });
    expect(onProgress).toHaveBeenCalledWith("Carregando OCR...");
    worker.onmessage?.({ data: resultPayload(1) });

    const outcome = await pending;
    expect(outcome.regions).toHaveLength(1);
    expect(outcome.regions[0]).toMatchObject({ text: "PAO FRANCES", confidence: 0.99 });
    expect(outcome.text).toBe("PAO FRANCES");
    expect(outcome.initializationMs).toBe(100);
    expect(outcome.ocrMs).toBe(200);
    expect(worker.terminated).toBe(true);
  });

  it("terminates the worker after an error message", async () => {
    const file = makeFile();
    const pending = paddleRecognizeWorker(file, undefined, { createWorker, timeoutMs: 1000 });
    const worker = await lastWorker();
    worker.onmessage?.({ data: { id: 1, type: "error", message: "Falha no OCR." } });
    await expect(pending).rejects.toThrow("Falha no OCR.");
    expect(worker.terminated).toBe(true);
  });

  it("terminates the worker after a worker-level error", async () => {
    const file = makeFile();
    const pending = paddleRecognizeWorker(file, undefined, { createWorker, timeoutMs: 1000 });
    const worker = await lastWorker();
    worker.onerror?.({ message: "Falha no worker do OCR." });
    await expect(pending).rejects.toThrow("Falha no worker do OCR.");
    expect(worker.terminated).toBe(true);
  });

  it("terminates the worker and keeps a clear message after timeout", async () => {
    const file = makeFile();
    const pending = paddleRecognizeWorker(file, undefined, { createWorker, timeoutMs: 30 });
    const assertion = expect(pending).rejects.toThrow(PADDLE_OCR_TIMEOUT_MESSAGE);
    const worker = await lastWorker();
    await assertion;
    expect(worker.terminated).toBe(true);
  });

  it("creates one worker per read", async () => {
    const file = makeFile();
    const first = paddleRecognizeWorker(file, undefined, { createWorker, timeoutMs: 1000 });
    (await lastWorker()).onmessage?.({ data: resultPayload(1) });
    await first;
    const second = paddleRecognizeWorker(file, undefined, { createWorker, timeoutMs: 1000 });
    await vi.waitFor(() => expect(FakeWorker.instances.length).toBe(2));
    FakeWorker.instances[1].onmessage?.({ data: resultPayload(2) });
    await second;
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances.every((worker) => worker.terminated)).toBe(true);
  });
});
