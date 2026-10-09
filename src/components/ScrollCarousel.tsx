import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollCarouselProps {
  children: ReactNode;
  /** Classes do trilho (padrão: o mesmo do carrossel de Contas & Cartões). */
  className?: string;
  /** Classes das setas (tamanho), mantendo o mesmo padrão visual. */
  controlClassName?: string;
  /** Classes dos degradês de extremidade (cor de fundo do contêiner). */
  edgeClassName?: string;
  prevLabel?: string;
  nextLabel?: string;
}

/**
 * Trilho rolável horizontalmente (mouse/trackpad/touch) com setas que aparecem
 * conforme há conteúdo nas extremidades. Lógica extraída do carrossel de
 * Contas & Cartões do Dashboard para reutilização.
 */
export function ScrollCarousel({
  children,
  className,
  controlClassName,
  edgeClassName,
  prevLabel = "Ver itens anteriores",
  nextLabel = "Ver próximos itens",
}: ScrollCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: el.scrollLeft <= 2, end: max <= 2 || el.scrollLeft >= max - 2 };
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    sync();
  });

  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => sync());
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  const move = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>("[data-carousel-item]");
    const gap = Number.parseFloat(getComputedStyle(el).columnGap || "12") || 12;
    const step = item ? item.offsetWidth + gap : el.clientWidth * 0.8;
    el.scrollBy?.({ left: direction * step, behavior: "smooth" });
  };

  const controlClass = (hidden: boolean) =>
    cn(
      "absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg transition-opacity duration-200 hover:bg-accent",
      controlClassName || "h-9 w-9",
      hidden ? "pointer-events-none opacity-0" : "opacity-100",
    );

  return (
    <div className="relative">
      <div
        ref={trackRef}
        data-scroll-track
        onScroll={sync}
        className={cn(
          "flex snap-x overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className ?? "gap-3 pb-1",
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r to-transparent transition-opacity",
          edgeClassName ?? "from-background",
          edges.start && "opacity-0",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l to-transparent transition-opacity",
          edgeClassName ?? "from-background",
          edges.end && "opacity-0",
        )}
      />
      <button
        type="button"
        aria-label={prevLabel}
        tabIndex={edges.start ? -1 : 0}
        onClick={() => move(-1)}
        className={cn(controlClass(edges.start), "left-1")}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        tabIndex={edges.end ? -1 : 0}
        onClick={() => move(1)}
        className={cn(controlClass(edges.end), "right-1")}
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
