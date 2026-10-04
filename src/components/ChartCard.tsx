import { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  children: ReactNode;
}

export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <h3 className="mb-4 text-sm font-semibold text-primary/80">{title}</h3>
      {children}
    </div>
  );
}
