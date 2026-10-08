import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  List,
  PieChart,
  ReceiptText,
  Tag,
  User,
  Wallet,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

const items = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Análises", url: "/analises-despesas", icon: PieChart },
  { title: "Registros", url: "/records", icon: List },
  { title: "Extratos", url: "/extratos", icon: ReceiptText },
  { title: "Contas", url: "/accounts", icon: Wallet },
  { title: "Transf.", url: "/transfers", icon: ArrowLeftRight },
  { title: "Categorias", url: "/categories", icon: Tag },
  { title: "Previsões", url: "/forecasts", icon: CalendarClock },
  { title: "Perfil", url: "/profile", icon: User },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    itemRefs.current.get(pathname)?.scrollIntoView?.({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [pathname]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxLeft = scroller.scrollWidth - scroller.clientWidth;
        setCanScrollLeft(scroller.scrollLeft > 4);
        setCanScrollRight(scroller.scrollLeft < maxLeft - 4);
      });
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-[hsl(224_20%_16%)] shadow-[0_-10px_28px_-14px_rgba(0,0,0,0.75)] backdrop-blur-md safe-area-bottom md:hidden"
    >
      <div
        ref={scrollerRef}
        data-testid="bottomnav-scroller"
        className="flex snap-x snap-mandatory gap-0.5 overflow-x-auto px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const active = item.url === "/" ? pathname === "/" : pathname === item.url;
          return (
            <NavLink
              key={item.title}
              ref={(node) => {
                if (node) itemRefs.current.set(item.url, node);
                else itemRefs.current.delete(item.url);
              }}
              to={item.url}
              end={item.url === "/"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-[72px] flex-1 snap-start flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:text-foreground",
                active && "bg-primary/10 text-primary",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-6 top-0 h-0.5 rounded-full bg-transparent transition-colors",
                  active && "bg-primary",
                )}
              />
              <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className={cn("whitespace-nowrap text-[10px] font-medium leading-tight", active && "font-semibold")}>
                {item.title}
              </span>
            </NavLink>
          );
        })}
      </div>
      {canScrollLeft && (
        <div
          aria-hidden="true"
          data-testid="bottomnav-fade-left"
          className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-start bg-gradient-to-r from-[hsl(224_20%_16%)] via-[hsl(224_20%_16%/0.85)] to-transparent pl-1"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      {canScrollRight && (
        <div
          aria-hidden="true"
          data-testid="bottomnav-fade-right"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-[hsl(224_20%_16%)] via-[hsl(224_20%_16%/0.85)] to-transparent pr-1"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </nav>
  );
}
