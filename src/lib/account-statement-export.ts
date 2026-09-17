import type { AccountStatement, AccountStatementEntry } from "@/lib/account-statement";

export interface ExportContext {
  accountName: string;
  referenceMonth: string;
  currentBalance: number;
  statement: AccountStatement;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const sanitizeFilename = (name: string): string =>
  name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_");

const formatPeriod = (referenceMonth: string): string => {
  const [year, month] = referenceMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  const raw = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const formatDateBR = (dateStr: string): string =>
  new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR");

export const buildExportRows = (entries: AccountStatementEntry[]) =>
  entries.map((entry) => ({
    Data: formatDateBR(entry.date),
    Descrição: entry.description,
    Categoria: entry.category ?? "",
    Entrada: entry.direction === "in" ? entry.amount : null,
    Saída: entry.direction === "out" ? entry.amount : null,
    Saldo: entry.balanceAfter ?? null,
  }));

const signFmt = (v: number): string => {
  const s = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return v >= 0 ? `+ ${s}` : `- ${s.replace("-", "")}`;
};

const COLORS = {
  green: "FF16A34A",
  red: "FFDC2626",
  neutral: "FF374151",
  darkTitle: "FF0F172A",
  headerBg: "FF1E293B",
  headerText: "FFFFFFFF",
  altRow: "FFF8FAFC",
  border: "FFE2E8F0",
  white: "FFFFFFFF",
  balanceNeutral: "FF374151",
} as const;

const setBorder = (cell: any, color = COLORS.border) => {
  cell.border = {
    top: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
};

export const exportAccountStatementToExcel = async (ctx: ExportContext): Promise<void> => {
  const { accountName, referenceMonth, currentBalance, statement } = ctx;
  const period = formatPeriod(referenceMonth);
  const { default: ExcelJS } = await import("exceljs");

  const wb = new ExcelJS.Workbook();
  wb.creator = "FinanceControl";
  wb.created = new Date();

  const ws = wb.addWorksheet("Extrato", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = [
    { width: 16 },
    { width: 38 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 22 },
  ];

  let row = 1;

  // ── TÍTULO ──
  ws.mergeCells(row, 1, row, 6);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = "EXTRATO FINANCEIRO";
  titleCell.font = { name: "Calibri", size: 18, bold: true, color: { argb: COLORS.darkTitle } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 36;
  row++;

  // ── Espaço ──
  ws.getRow(row).height = 8;
  row++;

  // ── CONTA ──
  ws.getCell(row, 1).value = "Conta";
  ws.getCell(row, 1).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.neutral } };
  ws.getCell(row, 2).value = accountName;
  ws.getCell(row, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.darkTitle } };
  ws.getRow(row).height = 22;
  row++;

  // ── PERÍODO ──
  ws.getCell(row, 1).value = "Período";
  ws.getCell(row, 1).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.neutral } };
  ws.getCell(row, 2).value = period;
  ws.getCell(row, 2).font = { name: "Calibri", size: 11, color: { argb: COLORS.neutral } };
  ws.getRow(row).height = 22;
  row++;

