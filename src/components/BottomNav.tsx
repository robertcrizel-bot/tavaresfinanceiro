import { ArrowLeftRight, CalendarClock, LayoutDashboard, List, PieChart, ReceiptText, ScanLine, Tag, User, Wallet } from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { ScrollCarousel } from "@/components/ScrollCarousel";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Análises", url: "/analises-despesas", icon: PieChart },
  { title: "Registros", url: "/records", icon: List },
  { title: "Extratos", url: "/extratos", icon: ReceiptText },
  { title: "Contas", url: "/accounts", icon: Wallet },
  { title: "Transferências", url: "/transfers", icon: ArrowLeftRight },
  { title: "Categorias", url: "/categories", icon: Tag },
  { title: "Previsões", url: "/forecasts", icon: CalendarClock },
  { title: "Comprovante", url: "/receipt", icon: ScanLine },
  { title: "Perfil", url: "/profile", icon: User },
];

const itemClass = (active: boolean) =>
  cn(
    "relative flex min-w-[86px] shrink-0 grow snap-start flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-sidebar-foreground/70 transition-all",
    active && "bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/30",
  );

const iconClass = (active: boolean) =>
  cn("h-6 w-6", active ? "text-sidebar-primary" : "text-sidebar-foreground");

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navegação principal"
      className="safe-area-bottom fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-sidebar-border bg-sidebar/95 p-1 shadow-[0_16px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl md:hidden"
    >
      <ScrollCarousel
        className="gap-1 px-8 pb-0 scroll-pl-8"
        controlClassName="h-8 w-8"
        edgeClassName="from-sidebar/95"
        prevLabel="Navegar para itens anteriores"
        nextLabel="Navegar para próximos itens"
      >
        {navItems.map((item) => {
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
      </ScrollCarousel>
    </nav>
  );
}
