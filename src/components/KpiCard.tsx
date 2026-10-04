import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiColor = "green" | "red" | "neutral";

const colorMap: Record<KpiColor, { icon: string; title: string }> = {
  green: { icon: "text-income", title: "text-income/80" },
  red: { icon: "text-expense", title: "text-expense/80" },
  neutral: { icon: "text-muted-foreground", title: "text-foreground" },
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
  const c = colorMap[color ?? "neutral"];

  return (
    <div className="glass-card rounded-xl p-3 sm:p-5 animate-fade-in border-l-4 border-l-border h-full flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
        <span className={cn("text-xs sm:text-sm font-semibold line-clamp-1", c.title)}>{title}</span>
        <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5 shrink-0", c.icon)} />
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
