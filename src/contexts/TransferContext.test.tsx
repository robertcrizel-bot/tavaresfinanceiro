import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransferProvider, useTransfers, type Transfer } from "@/contexts/TransferContext";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  from: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  delete: vi.fn(),
  deleteEq: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const input = {
  fromAccountId: "account-a",
  toAccountId: "account-b",
  amount: 200,
  date: "2026-09-11",
  description: "Reserva",
};

const savedTransfer: Transfer = {
  ...input,
  id: "transfer-1",
  createdAt: "2026-09-11T12:00:00Z",
};

describe("TransferContext", () => {
  let context: ReturnType<typeof useTransfers> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    context = null;
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.delete.mockReturnValue({ eq: mocks.deleteEq });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "transfers") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({ order: mocks.order }),
        insert: mocks.insert,
        update: mocks.update,
        delete: mocks.delete,
      };
    });
  });

  const renderProvider = async () => {
    const Consumer = () => {
      context = useTransfers();
      return null;
    };
    render(<TransferProvider><Consumer /></TransferProvider>);
    await waitFor(() => expect(context?.loading).toBe(false));
  };

  it("creates, updates and deletes only one transfer row per operation", async () => {
    await renderProvider();

    await act(async () => { await context?.addTransfer(input); });
    await act(async () => { await context?.updateTransfer({ ...savedTransfer, amount: 300 }); });
    await act(async () => { await context?.deleteTransfer(savedTransfer.id); });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "transfer-1");
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", "transfer-1");
    expect(mocks.from.mock.calls.every(([table]) => table === "transfers")).toBe(true);
  });

  it("blocks equal source and destination before persistence", async () => {
    await renderProvider();

    await act(async () => {
      await context?.addTransfer({ ...input, toAccountId: input.fromAccountId });
      await context?.updateTransfer({ ...savedTransfer, toAccountId: input.fromAccountId });
    });

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Transferência inválida" }));
  });

  it("prevents concurrent submissions from inserting the same operation twice", async () => {
    await renderProvider();
    let finishInsert: (value: { error: null }) => void = () => {};
    mocks.insert.mockReturnValue(new Promise((resolve) => { finishInsert = resolve; }));

    let firstSubmission: Promise<void> | undefined;
    await act(async () => {
      firstSubmission = context?.addTransfer(input);
      await context?.addTransfer(input);
    });

    expect(mocks.insert).toHaveBeenCalledTimes(1);

    finishInsert({ error: null });
    await act(async () => { await firstSubmission; });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
