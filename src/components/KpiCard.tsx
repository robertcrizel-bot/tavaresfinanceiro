import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiColor = "green" | "red" | "balance" | "neutral";

const colorMap: Record<KpiColor, { icon: string; title: string; value: string; accent: string; surface: string }> = {
  green: {
    icon: "text-income",
    title: "text-muted-foreground",
    value: "text-income",
    accent: "border-l-income/70",
    surface: "",
  },
  red: {
    icon: "text-expense",
    title: "text-muted-foreground",
    value: "text-expense",
    accent: "border-l-expense/70",
    surface: "",
  },
  balance: {
    icon: "text-primary",
    title: "text-foreground",
    value: "text-income",
    accent: "border-l-primary/60",
    surface: "dashboard-card-balance",
  },
  neutral: {
    icon: "text-primary",
    title: "text-muted-foreground",
    value: "text-foreground",
    accent: "border-l-border",
    surface: "",
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
}

export function KpiCard({ title, value, icon: Icon, trend, trendUp, color, negativeValue }: KpiCardProps) {
  const c = colorMap[color ?? "neutral"];
  const valueColor = negativeValue ? "text-expense" : c.value;

  return (
    <div className={cn("dashboard-card border-l-4 p-3 sm:p-5 h-full flex flex-col justify-between", c.accent, c.surface)}>
      <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
        <span className={cn("text-xs sm:text-sm font-semibold line-clamp-1", c.title)}>{title}</span>
        <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5 shrink-0", c.icon)} />
      </div>
      <div>
        <p
          className={cn(
            "text-base sm:text-lg lg:text-2xl font-bold break-words leading-tight",
            valueColor,
            color === "balance" && "font-extrabold",
          )}
        >
          {value}
        </p>
        {trend && (
          <p className={`text-xs mt-1 ${trendUp ? "text-income" : "text-expense"}`}>
            {trend}
          </p>
        )}
      </div>
    </div>
  );
}
