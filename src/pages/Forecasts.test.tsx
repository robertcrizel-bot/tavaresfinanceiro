import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Forecasts from "@/pages/Forecasts";

const mocks = vi.hoisted(() => ({
  updateBill: vi.fn(),
}));

vi.mock("@/contexts/ForecastContext", () => ({
  useForecast: () => ({
    bills: [{
      id: "bill-1",
      name: "Aluguel",
      amount: 1000,
      category: "Moradia",
      dueDay: 11,
      startDate: "2020-01-01",
      durationMonths: null,
      accountId: null,
      description: null,
      scopedEdits: { months: {}, future: [], deletedMonths: {}, deletedFrom: null },
    }],
    payments: [],
    loading: false,
    addBill: vi.fn(),
    updateBill: mocks.updateBill,
    deleteBill: vi.fn(),
    markAsPaid: vi.fn(),
    unmarkAsPaid: vi.fn(),
  }),
}));

vi.mock("@/contexts/AccountContext", () => ({ useAccounts: () => ({ accounts: [] }) }));
vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({ categories: [{ id: "category-1", name: "Moradia", type: "expense" }] }),
}));

describe("Forecasts edit scope", () => {
  it("requires an explicit scope before saving any recurring bill edit", () => {
    render(<Forecasts />);

    fireEvent.click(screen.getByTitle("Editar previsão"));

    expect(screen.getByText("Aplicar alteração em")).toBeInTheDocument();
    expect(screen.getByText("Selecione o alcance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(mocks.updateBill).not.toHaveBeenCalled();
  });
});
