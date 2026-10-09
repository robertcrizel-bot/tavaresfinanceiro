import { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  children: ReactNode;
}

export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <section className="dashboard-card overflow-hidden p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="h-px w-5 bg-primary" />
        <h3 className="text-[15px] font-bold tracking-tight text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}
