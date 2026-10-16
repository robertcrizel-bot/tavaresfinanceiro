import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserIntentEnvironment,executeFinancialIntent,resumeFinancialIntents } from "./financial-intents";
import { installIntentEnvironment } from "@/test/financial-intent-environment";

describe("persistent financial intentions",()=>{
  beforeEach(installIntentEnvironment);
  const args={p_bill_id:"b",p_reference_month:"2026-10",p_overrides:{amount:10}};
  const result={payment_id:"p",transaction_id:"t"};
  it("persists before sending and replays the same request after reload and lost response",async()=>{
    const rpc=vi.fn().mockImplementationOnce(async()=>{expect(localStorage.length).toBe(1);throw Error("lost");})
      .mockResolvedValue({data:result,error:null});
    await expect(executeFinancialIntent(browserIntentEnvironment(),"u","forecast:b:2026-10","mark_forecast_payment",args,rpc)).rejects.toThrow("lost");
    await resumeFinancialIntents(browserIntentEnvironment(),"u",["mark_forecast_payment"],rpc);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);expect(localStorage.length).toBe(0);
  });
  it("blocks changing amount or operation until pending confirmation is resolved",async()=>{
    const rpc=vi.fn().mockRejectedValue(Error("lost"));const env=browserIntentEnvironment();
    await expect(executeFinancialIntent(env,"u","scope","mark_forecast_payment",args,rpc)).rejects.toThrow();
    await expect(executeFinancialIntent(env,"u","scope","mark_forecast_payment",{...args,p_overrides:{amount:11}},rpc)).rejects.toThrow("outros parâmetros");
    await expect(executeFinancialIntent(env,"u","scope","unmark_forecast_payment",args,rpc)).rejects.toThrow("outros parâmetros");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("replays original invoice version after refresh",async()=>{
    const rpc=vi.fn().mockRejectedValueOnce(Error("lost")).mockResolvedValue({data:{invoice_id:"i",total:10,obligation_id:"o"},error:null});
    const env=browserIntentEnvironment();const a={p_invoice_id:"i",p_expected_version:0};
    await expect(executeFinancialIntent(env,"u","invoice:i","close_credit_card_invoice_atomic",a,rpc)).rejects.toThrow();
    await executeFinancialIntent(env,"u","invoice:i","close_credit_card_invoice_atomic",{...a,p_expected_version:1},rpc);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it("does not recover another user's request",async()=>{
    const rpc=vi.fn().mockRejectedValue(Error("lost"));const env=browserIntentEnvironment();
    await expect(executeFinancialIntent(env,"u","scope","mark_forecast_payment",args,rpc)).rejects.toThrow();
    expect(await resumeFinancialIntents(env,"other",["mark_forecast_payment"],rpc)).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps missing/malformed success pending and never reports success",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:null,error:null});
    await expect(executeFinancialIntent(browserIntentEnvironment(),"u","s","mark_forecast_payment",args,rpc)).rejects.toThrow("não confirmada");
    expect(localStorage.length).toBe(1);
  });
  it("confirmed SQL rejection permits corrected request; deadlock keeps key",async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{code:"P0001",message:"invalid"}})
      .mockResolvedValueOnce({data:null,error:{code:"40P01",message:"deadlock"}}).mockResolvedValue({data:result,error:null});
    const env=browserIntentEnvironment();
    await expect(executeFinancialIntent(env,"u","s","mark_forecast_payment",args,rpc)).rejects.toThrow("invalid");
    expect(localStorage.length).toBe(0);
    await expect(executeFinancialIntent(env,"u","s","mark_forecast_payment",args,rpc)).rejects.toThrow("deadlock");
    await executeFinancialIntent(env,"u","s","mark_forecast_payment",args,rpc);
    expect(rpc.mock.calls[0][1].p_operation_id).not.toBe(rpc.mock.calls[1][1].p_operation_id);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[2]);
  });
  it("unavailable persistence fails before any financial write",async()=>{
    const env=browserIntentEnvironment();env.storage={...env.storage,setItem:()=>{throw Error("quota");},getItem:()=>null,removeItem:()=>{},key:()=>null,length:0};
    const rpc=vi.fn();await expect(executeFinancialIntent(env,"u","s","mark_forecast_payment",args,rpc)).rejects.toThrow("quota");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses financial writes when cross-tab locking is unavailable",()=>{
    Object.defineProperty(navigator,"locks",{configurable:true,value:undefined});
    expect(browserIntentEnvironment).toThrow("navegador");
  });
});
