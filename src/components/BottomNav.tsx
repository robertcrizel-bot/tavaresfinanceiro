import { LayoutDashboard, List, Wallet, Tag, CalendarClock, ArrowLeftRight, User } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const items = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Registros", url: "/records", icon: List },
  { title: "Contas", url: "/accounts", icon: Wallet },
  { title: "Transf.", url: "/transfers", icon: ArrowLeftRight },
  { title: "Categorias", url: "/categories", icon: Tag },
  { title: "Previsões", url: "/forecasts", icon: CalendarClock },
  { title: "Perfil", url: "/profile", icon: User },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom md:hidden">
      <div className="grid grid-cols-7 items-center h-14 px-1">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/"}
            className="flex flex-col items-center justify-center gap-0.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
            activeClassName="text-primary font-medium"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="text-[9px] font-medium leading-tight truncate max-w-full text-center px-0.5">
              {item.title}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
