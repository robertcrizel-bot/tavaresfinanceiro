import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  exportFinancialReportCsv, exportFinancialReportExcel, exportFinancialReportPdf,
  type FinancialReport,
} from "@/lib/financial-data-export";
import { toast } from "@/hooks/use-toast";

type Props = { report: FinancialReport; disabled?: boolean };

export function FinanceExportMenu({ report, disabled = false }: Props) {
  const onError = (error: unknown) => {
    console.error("Erro ao exportar relatório", error);
    toast({ title: "Não foi possível exportar", description: "Tente novamente.", variant: "destructive" });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || report.rows.length === 0} className="gap-2 bg-card">
          <Download className="h-4 w-4" /> Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void exportFinancialReportPdf(report).catch(onError)}>
          <FileText className="mr-2 h-4 w-4" /> Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportFinancialReportExcel(report).catch(onError)}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          try { exportFinancialReportCsv(report); } catch (e) { onError(e); }
        }}>
          <FileText className="mr-2 h-4 w-4" /> Exportar CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
