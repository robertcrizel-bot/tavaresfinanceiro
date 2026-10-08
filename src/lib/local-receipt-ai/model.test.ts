import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_RECEIPT_MAX_NEW_TOKENS,
  LOCAL_RECEIPT_TIMEOUT_MESSAGE,
  resetLocalReceiptModelState,
  runLocalReceiptModel,
} from "@/lib/local-receipt-ai";

interface FakeWorker {
  postMessage: (message: { id: number; prompt: string }) => void;
  terminate: () => void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

function stubWorker() {
  const calls: { id: number; prompt: string }[] = [];
  const worker: FakeWorker = {
    postMessage: (message) => {
      calls.push(message);
    },
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
  return { worker, calls };
}

function respond(worker: FakeWorker, id: number, body: Record<string, unknown>) {
  worker.onmessage?.({ data: { id, ...body } });
}

describe("runLocalReceiptModel", () => {
  afterEach(() => {
    resetLocalReceiptModelState();
    vi.restoreAllMocks();
  });

  it("keeps max_new_tokens aggressively low for short receipt JSON", () => {
    expect(LOCAL_RECEIPT_MAX_NEW_TOKENS).toBeLessThanOrEqual(384);
  });

  it("resolves with model output and keeps the worker alive for the next run", async () => {
    const { worker, calls } = stubWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);

    const first = runLocalReceiptModel("prompt-um", undefined, { createWorker, timeoutMs: 1000 });
    respond(worker, calls[0].id, {
      type: "result",
      text: '{"is_receipt":true}',
      backend: "wasm",
      initializationMs: 10,
      inferenceMs: 20,
      totalMs: 30,
    });
    const output = await first;
    expect(output.text).toBe('{"is_receipt":true}');
    expect(output.metrics.backend).toBe("wasm");
    expect(worker.terminate).not.toHaveBeenCalled();

    const second = runLocalReceiptModel("prompt-dois", undefined, { createWorker, timeoutMs: 1000 });
    respond(worker, calls[1].id, {
      type: "result",
      text: '{"is_receipt":false}',
      backend: "wasm",
      initializationMs: 0,
      inferenceMs: 5,
      totalMs: 5,
    });
    await second;
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(calls[1].prompt).toBe("prompt-dois");
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("terminates the worker and rejects on timeout", async () => {
    const { worker } = stubWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);

    await expect(runLocalReceiptModel("prompt-lento", undefined, { createWorker, timeoutMs: 40 }))
      .rejects.toThrow(LOCAL_RECEIPT_TIMEOUT_MESSAGE);
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    // The next run starts a fresh worker after the timeout kill.
    const fresh = stubWorker();
    createWorker.mockReturnValueOnce(fresh.worker as unknown as Worker);
    const retry = runLocalReceiptModel("prompt-novo", undefined, { createWorker, timeoutMs: 1000 });
    await vi.waitFor(() => expect(fresh.calls.length).toBe(1));
    respond(fresh.worker, fresh.calls[0].id, {
      type: "result",
      text: "{}",
      backend: "wasm",
      initializationMs: 1,
      inferenceMs: 1,
      totalMs: 2,
    });
    await expect(retry).resolves.toMatchObject({ text: "{}" });
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("rejects inference errors without killing the session", async () => {
    const { worker, calls } = stubWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);

    const failed = runLocalReceiptModel("prompt-erro", undefined, { createWorker, timeoutMs: 1000 });
    respond(worker, calls[0].id, { type: "error", message: "modelo indisponível" });
    await expect(failed).rejects.toThrow("modelo indisponível");
    expect(worker.terminate).not.toHaveBeenCalled();
  });
});
