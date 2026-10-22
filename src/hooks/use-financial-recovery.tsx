import { useCallback, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { resumeFinancialOperations } from "@/lib/financial-rpc";
import type { AtomicRpc } from "@/lib/financial-intents";

export function useFinancialRecovery(userId: string | undefined, names: AtomicRpc[], refresh: () => Promise<unknown>) {
  const latest = useRef({names,refresh});
  latest.current = {names,refresh};
  const recover = useCallback(async () => {
    if (!userId) return;
    try {
      const resumed = await resumeFinancialOperations(userId,latest.current.names);
      if (resumed) await latest.current.refresh();
    } catch (error) {
      toast({title:"Confirmação pendente",description:error instanceof Error ? error.message : "Tente confirmar novamente.",variant:"destructive",
        action:<ToastAction altText="Confirmar operações pendentes" onClick={()=>void recover()}>Confirmar pendentes</ToastAction>});
    }
  },[userId]);
  useEffect(()=>{void recover();},[recover]);
  return useCallback((title: string,error: unknown)=>{
    toast({title,description:error instanceof Error ? error.message : "Não foi possível confirmar. Retome a operação pendente.",variant:"destructive",
      action:<ToastAction altText="Confirmar operações pendentes" onClick={()=>void recover()}>Confirmar pendentes</ToastAction>});
  },[recover]);
}
