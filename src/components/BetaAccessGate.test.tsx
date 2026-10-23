import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BetaAccessGate } from "@/components/BetaAccessGate";

const mocks=vi.hoisted(()=>({
  rpc:vi.fn(),
  from:vi.fn(),
  signOut:vi.fn(),
  user:{id:"test-owner"},
}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mocks.rpc,from:mocks.from}}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({
  user:mocks.user,signOut:mocks.signOut,
})}));

describe("closed beta frontend access check",()=>{
  beforeEach(()=>{vi.clearAllMocks();});
  const renderGate=()=>render(<MemoryRouter><BetaAccessGate><p>Financial data loaded</p></BetaAccessGate></MemoryRouter>);
  it("loads protected components only after a verified boolean from the server",async()=>{
    let resolve!: (r:{data:boolean;error:null})=>void;
    mocks.rpc.mockReturnValue(new Promise(r=>{resolve=r;}));
    renderGate();
    expect(screen.queryByText("Financial data loaded")).toBeNull();
    resolve({data:true,error:null});
    await waitFor(()=>expect(screen.getByText("Financial data loaded")).toBeTruthy());
    expect(mocks.rpc).toHaveBeenCalledWith("beta_has_access");
  });
  it("does not mount financial views for an unpaid beta account",async()=>{
    mocks.rpc.mockResolvedValue({data:false,error:null});
    renderGate();
    await screen.findByText("Acesso à beta pendente");
    expect(screen.queryByText("Financial data loaded")).toBeNull();
  });
  it("a beta request is created for this account without unlocking any financial view",async()=>{
    mocks.rpc.mockResolvedValue({data:false,error:null});
    const insert=vi.fn().mockResolvedValue({error:null});
    mocks.from.mockReturnValue({insert});
    renderGate();
    await screen.findByText("Acesso à beta pendente");
    fireEvent.click(screen.getByText("Solicitar análise de acesso"));
    await screen.findByText("Solicitação registrada");
    expect(mocks.from).toHaveBeenCalledWith("beta_access_requests");
    expect(insert).toHaveBeenCalledWith({user_id:"test-owner"});
    expect(screen.queryByText("Financial data loaded")).toBeNull();
  });
  it("a duplicated pending beta request is acknowledged but never grants access",async()=>{
    mocks.rpc.mockResolvedValue({data:false,error:null});
    const insert=vi.fn().mockResolvedValue({error:{code:"23505"}});
    mocks.from.mockReturnValue({insert});
    renderGate();
    await screen.findByText("Acesso à beta pendente");
    fireEvent.click(screen.getByText("Solicitar análise de acesso"));
    await screen.findByText("Solicitação registrada");
    expect(screen.queryByText("Financial data loaded")).toBeNull();
  });
  it("fails closed when RPC fails instead of treating an error as permission",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:"network"}});
    renderGate();
    await screen.findByText("Não foi possível verificar seu acesso");
    expect(screen.queryByText("Financial data loaded")).toBeNull();
  });
});
