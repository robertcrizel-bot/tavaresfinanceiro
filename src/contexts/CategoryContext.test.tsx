import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryProvider, useCategories } from "@/contexts/CategoryContext";
import { subscribeCategoryChanges } from "@/lib/category-refresh";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  order: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  deleteEq: vi.fn(),
  toast: vi.fn(),
  rpc: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ order: mocks.order }),
      insert: mocks.insert,
      update: mocks.update,
      delete: () => ({ eq: mocks.deleteEq }),
    }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

describe("CategoryContext monthly budget", () => {
  let context: ReturnType<typeof useCategories> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    context = null;
    mocks.rows = [{
      id: "category-1",
      name: "Alimentação",
      type: "expense",
      monthly_budget: 1000,
    }];
    mocks.order.mockImplementation(async () => ({ data: mocks.rows, error: null }));
    mocks.insert.mockResolvedValue({ error: null });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.deleteEq.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  const renderProvider = async () => {
    const Consumer = () => {
      context = useCategories();
      return null;
    };
    render(<CategoryProvider><Consumer /></CategoryProvider>);
    await waitFor(() => expect(context?.loading).toBe(false));
  };

  it("hydrates categories with and without a monthly budget", async () => {
    mocks.rows.push({ id: "category-2", name: "Salário", type: "income", monthly_budget: null });

    await renderProvider();

    expect(context?.categories).toEqual([
      { id: "category-1", name: "Alimentação", type: "expense", monthlyBudget: 1000 },
      { id: "category-2", name: "Salário", type: "income", monthlyBudget: null },
    ]);
  });

  it("stores a positive budget for an expense category", async () => {
    await renderProvider();

    await act(async () => { await context?.addCategory("Moradia", "expense", 1500); });

    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "Moradia",
      type: "expense",
      monthly_budget: 1500,
    });
  });

  it("forces the budget to null for an income category", async () => {
    await renderProvider();

    await act(async () => { await context?.addCategory("Salário", "income", 900); });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ monthly_budget: null }));
  });

  it("clears an existing budget when changing from expense to income", async () => {
    await renderProvider();

    await act(async () => { await context?.updateCategory("category-1", "Alimentação", "income", 1000); });

    expect(mocks.rpc).toHaveBeenCalledWith("update_category_with_references", {
      p_id: "category-1", p_name: "Alimentação", p_type: "income", p_monthly_budget: null,
    });
  });

  it("awaits dependent data refresh before confirming a successful rename", async () => {
    await renderProvider();
    let finish!: () => void;
    const refreshed = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const unsubscribe = subscribeCategoryChanges(refreshed);
    try {
      let pending!: Promise<boolean>;
      await act(async () => { pending = context!.updateCategory("category-1", "Saúde/Farmácia", "expense", 1000); });
      expect(refreshed).toHaveBeenCalledOnce();
      expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Categoria atualizada" }));
      await act(async () => { finish(); expect(await pending).toBe(true); });
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Categoria atualizada" }));
      expect(mocks.update).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });

  it("returns false and never refreshes or reports success after RPC failure", async () => {
    await renderProvider();
    mocks.rpc.mockResolvedValueOnce({ error: { message: "Conflict", code: "23505" } });
    const listener = vi.fn(async () => {});
    const unsubscribe = subscribeCategoryChanges(listener);
    try {
      await act(async () => { expect(await context!.updateCategory("category-1", "Other", "expense")).toBe(false); });
      expect(listener).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
      expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Categoria atualizada" }));
    } finally { unsubscribe(); }
  });

  it("does not invent a replacement when deleting an in-use category", async () => {
    await renderProvider();
    mocks.rpc.mockResolvedValueOnce({ error: { message: "Choose replacement", code: "23503" } });
    await act(async () => { expect(await context!.deleteCategory("category-1")).toBe(false); });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_category_with_replacement", { p_id: "category-1", p_replacement_id: null });
    expect(mocks.deleteEq).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Categoria excluída" }));
  });

  it("only sends the replacement explicitly supplied by the user", async () => {
    await renderProvider();
    await act(async () => { expect(await context!.deleteCategory("category-1", "replacement-1")).toBe(true); });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_category_with_replacement", { p_id: "category-1", p_replacement_id: "replacement-1" });
  });
});

describe("CategoryContext shared category lists", () => {
  let context: ReturnType<typeof useCategories> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    context = null;
    mocks.rows = [
      { id: "category-1", name: "Alimentação", type: "expense", monthly_budget: null },
      { id: "category-2", name: "Salário", type: "income", monthly_budget: null },
      { id: "category-3", name: "Outros", type: "both", monthly_budget: null },
    ];
    mocks.order.mockImplementation(async () => ({ data: mocks.rows, error: null }));
  });

  const renderProvider = async () => {
    const Consumer = () => {
      context = useCategories();
      return null;
    };
    render(<CategoryProvider><Consumer /></CategoryProvider>);
    await waitFor(() => expect(context?.loading).toBe(false));
  };

  it("includes a both-type category such as Outros in expense and income lists", async () => {
    await renderProvider();

    expect(context?.getCategoriesByType("expense")).toEqual(["Alimentação", "Outros"]);
    expect(context?.getCategoriesByType("income")).toEqual(["Salário", "Outros"]);
  });

  it("deduplicates UI names across types, casing, whitespace and Unicode without changing records", async () => {
    mocks.rows.push(
      { id: "duplicate-1", name: "Alimenta\u00e7\u00e3o", type: "expense", monthly_budget: 25 },
      { id: "duplicate-2", name: " alimentac\u0327a\u0303o ", type: "both", monthly_budget: null },
      { id: "duplicate-3", name: "Outros", type: "income", monthly_budget: null },
    );
    await renderProvider();
    expect(context?.allCategoryNames).toEqual(["Alimenta\u00e7\u00e3o", "Sal\u00e1rio", "Outros"]);
    expect(context?.getCategoriesByType("expense")).toEqual(["Alimenta\u00e7\u00e3o", "Outros"]);
    expect(context?.getCategoriesByType("income")).toEqual(["Sal\u00e1rio", "Outros", " alimentac\u0327a\u0303o "]);
    expect(context?.categories).toHaveLength(6);
    expect(context?.categories.find(c => c.id === "duplicate-1")?.monthlyBudget).toBe(25);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });
});
