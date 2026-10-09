import { LayoutDashboard, List, Menu, PieChart, ReceiptText } from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const primaryItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Análises", url: "/analises-despesas", icon: PieChart },
  { title: "Registros", url: "/records", icon: List },
  { title: "Extratos", url: "/extratos", icon: ReceiptText },
];

const secondaryRoutes = ["/accounts", "/transfers", "/categories", "/forecasts", "/profile", "/receipt"];

export function BottomNav() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const moreActive = secondaryRoutes.includes(pathname);

  return (
    <nav
      aria-label="Navegação principal"
      className="safe-area-bottom fixed inset-x-2 bottom-2 z-50 rounded-2xl border border-sidebar-border bg-sidebar/95 p-1 shadow-[0_16px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl md:hidden"
    >
      <div className="grid grid-cols-5 gap-1">
        {primaryItems.map((item) => {
          const active = item.url === "/" ? pathname === "/" : pathname === item.url;
          return (
            <NavLink
              key={item.title}
              to={item.url}
              end={item.url === "/"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-sidebar-foreground/65 transition-all",
                active && "bg-sidebar-primary/10 text-sidebar-primary ring-1 ring-sidebar-primary/20",
              )}
            >
              <item.icon className="h-4.5 w-4.5" aria-hidden="true" />
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
            "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-sidebar-foreground/65 transition-all",
            moreActive && "bg-sidebar-accent text-sidebar-primary",
          )}
        >
          <Menu className="h-4.5 w-4.5" aria-hidden="true" />
          <span className="text-[9px] font-bold">Mais</span>
        </button>
      </div>
    </nav>
  );
}
