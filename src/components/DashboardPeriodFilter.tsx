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

const options: { value: Period; label: string; mobileLabel: string }[] = [
  { value: "month", label: "Mês Atual", mobileLabel: "Mês" },
  { value: "30", label: "30 dias", mobileLabel: "30d" },
  { value: "15", label: "15 dias", mobileLabel: "15d" },
  { value: "7", label: "7 dias", mobileLabel: "7d" },
  { value: "all", label: "Total", mobileLabel: "Total" },
];

export function DashboardPeriodFilter({ period, dateRange, onPeriodChange, onDateRangeChange }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
      <div className="order-2 col-span-2 grid grid-cols-5 gap-0.5 rounded-md border border-input bg-muted/40 p-0.5 sm:contents">
        {options.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant={period === opt.value ? "default" : "outline"}
            className={cn(
              "h-7 min-w-0 rounded-sm border-0 px-1 text-[11px] shadow-none sm:h-8 sm:rounded-md sm:px-3 sm:text-xs",
              period !== opt.value && "sm:border",
            )}
            onClick={() => onPeriodChange(opt.value)}
          >
            <span className="sm:hidden">{opt.mobileLabel}</span>
            <span className="hidden sm:inline">{opt.label}</span>
          </Button>
        ))}
      </div>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={period === "custom" ? "default" : "outline"}
            className={cn(
              "order-1 h-8 justify-self-end gap-1 px-2 text-xs sm:order-none sm:gap-1.5 sm:px-3",
              period === "custom" && dateRange?.from && "sm:min-w-[200px]",
            )}
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
