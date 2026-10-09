import { Lightbulb } from "lucide-react";

interface InsightCardProps {
  text: string;
}

export function InsightCard({ text }: InsightCardProps) {
  return (
    <div className="group flex items-start gap-3 border-l border-border px-4 py-2 first:border-l-0">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:-translate-y-0.5">
        <Lightbulb className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm font-medium leading-relaxed text-foreground/80">{text}</p>
    </div>
  );
}