  // ── SALDO ATUAL ──
  ws.getCell(row, 1).value = "Saldo atual";
  ws.getCell(row, 1).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.neutral } };
  ws.getCell(row, 2).value = currentBalance;
  ws.getCell(row, 2).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
  ws.getCell(row, 2).font = { name: "Calibri", size: 13, bold: true, color: { argb: COLORS.darkTitle } };
  ws.getRow(row).height = 24;
  row++;

  // ── Espaço ──
  ws.getRow(row).height = 12;
  row++;

  // ── RESUMO DO PERÍODO ──
  ws.mergeCells(row, 1, row, 6);
  ws.getCell(row, 1).value = "RESUMO DO PERÍODO";
  ws.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.neutral } };
  ws.getRow(row).height = 22;
  row++;

  // ── Entradas ──
  ws.getCell(row, 1).value = "Entradas";
  ws.getCell(row, 1).font = { name: "Calibri", size: 11, color: { argb: COLORS.neutral } };
  ws.getCell(row, 2).value = statement.summary.totalIn;
  ws.getCell(row, 2).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
  ws.getCell(row, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.green } };
  ws.getRow(row).height = 20;
  row++;

  // ── Saídas ──
  ws.getCell(row, 1).value = "Saídas";
  ws.getCell(row, 1).font = { name: "Calibri", size: 11, color: { argb: COLORS.neutral } };
  ws.getCell(row, 2).value = -statement.summary.totalOut;
  ws.getCell(row, 2).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
  ws.getCell(row, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.red } };
  ws.getRow(row).height = 20;
  row++;

  // ── Movimentação ──
  ws.getCell(row, 1).value = "Movimentação";
  ws.getCell(row, 1).font = { name: "Calibri", size: 11, color: { argb: COLORS.neutral } };
  ws.getCell(row, 2).value = statement.summary.netMovement;
  ws.getCell(row, 2).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
  const netColor = statement.summary.netMovement >= 0 ? COLORS.green : COLORS.red;
  ws.getCell(row, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: netColor } };
  ws.getRow(row).height = 20;
  row++;

  // ── Espaço ──
  ws.getRow(row).height = 12;
  row++;

  // ── TÍTULO TABELA ──
  ws.mergeCells(row, 1, row, 6);
  ws.getCell(row, 1).value = "MOVIMENTAÇÕES";
  ws.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.neutral } };
  ws.getRow(row).height = 22;
  row++;

  // ── CABEÇALHO DA TABELA ──
  const headers = ["Data", "Descrição", "Categoria", "Entrada", "Saída", "Saldo"];
  const headerRow = ws.getRow(row);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: i >= 3 ? "right" : "left", vertical: "middle" };
    setBorder(cell, COLORS.headerBg);
  });
  headerRow.height = 24;
  const headerRowIndex = row;
  row++;

  // ── DADOS ──
  const rows = buildExportRows(statement.entries);
  rows.forEach((r, idx) => {
    const dataRow = ws.getRow(row);
    const isAlt = idx % 2 === 1;

    // Data
    dataRow.getCell(1).value = r.Data;
    dataRow.getCell(1).font = { name: "Calibri", size: 10, color: { argb: COLORS.neutral } };
    dataRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

    // Descrição
    dataRow.getCell(2).value = r.Descrição;
    dataRow.getCell(2).font = { name: "Calibri", size: 10, color: { argb: COLORS.darkTitle } };
    dataRow.getCell(2).alignment = { horizontal: "left", vertical: "middle" };

    // Categoria
    dataRow.getCell(3).value = r.Categoria;
    dataRow.getCell(3).font = { name: "Calibri", size: 10, color: { argb: COLORS.neutral } };
    dataRow.getCell(3).alignment = { horizontal: "left", vertical: "middle" };

    // Entrada
    if (r.Entrada != null) {
      dataRow.getCell(4).value = r.Entrada;
      dataRow.getCell(4).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
      dataRow.getCell(4).font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.green } };
    } else {
      dataRow.getCell(4).value = "";
    }
    dataRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };

    // Saída
    if (r.Saída != null) {
      dataRow.getCell(5).value = -r.Saída;
      dataRow.getCell(5).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
      dataRow.getCell(5).font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.red } };
    } else {
      dataRow.getCell(5).value = "";
    }
    dataRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

    // Saldo
    if (r.Saldo != null) {
      dataRow.getCell(6).value = r.Saldo;
      dataRow.getCell(6).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
      dataRow.getCell(6).font = { name: "Calibri", size: 10, color: { argb: COLORS.balanceNeutral } };
    } else {
      dataRow.getCell(6).value = "";
    }
    dataRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

    // Alternate row bg
    if (isAlt) {
      for (let c = 1; c <= 6; c++) {
        dataRow.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.altRow },
        };
      }
    }

    // Borders
    for (let c = 1; c <= 6; c++) {
      setBorder(dataRow.getCell(c));
    }

    dataRow.height = 20;
    row++;
  });

  // ── Autofilter na tabela ──
  ws.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: row - 1, column: 6 },
  };

  // ── Freeze panes (congelar abaixo do cabeçalho) ──
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRowIndex }];

  const safeName = sanitizeFilename(accountName);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Extrato_${safeName}_${referenceMonth}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportAccountStatementToPdf = (ctx: ExportContext): void => {
  const { accountName, referenceMonth, currentBalance, statement } = ctx;
  const period = formatPeriod(referenceMonth);

  const generatePdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // ── PALETTE ──
    const C = {
      darkTitle: [15, 23, 42] as const,
      headerBg: [30, 41, 59] as const,
      green: [22, 163, 74] as const,
      red: [220, 38, 38] as const,
      neutral: [55, 65, 81] as const,
      lightGray: [248, 250, 252] as const,
      border: [226, 232, 240] as const,
      white: [255, 255, 255] as const,
    };

    // ── TÍTULO ──
    let y = 18;
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.darkTitle);
    doc.text("EXTRATO FINANCEIRO", pageWidth / 2, y, { align: "center" });
    y += 10;

    // ── Linha decorativa ──
    doc.setDrawColor(...C.headerBg);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // ── CONTA ──
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("CONTA", margin, y);
    y += 5;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.darkTitle);
    doc.text(accountName, margin, y);
    y += 10;

    // ── PERÍODO ──
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("PERÍODO", margin, y);
    y += 5;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.darkTitle);
    doc.text(period, margin, y);
    y += 10;

    // ── SALDO ATUAL ──
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("SALDO ATUAL", margin, y);
    y += 5;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.darkTitle);
    doc.text(fmt(currentBalance), margin, y);
    y += 12;

    // ── RESUMO (3 blocos lado a lado) ──
    const blockW = (pageWidth - margin * 2) / 3;
    const blockY = y;

    // Background do resumo
    doc.setFillColor(...C.lightGray);
    doc.roundedRect(margin, blockY, pageWidth - margin * 2, 22, 2, 2, "F");

    // Entradas
    const x1 = margin + 4;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("ENTRADAS", x1, blockY + 7);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.green);
    doc.text(signFmt(statement.summary.totalIn), x1, blockY + 15);

    // Saídas
    const x2 = margin + blockW + 4;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("SAÍDAS", x2, blockY + 7);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.red);
    doc.text(signFmt(-statement.summary.totalOut), x2, blockY + 15);

    // Movimentação
    const x3 = margin + blockW * 2 + 4;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("MOVIMENTAÇÃO", x3, blockY + 7);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const netColor = statement.summary.netMovement >= 0 ? C.green : C.red;
    doc.setTextColor(...netColor);
    doc.text(signFmt(statement.summary.netMovement), x3, blockY + 15);

    y = blockY + 30;

    // ── TABELA ──
    const signedValue = (entry: AccountStatementEntry): string => {
      if (entry.direction === "in") return `+ ${fmt(entry.amount)}`;
      return `- ${fmt(entry.amount)}`;
    };

    const rows = statement.entries.map((entry) => [
      formatDateBR(entry.date),
      entry.description,
      entry.category ?? "",
      entry.direction === "in" ? signedValue(entry) : "",
      entry.direction === "out" ? signedValue(entry) : "",
      entry.balanceAfter != null ? fmt(entry.balanceAfter) : "",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Data", "Descrição", "Categoria", "Entrada", "Saída", "Saldo"]],
      body: rows,
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        textColor: C.darkTitle,
        lineColor: C.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: C.headerBg,
        textColor: C.white,
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: 3.5,
      },
      alternateRowStyles: { fillColor: C.lightGray },
      columnStyles: {
        0: { cellWidth: 22, halign: "center" },
        1: { cellWidth: 52, halign: "left" },
        2: { cellWidth: 32, halign: "left" },
        3: { cellWidth: 26, halign: "right", textColor: C.green, fontStyle: "bold" },
        4: { cellWidth: 26, halign: "right", textColor: C.red, fontStyle: "bold" },
        5: { cellWidth: 26, halign: "right", textColor: C.neutral },
      },
      margin: { left: margin, right: margin },
      showHead: "everyPage",
      didDrawPage: (data) => {
        // ── Rodapé: página X de Y ──
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.neutral);
        doc.text(
          `Página ${data.pageNumber} de ${pageCount}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" },
        );

        // ── Linha fina no rodapé ──
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      },
    });

    const safeName = sanitizeFilename(accountName);
    doc.save(`Extrato_${safeName}_${referenceMonth}.pdf`);
  };

  generatePdf();
};
