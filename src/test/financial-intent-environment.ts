import { vi } from "vitest";

export function installIntentEnvironment() {
  localStorage.clear();
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator,"locks",{configurable:true,value:{
    request: <T>(key: string, task: () => Promise<T>) => {
      const next = (queues.get(key) ?? Promise.resolve()).catch(()=>{}).then(task);
      queues.set(key,next); return next;
    },
  }});
  let sequence = 0;
  vi.stubGlobal("crypto",{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`});
}
