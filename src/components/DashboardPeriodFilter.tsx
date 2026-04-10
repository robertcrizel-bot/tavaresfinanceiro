import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

export type Period = "7" | "15" | "30" | "month" | "all" | "custom";

interface Props {
  period: Period;
  dateRange: DateRange | undefined;
  onPeriodChange: (p: Period) => void;
  onDateRangeChange: (r: DateRange | undefined) => void;
}

const options: { value: Period; label: string }[] = [
  { value: "30", label: "30 dias" },
  { value: "15", label: "15 dias" },
  { value: "7", label: "7 dias" },
  { value: "all", label: "Total" },
];

export function DashboardPeriodFilter({ period, dateRange, onPeriodChange, onDateRangeChange }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={period === opt.value ? "default" : "outline"}
          className="text-xs h-8"
          onClick={() => onPeriodChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={period === "custom" ? "default" : "outline"}
            className={cn("text-xs h-8 gap-1.5", period === "custom" && dateRange?.from && "min-w-[200px]")}
            onClick={() => {
              if (period !== "custom") onPeriodChange("custom");
            }}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {period === "custom" && dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "dd/MM", { locale: ptBR })} –{" "}
                  {format(dateRange.to, "dd/MM", { locale: ptBR })}
                </>
              ) : (
                format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
              )
            ) : (
              "Período"
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              onDateRangeChange(range);
              onPeriodChange("custom");
              if (range?.from && range?.to) {
                setCalendarOpen(false);
              }
            }}
            numberOfMonths={1}
            locale={ptBR}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
