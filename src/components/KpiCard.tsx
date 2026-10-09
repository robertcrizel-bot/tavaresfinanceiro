import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiColor = "green" | "red" | "balance" | "neutral" | "category";

const colorMap: Record<KpiColor, { icon: string; iconSurface: string; title: string; value: string; surface: string }> = {
  green: {
    icon: "text-income",
    iconSurface: "bg-income/10 ring-income/20",
    title: "text-muted-foreground",
    value: "text-income",
    surface: "border-income/20 bg-card",
  },
  red: {
    icon: "text-expense",
    iconSurface: "bg-expense/10 ring-expense/20",
    title: "text-muted-foreground",
    value: "text-expense",
    surface: "border-expense/20 bg-card",
  },
  balance: {
    icon: "text-primary",
    iconSurface: "bg-primary/10 ring-primary/20",
    title: "text-primary-foreground/70",
    value: "text-primary-foreground",
    surface: "border-primary/25 bg-primary shadow-[0_18px_40px_-28px_hsl(var(--primary))]",
  },
  neutral: {
    icon: "text-primary",
    iconSurface: "bg-primary/10 ring-primary/20",
    title: "text-muted-foreground",
    value: "text-foreground",
    surface: "border-border/70 bg-card/90",
  },
  category: {
    icon: "text-primary",
    iconSurface: "bg-primary/10 ring-primary/20",
    title: "text-muted-foreground",
    value: "text-foreground",
    surface: "border-border/70 bg-secondary/30",
  },
};

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: KpiColor;
  negativeValue?: boolean;
  className?: string;
}

export function KpiCard({ title, value, icon: Icon, trend, trendUp, color, negativeValue, className }: KpiCardProps) {
  const c = colorMap[color ?? "neutral"];
  const valueColor = negativeValue ? "text-expense" : c.value;

  return (
    <div className={cn(
      "dashboard-card flex min-h-[96px] flex-col justify-between p-3.5 sm:min-h-[104px] sm:p-4",
      c.surface,
      className,
    )}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("min-w-0 pt-0.5 text-[11px] font-medium leading-tight sm:text-xs", c.title)}>{title}</span>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", c.iconSurface)}>
          <Icon className={cn("h-4 w-4", c.icon)} />
        </span>
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "break-words text-base font-bold leading-tight tracking-tight sm:text-lg lg:text-xl",
            valueColor,
            (color === "balance" || color === "category") && "font-extrabold",
          )}
        >
          {value}
        </p>
        {trend && (
          <p className={`mt-1 text-xs ${trendUp ? "text-income" : "text-expense"}`}>
            {trend}
          </p>
        )}
      </div>
    </div>
  );
}
