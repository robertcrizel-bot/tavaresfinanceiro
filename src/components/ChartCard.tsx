import { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  children: ReactNode;
}

export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <section className="dashboard-card overflow-hidden p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-px w-5 bg-primary" />
        <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}
