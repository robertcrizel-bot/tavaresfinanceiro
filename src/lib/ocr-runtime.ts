import * as ort from "onnxruntime-web";
import ortWasmMjsUrl from "@/lib/ocr-paddle-test/runtime/ort-wasm-simd-threaded.jsep.mjs?url";

export const ORT_WASM_PATHS = {
  mjs: ortWasmMjsUrl,
  wasm: "/ort-wasm/ort-wasm-simd-threaded.jsep.wasm",
} as const;

let configured = false;

export function configureOrtWasm() {
  if (configured) return;
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
  ort.env.wasm.proxy = false;
  configured = true;
}
