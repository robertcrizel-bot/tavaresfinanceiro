import { ReactNode } from "react";
import { colorAccent } from "@/lib/chart-theme";

interface ChartCardProps {
  title: string;
  children: ReactNode;
  color?: string;
  className?: string;
}

export function ChartCard({ title, children, color, className = "" }: ChartCardProps) {
  return (
    <section className={`dashboard-card overflow-hidden p-4${color ? " data-surface" : ""} ${className}`} style={color ? colorAccent(color) : undefined}>
      <div className="mb-3 flex items-center gap-3">
        <span className="h-px w-5 shrink-0" style={{ backgroundColor: color ?? "hsl(var(--primary))" }} />
        <h3 className="min-w-0 break-words text-[15px] font-bold tracking-tight text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}
