import { forwardRef } from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
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

describe("BottomNav scroll indicators", () => {
  const metrics = { scrollLeft: 0, scrollWidth: 648, clientWidth: 360 };

  function renderScrollable() {
    renderNav("/");
    const scroller = screen.getByTestId("bottomnav-scroller");
    Object.defineProperties(scroller, {
      scrollLeft: {
        configurable: true,
        get: () => metrics.scrollLeft,
        set: (value: number) => {
          metrics.scrollLeft = value;
        },
      },
      scrollWidth: { configurable: true, get: () => metrics.scrollWidth },
      clientWidth: { configurable: true, get: () => metrics.clientWidth },
    });
    return scroller;
  }

  function scrollTo(left: number) {
    metrics.scrollLeft = left;
    fireEvent.scroll(screen.getByTestId("bottomnav-scroller"));
  }

  it("shows only the right indicator at the start", async () => {
    metrics.scrollLeft = 0;
    renderScrollable();
    expect(await screen.findByTestId("bottomnav-fade-right")).toBeInTheDocument();
    expect(screen.queryByTestId("bottomnav-fade-left")).not.toBeInTheDocument();
  });

  it("shows the left indicator after scrolling and hides it back at the start", async () => {
    metrics.scrollLeft = 0;
    renderScrollable();
    await screen.findByTestId("bottomnav-fade-right");

    scrollTo(100);
    expect(await screen.findByTestId("bottomnav-fade-left")).toBeInTheDocument();
    expect(screen.getByTestId("bottomnav-fade-right")).toBeInTheDocument();

    scrollTo(0);
    await waitFor(() =>
      expect(screen.queryByTestId("bottomnav-fade-left")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("bottomnav-fade-right")).toBeInTheDocument();
  });

  it("hides the right indicator at the end", async () => {
    metrics.scrollLeft = 0;
    renderScrollable();
    await screen.findByTestId("bottomnav-fade-right");

    scrollTo(metrics.scrollWidth - metrics.clientWidth);
    await waitFor(() =>
      expect(screen.queryByTestId("bottomnav-fade-right")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("bottomnav-fade-left")).toBeInTheDocument();
  });

  it("does not block touches and keeps all destinations reachable while scrollable", async () => {
    metrics.scrollLeft = 0;
    renderScrollable();
    const right = await screen.findByTestId("bottomnav-fade-right");
    expect(right.className).toMatch(/pointer-events-none/);
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    for (const label of ["Painel", "Perfil"]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });
});
