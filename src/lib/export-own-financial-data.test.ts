import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOwnFinancialExport } from "@/lib/export-own-financial-data";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{table:string;user:string;first:number;last:number}>,
  failOn: null as string | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (_key: string, user: string) => ({
          order: () => ({
            range: async (first: number, last: number) => {
              mocks.calls.push({table,user,first,last});
              if (mocks.failOn === table) return {data: null,error: {message: "private details"}};
              const count = table === "transactions" ? 501 : 1;
              const data = Array.from({length: Math.max(0,Math.min(last,count - 1)-first+1)},
                (_,i) => ({id: `${table}-${first+i}`,user_id:user}));
              return {data,error:null};
            },
          }),
        }),
      }),
    }),
  },
}));

describe("Self-service financial export", () => {
  beforeEach(() => {
    mocks.calls.length=0;
    mocks.failOn=null;
  });

  it("exports every owned financial table, using pagination and without changing records", async () => {
    const result = await buildOwnFinancialExport("owner-1","owner@example.com");
    expect(result.exportVersion).toBe(1);
    expect(result.data.transactions).toHaveLength(501);
    expect(Object.keys(result.data)).toEqual([
      "profiles","accounts","credit_cards","categories","transactions",
      "transfers","recurring_bills","bill_payments","credit_card_invoices","transaction_attachments",
    ]);
    expect(mocks.calls).toContainEqual({table:"transactions",user:"owner-1",first:0,last:499});
    expect(mocks.calls).toContainEqual({table:"transactions",user:"owner-1",first:500,last:999});
    expect(mocks.calls.every(c=>c.user==="owner-1")).toBe(true);
    expect(result.notices.join(" ")).toMatch(/não inclui as imagens\/PDFs/);
    expect(result.account.email).toBe("owner@example.com");
  });

  it("does not return a partial export when any table query fails", async () => {
    mocks.failOn="bill_payments";
    await expect(buildOwnFinancialExport("owner-1")).rejects.toThrow(
      "Não foi possível exportar todos os registros desta conta.",
    );
  });
});
