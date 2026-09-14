import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryProvider, useCategories } from "@/contexts/CategoryContext";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  order: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  deleteEq: vi.fn(),
  toast: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
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

    expect(mocks.update).toHaveBeenCalledWith({
      name: "Alimentação",
      type: "income",
      monthly_budget: null,
    });
  });
});
