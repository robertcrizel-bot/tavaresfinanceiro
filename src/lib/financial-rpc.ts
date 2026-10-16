import { supabase } from "@/integrations/supabase/client";
import { browserIntentEnvironment, executeFinancialIntent, resumeFinancialIntents, type AtomicRpc, type IntentArgs, type RpcCall } from "./financial-intents";

const callFor = (userId: string): RpcCall => async (name,args) => {
  const {data,error} = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId) throw new Error("A sessão mudou. Entre novamente para confirmar a operação pendente.");
  return supabase.rpc(name,args as never);
};
export const runFinancialOperation = (userId: string,scope: string,name: AtomicRpc,args: IntentArgs) =>
  executeFinancialIntent(browserIntentEnvironment(),userId,scope,name,args,callFor(userId));
export const resumeFinancialOperations = (userId: string,names: AtomicRpc[]) =>
  resumeFinancialIntents(browserIntentEnvironment(),userId,names,callFor(userId));
