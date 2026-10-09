import { LayoutDashboard, List, Menu, PieChart, ReceiptText } from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { ScrollCarousel } from "@/components/ScrollCarousel";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const primaryItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Análises", url: "/analises-despesas", icon: PieChart },
  { title: "Registros", url: "/records", icon: List },
  { title: "Extratos", url: "/extratos", icon: ReceiptText },
];

const secondaryRoutes = ["/accounts", "/transfers", "/categories", "/forecasts", "/profile", "/receipt"];

const itemClass = (active: boolean) =>
  cn(
    "relative flex min-w-[86px] shrink-0 grow snap-start flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-sidebar-foreground/70 transition-all",
    active && "bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/30",
  );

const iconClass = (active: boolean) =>
  cn("h-5 w-5", active ? "text-sidebar-primary" : "text-sidebar-foreground");

export function BottomNav() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const moreActive = secondaryRoutes.includes(pathname);

  return (
    <nav
      aria-label="Navegação principal"
      className="safe-area-bottom fixed inset-x-2 bottom-2 z-50 rounded-2xl border border-sidebar-border bg-sidebar/95 p-1 shadow-[0_16px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl md:hidden"
    >
      <ScrollCarousel
        className="gap-1 px-8 pb-0 scroll-pl-8"
        controlClassName="h-8 w-8"
        edgeClassName="from-sidebar/95"
        prevLabel="Navegar para itens anteriores"
        nextLabel="Navegar para próximos itens"
      >
        {primaryItems.map((item) => {
          const active = item.url === "/" ? pathname === "/" : pathname === item.url;
          return (
            <NavLink
              key={item.title}
              to={item.url}
              end={item.url === "/"}
              aria-current={active ? "page" : undefined}
              className={itemClass(active)}
            >
              <item.icon className={iconClass(active)} aria-hidden="true" />
              <span className="max-w-full truncate text-[9px] font-bold">{item.title}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          aria-label="Abrir todas as áreas"
          aria-current={moreActive ? "page" : undefined}
          className={cn(
            "relative flex min-w-[86px] shrink-0 grow snap-start flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-sidebar-foreground/70 transition-all",
            moreActive && "bg-sidebar-accent text-sidebar-primary ring-1 ring-sidebar-primary/30",
          )}
        >
          <Menu className={iconClass(moreActive)} aria-hidden="true" />
          <span className="text-[9px] font-bold">Mais</span>
        </button>
      </ScrollCarousel>
    </nav>
  );
}
