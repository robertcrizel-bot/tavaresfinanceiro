import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AnalyticsMultiSelectProps {
  id: string;
  label: string;
  emptyLabel: string;
  countLabel: (count: number) => string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export function AnalyticsMultiSelect({ id, label, emptyLabel, countLabel, options, selected, onChange }: AnalyticsMultiSelectProps) {
  const summary = selected.length === 0 ? emptyLabel
    : selected.length === 1 ? options.find(option => option.value === selected[0])?.label ?? selected[0]
      : countLabel(selected.length);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button id={id} type="button" aria-label={label}
          title={selected.map(value => options.find(option => option.value === value)?.label ?? value).join(", ") || emptyLabel}
          className="flex h-auto min-h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <span className="min-w-0 break-words text-left">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={label}
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-1">
        <div className="grid grid-cols-2 gap-1 border-b border-border p-1">
          <button type="button" className="min-h-11 rounded-md px-2 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange([...new Set(options.map(option => option.value))])}>Selecionar todas</button>
          <button type="button" className="min-h-11 rounded-md px-2 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange([])}>Limpar seleção</button>
        </div>
        <div className="max-h-[min(20rem,50dvh)] overflow-y-auto overscroll-contain" role="group" aria-label={`Opções: ${label}`}>
          {options.map(option => (
            <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={selected.includes(option.value)}
                onChange={event => onChange(event.target.checked ? [...selected, option.value] : selected.filter(value => value !== option.value))} />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
