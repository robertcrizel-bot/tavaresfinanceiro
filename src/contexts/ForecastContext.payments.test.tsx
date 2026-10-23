import { act,render,waitFor,cleanup } from "@testing-library/react";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { ForecastProvider,useForecast } from "./ForecastContext";
import { installIntentEnvironment } from "@/test/financial-intent-environment";
const db=vi.hoisted(()=>({user:{id:"u"},from:vi.fn(),rpc:vi.fn(),toast:vi.fn(),refetch:vi.fn(),payments:[] as Record<string,unknown>[]}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:db.from,rpc:db.rpc,auth:{getSession:async()=>({data:{session:{user:db.user}},error:null})}}}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:db.user})}));
vi.mock("@/contexts/FinanceContext",()=>({useFinance:()=>({refetch:db.refetch})}));
vi.mock("@/hooks/use-toast",()=>({toast:db.toast}));
const bill={id:"b",name:"Conta",amount:100,type:"expense",category:"Outros",due_day:10,start_date:"2026-01-01",duration_months:null,account_id:null,description:null,scoped_edits:{}};
describe("Forecast atomic payment frontend",()=>{
 let context:ReturnType<typeof useForecast>;
 beforeEach(()=>{
  vi.clearAllMocks();installIntentEnvironment();db.payments=[];db.refetch.mockResolvedValue(undefined);
  db.from.mockImplementation((table:string)=>{
   if(table==="recurring_bills")return{select:()=>({order:async()=>({data:[bill]})})};
   if(table==="bill_payments")return{select:()=>({order:async()=>({data:db.payments})})};
   throw Error("Direct financial write or unexpected table: "+table);
  });
  db.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({data:name==="mark_forecast_payment"?{payment_id:"p",transaction_id:"t"}:{removed:true,payment_id:args.p_payment_id},error:null}));
 });
 async function mount(){function C(){context=useForecast();return null;}render(<ForecastProvider><C/></ForecastProvider>);await waitFor(()=>expect(context.loading).toBe(false));}
 const pay=()=>context.markAsPaid(context.bills[0],"2026-10");
 it("marks with one RPC, keeps overrides and never creates a separate link",async()=>{
  await mount();await act(async()=>{await context.markAsPaid(context.bills[0],"2026-10",{amount:120,paymentMethod:"Pix"});});
  expect(db.rpc).toHaveBeenCalledWith("mark_forecast_payment",{p_operation_id:expect.any(String),p_bill_id:"b",p_reference_month:"2026-10",p_overrides:{amount:120,paymentMethod:"Pix"}});
  expect(db.refetch).toHaveBeenCalled();
 });
 it("serializes simultaneous marks in the provider",async()=>{
  await mount();let resolve!:(v:unknown)=>void;db.rpc.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  let first!:Promise<void>;act(()=>{first=pay();});
  await act(async()=>{await pay();await new Promise(done=>setTimeout(done,0));resolve({data:{payment_id:"p",transaction_id:"t"},error:null});await first;});
  expect(db.rpc).toHaveBeenCalledTimes(1);
 });
 it("retains the same UUID after a lost response",async()=>{
  await mount();db.rpc.mockRejectedValueOnce(Error("lost"));
  await act(async()=>{await pay();});await act(async()=>{await pay();});
  expect(db.rpc.mock.calls[1]).toEqual(db.rpc.mock.calls[0]);
  expect(localStorage.length).toBe(0);
 });
 it("recovers a persisted mark after provider remount before allowing a new intention",async()=>{
  await mount();db.rpc.mockRejectedValueOnce(Error("lost"));await act(async()=>{await pay();});
  const original=db.rpc.mock.calls[0];cleanup();await mount();
  await waitFor(()=>expect(localStorage.length).toBe(0));expect(db.rpc.mock.calls[1]).toEqual(original);
 });
 it("does not show success for missing confirmation or rejection",async()=>{
  await mount();db.rpc.mockResolvedValueOnce({data:null,error:null});await act(async()=>{await pay();});
  expect(db.toast).not.toHaveBeenCalledWith(expect.objectContaining({title:"Conta paga!"}));expect(localStorage.length).toBe(1);
 });
 it("unmarks exact payment with one RPC, including a legacy null link for server validation",async()=>{
  db.payments=[{id:"p",recurring_bill_id:"b",reference_month:"2026-10",transaction_id:null}];await mount();
  await act(async()=>{await context.unmarkAsPaid("p");});
  expect(db.rpc).toHaveBeenCalledWith("unmark_forecast_payment",{p_operation_id:expect.any(String),p_bill_id:"b",p_payment_id:"p",p_reference_month:"2026-10"});
 });
 it("never attempts an unknown payment",async()=>{
  await mount();await act(async()=>{await context.unmarkAsPaid("unknown");});expect(db.rpc).not.toHaveBeenCalled();
 });
});
