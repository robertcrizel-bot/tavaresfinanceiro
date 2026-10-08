import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/BottomNav";

vi.mock("@/components/NavLink", () => ({
  NavLink: ({ children, to, onClick }: { children?: React.ReactNode; to: string; onClick?: () => void }) => (
    <a href={to} onClick={(event) => {
      event.preventDefault();
      onClick?.();
    }}>
      {children}
    </a>
  ),
}));

function renderNav(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("shows only the five primary destinations", () => {
    renderNav("/");
    for (const label of ["Painel", "Registros", "Extratos", "Contas", "Mais"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Análises")).not.toBeInTheDocument();
    expect(screen.queryByText("Categorias")).not.toBeInTheDocument();
  });

  it("opens Mais with the remaining routes and keeps every route reachable", async () => {
    renderNav("/");
    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    for (const label of ["Análises", "Transferências", "Categorias", "Previsões", "Perfil"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Análises").closest("a")).toHaveAttribute("href", "/analises-despesas");
    expect(screen.getByText("Perfil").closest("a")).toHaveAttribute("href", "/profile");
  });

  it("highlights Mais when a nested route is active", () => {
    renderNav("/categories");
    expect(screen.getByRole("button", { name: "Mais opções" })).toHaveClass("text-primary");
  });

  it("links Extratos to the statements route", () => {
    renderNav("/");
    expect(screen.getByText("Extratos").closest("a")).toHaveAttribute("href", "/extratos");
  });
});
