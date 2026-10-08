import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiColor = "green" | "red" | "amber" | "blue" | "purple";

const colorMap: Record<KpiColor, { border: string; icon: string; bg: string }> = {
  green: { border: "border-l-income", icon: "text-income", bg: "bg-income/5" },
  red: { border: "border-l-expense", icon: "text-expense", bg: "bg-expense/5" },
  amber: { border: "border-l-warning", icon: "text-warning", bg: "bg-warning/5" },
  blue: { border: "border-l-info", icon: "text-info", bg: "bg-info/5" },
  purple: { border: "border-l-purple-500", icon: "text-purple-400", bg: "bg-purple-500/5" },
};

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: KpiColor;
}

export function KpiCard({ title, value, icon: Icon, trend, trendUp, color }: KpiCardProps) {
  const c = color ? colorMap[color] : null;

  return (
    <div
      className={cn(
        "glass-card rounded-xl p-3 sm:p-5 animate-fade-in border-l-4 h-full flex flex-col justify-between",
        c ? [c.border, c.bg] : "border-l-border"
      )}
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
        <span className="text-xs sm:text-sm text-muted-foreground font-medium line-clamp-1">{title}</span>
        <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5 shrink-0", c ? c.icon : "text-muted-foreground")} />
      </div>
      <div>
        <p className="text-base sm:text-lg lg:text-2xl font-bold text-foreground break-words leading-tight">{value}</p>
        {trend && (
          <p className={`text-xs mt-1 ${trendUp ? "text-income" : "text-expense"}`}>
            {trend}
          </p>
        )}
      </div>
    </div>
  );
}
