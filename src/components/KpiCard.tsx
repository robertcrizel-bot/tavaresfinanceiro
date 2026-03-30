import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiColor = "green" | "red" | "amber" | "blue";

const colorMap: Record<KpiColor, { border: string; icon: string; bg: string }> = {
  green: { border: "border-l-income", icon: "text-income", bg: "bg-income/5" },
  red: { border: "border-l-expense", icon: "text-expense", bg: "bg-expense/5" },
  amber: { border: "border-l-warning", icon: "text-warning", bg: "bg-warning/5" },
  blue: { border: "border-l-info", icon: "text-info", bg: "bg-info/5" },
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
        "glass-card rounded-xl p-3 sm:p-5 animate-fade-in border-l-4",
        c ? [c.border, c.bg] : "border-l-border"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className={cn("h-5 w-5", c ? c.icon : "text-muted-foreground")} />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trendUp ? "text-income" : "text-expense"}`}>
          {trend}
        </p>
      )}
    </div>
  );
}
