import { forwardRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/BottomNav";
import { SidebarProvider } from "@/components/ui/sidebar";

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
      <SidebarProvider>
        <BottomNav />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("prioritizes the four main destinations and a menu", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    for (const [label, url] of [
      ["Painel", "/"],
      ["Análises", "/analises-despesas"],
      ["Registros", "/records"],
      ["Extratos", "/extratos"],
    ]) {
      expect(within(nav).getByText(label).closest("a")).toHaveAttribute("href", url);
    }
    expect(within(nav).getByText("Mais")).toBeInTheDocument();
  });

  it("marks the active main destination", () => {
    renderNav("/extratos");
    const active = screen.getByText("Extratos").closest("a")!;
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toMatch(/bg-sidebar-primary/);
  });

  it("marks Mais for secondary destinations", () => {
    renderNav("/accounts");
    expect(screen.getByRole("button", { name: "Abrir todas as áreas" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the complete navigation from Mais", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Abrir todas as áreas" }));
    expect(document.cookie).toBeDefined();
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
