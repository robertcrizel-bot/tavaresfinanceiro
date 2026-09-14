import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Categories from "@/pages/Categories";

const mocks = vi.hoisted(() => ({
  categories: [] as Array<{ id: string; name: string; type: "income" | "expense" | "both"; monthlyBudget: number | null }>,
  transactions: [] as Array<Record<string, unknown>>,
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({
    categories: mocks.categories,
    addCategory: mocks.addCategory,
    updateCategory: mocks.updateCategory,
    deleteCategory: mocks.deleteCategory,
  }),
}));
vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ transactions: mocks.transactions }),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => (
    <select aria-label="Tipo" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

const currentMonthDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-10`;
};

describe("Categories monthly budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.categories = [];
    mocks.transactions = [];
    mocks.addCategory.mockResolvedValue(undefined);
    mocks.updateCategory.mockResolvedValue(undefined);
  });

  const openNewCategory = () => {
    fireEvent.click(screen.getByRole("button", { name: "Nova Categoria" }));
    return screen.getByPlaceholderText("Ex: Investimentos");
  };

  it("creates an expense category without a budget using null", async () => {
    render(<Categories />);
    const nameInput = openNewCategory();
    fireEvent.change(nameInput, { target: { value: "Mercado" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(mocks.addCategory).toHaveBeenCalledWith("Mercado", "expense", null));
  });

  it("creates an expense category with a positive budget", async () => {
    render(<Categories />);
    const nameInput = openNewCategory();
    fireEvent.change(nameInput, { target: { value: "Mercado" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(mocks.addCategory).toHaveBeenCalledWith("Mercado", "expense", 1000));
  });

  it("does not offer a budget for income categories", () => {
    render(<Categories />);
    openNewCategory();
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), { target: { value: "income" } });

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it.each(["0", "-10"])("rejects the non-positive budget %s", async (budget) => {
    render(<Categories />);
    const nameInput = openNewCategory();
    fireEvent.change(nameInput, { target: { value: "Mercado" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: budget } });
    fireEvent.submit(nameInput.closest("form")!);

    expect(await screen.findByText("Informe um orçamento maior que zero.")).toBeInTheDocument();
    expect(mocks.addCategory).not.toHaveBeenCalled();
  });

  it("clears the budget when an expense category becomes income", async () => {
    mocks.categories = [{ id: "category-1", name: "Alimentação", type: "expense", monthlyBudget: 1000 }];
    render(<Categories />);
    fireEvent.click(screen.getByRole("button", { name: "Editar Alimentação" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(1000);
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), { target: { value: "income" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mocks.updateCategory).toHaveBeenCalledWith("category-1", "Alimentação", "income", null));
  });

  it("keeps a category without a budget compact and functional", () => {
    mocks.categories = [{ id: "category-1", name: "Alimentação", type: "expense", monthlyBudget: null }];
    render(<Categories />);

    expect(screen.getByText("Alimentação")).toBeInTheDocument();
    expect(screen.queryByText(/utilizado/)).not.toBeInTheDocument();
  });

  it("shows current spending, percentage and available amount", () => {
    mocks.categories = [{ id: "category-1", name: "Alimentação", type: "expense", monthlyBudget: 1000 }];
    mocks.transactions = [{
      id: "transaction-1",
      title: "Mercado",
      amount: 740,
      type: "expense",
      category: "Alimentação",
      date: currentMonthDate(),
    }];
    render(<Categories />);

    expect(screen.getByText("74% utilizado")).toBeInTheDocument();
    expect(screen.getByText(/Disponível/)).toHaveTextContent("R$ 260,00");
    expect(screen.getByText(/R\$ 740,00/)).toHaveTextContent("R$ 1.000,00");
  });

  it("shows the exceeded amount", () => {
    mocks.categories = [{ id: "category-1", name: "Alimentação", type: "expense", monthlyBudget: 1000 }];
    mocks.transactions = [{
      id: "transaction-1",
      title: "Mercado",
      amount: 1150,
      type: "expense",
      category: "Alimentação",
      date: currentMonthDate(),
    }];
    render(<Categories />);

    expect(screen.getByText("115% utilizado")).toBeInTheDocument();
    expect(screen.getByText(/Excedido/)).toHaveTextContent("R$ 150,00");
  });
});
