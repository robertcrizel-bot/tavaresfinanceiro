import { Lightbulb } from "lucide-react";

interface InsightCardProps {
  text: string;
}

export function InsightCard({ text }: InsightCardProps) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-start gap-3 animate-fade-in">
      <Lightbulb className="h-5 w-5 text-warning shrink-0 mt-0.5" />
      <p className="text-sm text-foreground leading-relaxed">{text}</p>
    </div>
  );
}
