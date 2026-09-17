import type { CreditCardStatement, CreditCardStatementEntry } from "@/lib/credit-card-statement";

export interface CreditCardExportContext {
  cardName: string;
  referenceMonth: string;
  currentInvoice: number;
  committedAmount: number;
  availableAmount: number;
  limit: number;
  statement: CreditCardStatement;
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

const typeLabel = (sourceType: CreditCardStatementEntry["sourceType"]): string => {
  switch (sourceType) {
    case "purchase": return "Compra";
    case "payment": return "Pagamento";
    case "reversal": return "Estorno";
    default: return "";
  }
};

const visibleEntries = (entries: CreditCardStatementEntry[]) =>
  entries.filter((e) => e.sourceType !== "partial_record");

export const buildCardExportRows = (entries: CreditCardStatementEntry[]) =>
  visibleEntries(entries).map((entry) => ({
    Data: formatDateBR(entry.date),
    Descrição: entry.description,
    Categoria: entry.category ?? "",
    Parcela: entry.installmentInfo ?? "",
    Tipo: typeLabel(entry.sourceType),
    Valor: entry.direction === "charge" ? entry.amount : -entry.amount,
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
} as const;

const setBorder = (cell: any, color = COLORS.border) => {
  cell.border = {
    top: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
};

export const exportCreditCardStatementToExcel = async (ctx: CreditCardExportContext): Promise<void> => {
  const { cardName, referenceMonth, currentInvoice, committedAmount, availableAmount, limit, statement } = ctx;
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
    { width: 36 },
    { width: 20 },
    { width: 12 },
    { width: 16 },
    { width: 22 },
  ];

  let row = 1;

  // ── TÍTULO ──
  ws.mergeCells(row, 1, row, 6);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = "EXTRATO DE CARTÃO DE CRÉDITO";
  titleCell.font = { name: "Calibri", size: 18, bold: true, color: { argb: COLORS.darkTitle } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 36;
  row++;

  ws.getRow(row).height = 8;
  row++;

  // ── CARTÃO ──
  ws.getCell(row, 1).value = "Cartão";
  ws.getCell(row, 1).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.neutral } };
  ws.getCell(row, 2).value = cardName;
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

  ws.getRow(row).height = 12;
  row++;

  // ── SITUAÇÃO ATUAL ──
  ws.mergeCells(row, 1, row, 6);
  ws.getCell(row, 1).value = "SITUAÇÃO ATUAL";
  ws.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.neutral } };
  ws.getRow(row).height = 22;
  row++;

  const situationData = [
    ["Fatura atual", currentInvoice],
    ["Limite comprometido", committedAmount],
    ["Limite disponível", availableAmount],
    ["Limite total", limit],
  ];

