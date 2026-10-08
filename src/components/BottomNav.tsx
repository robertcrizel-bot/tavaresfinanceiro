import { useState } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  LayoutDashboard,
  List,
  MoreHorizontal,
  PieChart,
  ReceiptText,
  Tag,
  User,
  Wallet,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const visibleItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Registros", url: "/records", icon: List },
  { title: "Extratos", url: "/extratos", icon: ReceiptText },
  { title: "Contas", url: "/accounts", icon: Wallet },
];

const moreItems = [
  { title: "Análises", url: "/analises-despesas", icon: PieChart },
  { title: "Transferências", url: "/transfers", icon: ArrowLeftRight },
  { title: "Categorias", url: "/categories", icon: Tag },
  { title: "Previsões", url: "/forecasts", icon: CalendarClock },
  { title: "Perfil", url: "/profile", icon: User },
];

const itemClassName =
  "flex flex-col items-center justify-center gap-1 py-2 text-muted-foreground transition-colors hover:text-foreground min-h-[3.5rem]";
const activeItemClassName = "text-primary font-medium";

export function BottomNav() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreItems.some((item) => item.url === pathname);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom md:hidden">
        <div className="grid grid-cols-5 items-stretch px-2">
          {visibleItems.map((item) => (
            <NavLink
              key={item.title}
              to={item.url}
              end={item.url === "/"}
              className={itemClassName}
              activeClassName={activeItemClassName}
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-[10px] font-medium leading-tight">
                {item.title}
              </span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Mais opções"
            className={cn(itemClassName, "w-full", moreActive && activeItemClassName)}
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-medium leading-tight">Mais</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-3 pb-8 pt-4">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle>Mais opções</SheetTitle>
            <SheetDescription className="sr-only">
              Navegação para as demais telas do aplicativo
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col">
            {moreItems.map((item) => (
              <NavLink
                key={item.title}
                to={item.url}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeClassName="bg-accent text-primary font-medium"
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">{item.title}</span>
              </NavLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
