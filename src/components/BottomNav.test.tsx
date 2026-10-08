import { forwardRef } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/BottomNav";

vi.mock("@/components/NavLink", () => ({
  NavLink: forwardRef(function MockNavLink(
    {
      children,
      to,
      end: _end,
      activeClassName: _active,
      ...props
    }: {
      children?: React.ReactNode;
      to: string;
      [key: string]: unknown;
    },
    ref: React.ForwardedRef<HTMLAnchorElement>,
  ) {
    return (
      <a ref={ref} href={to} {...props}>
        {children}
      </a>
    );
  }),
}));

const routes: [string, string][] = [
  ["Painel", "/"],
  ["Análises", "/analises-despesas"],
  ["Registros", "/records"],
  ["Extratos", "/extratos"],
  ["Contas", "/accounts"],
  ["Transf.", "/transfers"],
  ["Categorias", "/categories"],
  ["Previsões", "/forecasts"],
  ["Perfil", "/profile"],
];

function renderNav(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("shows all nine destinations without a Mais button", () => {
    renderNav("/");
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    for (const [label] of routes) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    expect(within(nav).queryByText("Mais")).not.toBeInTheDocument();
  });

  it("keeps every route reachable with a horizontal scroll container", () => {
    renderNav("/");
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    for (const [label, url] of routes) {
      expect(within(nav).getByText(label).closest("a")).toHaveAttribute("href", url);
    }
    const scroller = nav.firstElementChild as HTMLElement;
    expect(scroller.className).toMatch(/overflow-x-auto/);
    expect(scroller.className).toMatch(/snap-x/);
  });

  it("marks the active destination with aria-current and a visible indicator", () => {
    renderNav("/extratos");
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const active = within(nav).getByText("Extratos").closest("a")!;
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toMatch(/text-primary/);
    expect(within(nav).getByText("Painel").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("uses a distinct bar surface with top border and safe-area", () => {
    renderNav("/");
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.className).toMatch(/border-t/);
    expect(nav.className).toMatch(/safe-area-bottom/);
    expect(nav.className).toMatch(/shadow-/);
  });
});
