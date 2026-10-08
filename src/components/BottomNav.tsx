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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-primary/30 bg-[hsl(224_24%_12%)] shadow-[0_-14px_32px_-10px_rgba(0,0,0,0.92)] safe-area-bottom md:hidden"
    >
      <div
        ref={scrollerRef}
        data-testid="bottomnav-scroller"
        className="flex snap-x snap-mandatory gap-0.5 overflow-x-auto scroll-px-2 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "relative flex min-w-[80px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white",
                active && "bg-primary/20 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-5 top-0 h-1 rounded-full bg-transparent transition-colors",
                  active && "bg-primary",
                )}
              />
              <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
              <span className={cn("whitespace-nowrap text-[11px] font-semibold leading-tight", active && "font-bold")}>
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
          className="pointer-events-none absolute inset-y-0 left-0 flex w-16 items-center justify-start bg-gradient-to-r from-[hsl(224_24%_12%)] via-[hsl(224_24%_12%/0.96)] to-transparent pl-1"
        >
          <ChevronLeft className="h-8 w-8 stroke-[2.75] text-white drop-shadow-md" />
        </div>
      )}
      {canScrollRight && (
        <div
          aria-hidden="true"
          data-testid="bottomnav-fade-right"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end bg-gradient-to-l from-[hsl(224_24%_12%)] via-[hsl(224_24%_12%/0.96)] to-transparent pr-1"
        >
          <ChevronRight className="h-8 w-8 stroke-[2.75] text-white drop-shadow-md" />
        </div>
      )}
    </nav>
  );
}
