import { LayoutDashboard, List, Wallet, User, CalendarClock } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Registros", url: "/records", icon: List },
  { title: "Contas", url: "/accounts", icon: Wallet },
  { title: "Previsões", url: "/forecasts", icon: CalendarClock },
  { title: "Perfil", url: "/profile", icon: User },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom md:hidden">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/"}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
