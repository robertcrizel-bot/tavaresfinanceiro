// Persist the exact request before sending it; a lost response never creates a
// new intention. This module also runs against real Supabase in disposable CI.
export type AtomicRpc = "mark_forecast_payment" | "unmark_forecast_payment" | "close_credit_card_invoice_atomic";
export type IntentArgs = Record<string, unknown>;
type RpcError = { code?: string; message: string };
export type RpcCall = (name: AtomicRpc, args: IntentArgs) => PromiseLike<{ data: unknown; error: RpcError | null }>;
type Intent = { version: 1; userId: string; scope: string; name: AtomicRpc; args: IntentArgs; operationId: string };
export type IntentEnvironment = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
  lock: <T>(key: string, task: () => Promise<T>) => Promise<T>;
  uuid: () => string;
};
const prefix = "financecontrol:financial-intent:v1:";
const names: AtomicRpc[] = ["mark_forecast_payment", "unmark_forecast_payment", "close_credit_card_invoice_atomic"];
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function read(env: IntentEnvironment, key: string, userId: string): Intent | null {
  const raw = env.storage.getItem(key);
  if (!raw) return null;
  const intent = JSON.parse(raw) as Intent;
  if (intent.version !== 1 || intent.userId !== userId || !names.includes(intent.name)
    || !intent.operationId || !intent.scope || !intent.args || typeof intent.args !== "object") {
    throw new Error("Operação pendente inválida. Preserve os dados locais e solicite revisão.");
  }
  return intent;
}
function confirmed(name: AtomicRpc, data: unknown, args: IntentArgs): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const r = data as Record<string, unknown>;
  if (name === "mark_forecast_payment") return typeof r.payment_id === "string" && !!r.payment_id
    && typeof r.transaction_id === "string" && !!r.transaction_id;
  if (name === "unmark_forecast_payment") return typeof r.removed === "boolean" && r.payment_id === args.p_payment_id;
  return r.invoice_id === args.p_invoice_id && typeof r.total === "number" && Number.isFinite(r.total)
    && (r.obligation_id === null || typeof r.obligation_id === "string");
}
async function send(env: IntentEnvironment, key: string, intent: Intent, rpc: RpcCall) {
  const {data,error} = await rpc(intent.name,{...intent.args,p_operation_id:intent.operationId});
  if (error) {
    // These are confirmed rejections, not transport failures. A corrected request
    // may use a new key. Connection/timeout/deadlock errors keep the original key.
    if (/^(P0001|22...|23...|42...|PGRST\d+)$/.test(error.code ?? "")) env.storage.removeItem(key);
    throw new Error(error.message);
  }
  if (!confirmed(intent.name,data,intent.args)) throw new Error("Resposta não confirmada. Retome a operação pendente para conferir o resultado.");
  env.storage.removeItem(key);
  return data;
}
export function browserIntentEnvironment(): IntentEnvironment {
  if (!globalThis.navigator?.locks) throw new Error("Este navegador não permite confirmar operações com segurança. Use um navegador atualizado.");
  return {storage:globalThis.localStorage,uuid:()=>crypto.randomUUID(),
    lock:(key,task)=>navigator.locks.request(key,task)};
}
export async function executeFinancialIntent(env: IntentEnvironment, userId: string, scope: string,
  name: AtomicRpc, args: IntentArgs, rpc: RpcCall): Promise<unknown> {
  const key = `${prefix}${userId}:${encodeURIComponent(scope)}`;
  return env.lock(key,async()=>{
    let intent = read(env,key,userId);
    if (intent) {
      // A refreshed invoice version may reflect an already committed close.
      // Replay always uses the originally persisted expected version.
      const comparable = (a: IntentArgs) => name === "close_credit_card_invoice_atomic"
        ? Object.fromEntries(Object.entries(a).filter(([k])=>k!=="p_expected_version")) : a;
      if (intent.name !== name || canonical(comparable(intent.args)) !== canonical(comparable(args))) {
        throw new Error("Há uma operação pendente com outros parâmetros. Retome a confirmação antes de alterar os valores.");
      }
    } else {
      intent = {version:1,userId,scope,name,args:JSON.parse(JSON.stringify(args)),operationId:env.uuid()};
      env.storage.setItem(key,JSON.stringify(intent)); // fail closed if persistence is unavailable
      if (read(env,key,userId)?.operationId !== intent.operationId) throw new Error("Não foi possível guardar a confirmação.");
    }
    return send(env,key,intent,rpc);
  });
}
export async function resumeFinancialIntents(env: IntentEnvironment,userId: string, allowed: AtomicRpc[],rpc: RpcCall) {
  let resumed = 0;
  const keys = Array.from({length:env.storage.length},(_,i)=>env.storage.key(i))
    .filter((k): k is string=>!!k?.startsWith(`${prefix}${userId}:`));
  for (const key of keys) await env.lock(key,async()=>{
    const intent = read(env,key,userId);
    if (intent && allowed.includes(intent.name)) { await send(env,key,intent,rpc); resumed++; }
  });
  return resumed;
}
