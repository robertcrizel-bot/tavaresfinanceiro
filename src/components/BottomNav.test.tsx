import { forwardRef } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/BottomNav";

vi.mock("@/components/NavLink", () => ({
  NavLink: forwardRef(function MockNavLink(
    { children, to, end: _end, activeClassName: _active, ...props }: {
      children?: React.ReactNode;
      to: string;
      [key: string]: unknown;
    },
    ref: React.ForwardedRef<HTMLAnchorElement>,
  ) {
    return <a ref={ref} href={to} {...props}>{children}</a>;
  }),
}));

function renderNav(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("lists every sidebar destination directly in the bar", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    for (const [label, url] of [
      ["Painel", "/"],
      ["Análises", "/analises-despesas"],
      ["Registros", "/records"],
      ["Extratos", "/extratos"],
      ["Contas", "/accounts"],
      ["Transferências", "/transfers"],
      ["Categorias", "/categories"],
      ["Previsões", "/forecasts"],
      ["Comprovante", "/receipt"],
      ["Perfil", "/profile"],
    ]) {
      expect(within(nav).getByText(label).closest("a")).toHaveAttribute("href", url);
    }
    expect(within(nav).getAllByRole("link")).toHaveLength(10);
  });

  it("no longer groups destinations behind a menu button", () => {
    renderNav();
    expect(screen.queryByRole("button", { name: "Abrir todas as áreas" })).not.toBeInTheDocument();
    expect(screen.queryByText("Mais")).not.toBeInTheDocument();
  });

  it("marks the active destination", () => {
    renderNav("/extratos");
    const active = screen.getByText("Extratos").closest("a")!;
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toMatch(/bg-sidebar-primary/);
  });

  it("marks secondary destinations directly on their own link", () => {
    renderNav("/accounts");
    const active = screen.getByText("Contas").closest("a")!;
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toMatch(/bg-sidebar-primary/);
  });

  it("keeps every destination inside a horizontal scroll track with arrows", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.querySelector("[data-scroll-track]")).toBeTruthy();
    expect(
      within(nav).getByRole("button", { name: "Navegar para itens anteriores" }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: "Navegar para próximos itens" }),
    ).toBeInTheDocument();
  });
});