  for (const [label, value] of situationData) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 11, color: { argb: COLORS.neutral } };
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
    ws.getCell(row, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.darkTitle } };
    ws.getRow(row).height = 20;
    row++;
  }

  ws.getRow(row).height = 12;
  row++;

  // ── RESUMO DO PERÍODO ──
  ws.mergeCells(row, 1, row, 6);
  ws.getCell(row, 1).value = `MOVIMENTAÇÕES DE ${period.toUpperCase()}`;
  ws.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.neutral } };
  ws.getRow(row).height = 22;
  row++;

  const summaryData = [
    ["Compras", statement.summary.totalPurchases, COLORS.red],
    ["Pagamentos", statement.summary.totalPayments, COLORS.green],
    ["Estornos", statement.summary.totalCredits, COLORS.green],
  ] as const;

  for (const [label, value, color] of summaryData) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 11, color: { argb: COLORS.neutral } };
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
    ws.getCell(row, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: color } };
    ws.getRow(row).height = 20;
    row++;
  }

  ws.getRow(row).height = 12;
  row++;

  // ── TÍTULO TABELA ──
  ws.mergeCells(row, 1, row, 6);
  ws.getCell(row, 1).value = "MOVIMENTAÇÕES";
  ws.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.neutral } };
  ws.getRow(row).height = 22;
  row++;

  // ── CABEÇALHO DA TABELA ──
  const headers = ["Data", "Descrição", "Categoria", "Parcela", "Tipo", "Valor"];
  const headerRow = ws.getRow(row);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: i === 5 ? "right" : "left", vertical: "middle" };
    setBorder(cell, COLORS.headerBg);
  });
  headerRow.height = 24;
  const headerRowIndex = row;
  row++;

  // ── DADOS ──
  const rows = buildCardExportRows(statement.entries);
  rows.forEach((r, idx) => {
    const dataRow = ws.getRow(row);
    const isAlt = idx % 2 === 1;
    const isCharge = r.Valor > 0;

    dataRow.getCell(1).value = r.Data;
    dataRow.getCell(1).font = { name: "Calibri", size: 10, color: { argb: COLORS.neutral } };
    dataRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

    dataRow.getCell(2).value = r.Descrição;
    dataRow.getCell(2).font = { name: "Calibri", size: 10, color: { argb: COLORS.darkTitle } };
    dataRow.getCell(2).alignment = { horizontal: "left", vertical: "middle" };

    dataRow.getCell(3).value = r.Categoria;
    dataRow.getCell(3).font = { name: "Calibri", size: 10, color: { argb: COLORS.neutral } };
    dataRow.getCell(3).alignment = { horizontal: "left", vertical: "middle" };

    dataRow.getCell(4).value = r.Parcela;
    dataRow.getCell(4).font = { name: "Calibri", size: 10, color: { argb: COLORS.neutral } };
    dataRow.getCell(4).alignment = { horizontal: "center", vertical: "middle" };

    dataRow.getCell(5).value = r.Tipo;
    dataRow.getCell(5).font = { name: "Calibri", size: 10, color: { argb: COLORS.neutral } };
    dataRow.getCell(5).alignment = { horizontal: "left", vertical: "middle" };

    dataRow.getCell(6).value = r.Valor;
    dataRow.getCell(6).numFmt = '+R$ #,##0.00;-R$ #,##0.00;"R$ 0,00"';
    dataRow.getCell(6).font = { name: "Calibri", size: 10, bold: true, color: { argb: isCharge ? COLORS.red : COLORS.green } };
    dataRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

    if (isAlt) {
      for (let c = 1; c <= 6; c++) {
        dataRow.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.altRow },
        };
      }
    }

    for (let c = 1; c <= 6; c++) {
      setBorder(dataRow.getCell(c));
    }

    dataRow.height = 20;
    row++;
  });

  ws.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: row - 1, column: 6 },
  };

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRowIndex }];

  const safeName = sanitizeFilename(cardName);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Extrato_Cartao_${safeName}_${referenceMonth}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportCreditCardStatementToPdf = (ctx: CreditCardExportContext): void => {
  const { cardName, referenceMonth, currentInvoice, committedAmount, availableAmount, limit, statement } = ctx;
  const period = formatPeriod(referenceMonth);

  const generatePdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

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
    doc.text("EXTRATO DE CARTÃO DE CRÉDITO", pageWidth / 2, y, { align: "center" });
    y += 8;

    doc.setDrawColor(...C.headerBg);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // ── CARTÃO ──
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("CARTÃO", margin, y);
    y += 4;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.darkTitle);
    doc.text(cardName, margin, y);
    y += 10;

    // ── PERÍODO ──
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("PERÍODO", margin, y);
    y += 4;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.darkTitle);
    doc.text(period, margin, y);
    y += 10;

    // ── SITUAÇÃO ATUAL (bloco) ──
    doc.setFillColor(...C.lightGray);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 20, 2, 2, "F");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("SITUAÇÃO ATUAL", margin + 4, y + 5);

    const sitY = y + 10;
    const sitColW = (pageWidth - margin * 2 - 8) / 4;

    const sitItems = [
      ["Fatura atual", fmt(currentInvoice)],
      ["Comprometido", fmt(committedAmount)],
      ["Disponível", fmt(availableAmount)],
      ["Limite total", fmt(limit)],
    ];

    sitItems.forEach(([label, value], i) => {
      const sx = margin + 4 + i * sitColW;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.neutral);
      doc.text(label, sx, sitY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.darkTitle);
      doc.text(value, sx, sitY + 5);
    });

    y += 26;

    // ── RESUMO DO PERÍODO ──
    const blockW = (pageWidth - margin * 2) / 3;
    const blockY = y;

    doc.setFillColor(...C.lightGray);
    doc.roundedRect(margin, blockY, pageWidth - margin * 2, 16, 2, 2, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("COMPRAS", margin + 4, blockY + 5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.red);
    doc.text(fmt(statement.summary.totalPurchases), margin + 4, blockY + 12);

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("PAGAMENTOS", margin + blockW + 4, blockY + 5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.green);
    doc.text(fmt(statement.summary.totalPayments), margin + blockW + 4, blockY + 12);

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.neutral);
    doc.text("ESTORNOS", margin + blockW * 2 + 4, blockY + 5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.green);
    doc.text(fmt(statement.summary.totalCredits), margin + blockW * 2 + 4, blockY + 12);

    y = blockY + 22;

    // ── TABELA ──
    // Larguras: 24+50+32+18+24+34 = 182mm (A4 útil)
    const rows = buildCardExportRows(statement.entries).map((r) => [
      r.Data,
      r.Descrição,
      r.Categoria,
      r.Parcela,
      r.Tipo,
      signFmt(r.Valor),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Data", "Descrição", "Categoria", "Parcela", "Tipo", "Valor"]],
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
        0: { cellWidth: 24, halign: "center" },
        1: { cellWidth: 50, halign: "left" },
        2: { cellWidth: 32, halign: "left" },
        3: { cellWidth: 18, halign: "center" },
        4: { cellWidth: 24, halign: "left" },
        5: { cellWidth: 34, halign: "right", fontStyle: "bold" },
      },
      margin: { left: margin, right: margin },
      showHead: "everyPage",
      didDrawPage: (data) => {
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

        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      },
    });

    const safeName = sanitizeFilename(cardName);
    doc.save(`Extrato_Cartao_${safeName}_${referenceMonth}.pdf`);
  };

  generatePdf();
};
