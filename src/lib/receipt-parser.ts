export interface LocalParsedReceipt {
  is_receipt: boolean;
  type: "income" | "expense" | "unknown";
  amount: number | null;
  date: string | null;
  time: string | null;
  counterparty: string | null;
  institution: string | null;
  payment_method: string | null;
  category_hint: string | null;
  receipt_id: string | null;
  merchant_name: string | null;
  tax_id: string | null;
  fiscal_document_number: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  title: string | null;
  notes: string | null;
  purchased_items?: PurchasedItem[];
  item_values_are_final?: boolean;
  low_confidence_fields: string[];
}

export interface PurchasedItem {
  name: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
}

const normalize = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const parseBrlValue = (raw: string): number | null => {
  const cleaned = raw.replace(/[^\d,.]/g, "");
  if (!cleaned) return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    const lastDot = cleaned.lastIndexOf(".");
    const afterDot = cleaned.slice(lastDot + 1);
    if (afterDot.length <= 2) {
      normalized = cleaned;
    } else {
      normalized = cleaned.replace(/\./g, "");
    }
  } else {
    normalized = cleaned;
  }
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const EXCLUDE_VALUE_LINES = /(?:tribut|impost|descont|troco|taxa|total\s*incidentes)/i;

function extractValue(text: string): { value: number | null; lowConfidence: boolean } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const highPriorityPatterns = [
    /(?:valor\s*[àa]\s*pagar|valor\s*pago)\s*:?\s*R?\$?\s*:?\s*(\d[\d.,\s]*\d)/i,
    /(?:total\s*[àa]\s*pagar|total\s*pago|valor\s*final)\s*:?\s*R?\$?\s*:?\s*(\d[\d.,\s]*\d)/i,
    /(?:valor\s*total)\s*:?\s*R?\$?\s*:?\s*(\d[\d.,\s]*\d)/i,
    /(?<!sub)(?:total)\s*:?\s*R?\$?\s*:?\s*(\d[\d.,\s]*\d)/i,
  ];

  for (const pattern of highPriorityPatterns) {
    for (const line of lines) {
      if (EXCLUDE_VALUE_LINES.test(line)) continue;
      const match = line.match(pattern);
      if (match) {
        const parsed = parseBrlValue(match[1]);
        if (parsed !== null) return { value: parsed, lowConfidence: false };
      }
    }
  }

  const rBrlPattern = /R\$\s*:?\s*(\d[\d.,\s]*\d)/g;
  const rBrlValues: { value: number; index: number; lineIndex: number; line: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (EXCLUDE_VALUE_LINES.test(lines[i])) continue;
    let match: RegExpExecArray | null;
    while ((match = rBrlPattern.exec(lines[i])) !== null) {
      const parsed = parseBrlValue(match[1]);
      if (parsed !== null) {
        rBrlValues.push({ value: parsed, index: match.index, lineIndex: i, line: lines[i] });
      }
    }
    rBrlPattern.lastIndex = 0;
  }

  if (rBrlValues.length > 0) {
    const lastLine = lines.length - 1;
    const nearEnd = rBrlValues.filter((v) => lastLine - v.lineIndex <= 3);
    if (nearEnd.length > 0) {
      for (const v of nearEnd) {
        if (/\btotal\b/i.test(v.line) && !/\bsubtotal\b/i.test(v.line)) {
          return { value: v.value, lowConfidence: false };
        }
      }
      const maxVal = Math.max(...nearEnd.map((v) => v.value));
      return { value: maxVal, lowConfidence: rBrlValues.length > 3 };
    }
    const maxVal = Math.max(...rBrlValues.map((v) => v.value));
    return { value: maxVal, lowConfidence: true };
  }

  const bareNumberPattern = /(\d{1,3}(?:\.\d{3})+,\d{2})\b/g;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (EXCLUDE_VALUE_LINES.test(lines[i])) continue;
    let match: RegExpExecArray | null;
    while ((match = bareNumberPattern.exec(lines[i])) !== null) {
      const parsed = parseBrlValue(match[1]);
      if (parsed !== null && parsed < 100000) {
        return { value: parsed, lowConfidence: true };
      }
    }
    bareNumberPattern.lastIndex = 0;
  }

  return { value: null, lowConfidence: false };
}

function extractDate(text: string): { date: string | null; lowConfidence: boolean } {
  const datePattern = /\b(\d{2})[-/.](\d{2})[-/.](\d{4})\b/g;
  const dates: { date: string; raw: string; index: number; line: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = datePattern.exec(text)) !== null) {
    const [, dd, mm, yyyy] = match;
    const day = parseInt(dd, 10);
    const month = parseInt(mm, 10);
    const year = parseInt(yyyy, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineEnd = text.indexOf("\n", match.index + match[0].length);
      const line = text.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
      dates.push({ date: dateStr, raw: match[0], index: match.index, line });
    }
  }

  if (dates.length === 0) return { date: null, lowConfidence: false };
  if (dates.length === 1) return { date: dates[0].date, lowConfidence: false };

  const preferredPatterns = [
    /(?:pagamento|data\s*(?:de\s*)?pagamento)/i,
    /(?:emiss|data\s*(?:de\s*)?(?:emiss|transa))/i,
  ];

  for (const pattern of preferredPatterns) {
    for (const d of dates) {
      if (pattern.test(d.line)) {
        return { date: d.date, lowConfidence: false };
      }
    }
  }

  const dateCounts = new Map<string, number>();
  for (const d of dates) {
    dateCounts.set(d.date, (dateCounts.get(d.date) ?? 0) + 1);
  }

  const hasTime = (d: typeof dates[0]) => /\d{1,2}[h:]\d{2}/.test(d.line);

  const repeatedDates = [...dateCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([date]) => date);

  if (repeatedDates.length === 1) {
    return { date: repeatedDates[0], lowConfidence: false };
  }

  const datesWithTime = dates.filter(hasTime);
  if (datesWithTime.length > 0) {
    const timeDateCounts = new Map<string, number>();
    for (const d of datesWithTime) {
      timeDateCounts.set(d.date, (timeDateCounts.get(d.date) ?? 0) + 1);
    }

    const preferred = [...timeDateCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (preferred.length > 0) {
      return { date: preferred[0][0], lowConfidence: preferred[0][1] < 2 };
    }
  }

  return { date: dates[0].date, lowConfidence: true };
}

function extractTime(text: string): string | null {
  const timePattern = /\b(\d{1,2})[h:](\d{2})(?:[h:](\d{2}))?\b/i;
  const match = text.match(timePattern);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const sec = match[3] != null ? parseInt(match[3], 10) : 0;
  if (hour < 0 || hour > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function extractType(text: string): { type: "income" | "expense" | "unknown"; lowConfidence: boolean } {
  const normalized = normalize(text);

  if (/\bpix\s*enviad[oa]\b/.test(normalized) || /\btransfer[eê]ncia\s*enviad[oa]\b/.test(normalized)) {
    return { type: "expense", lowConfidence: false };
  }
  if (/\bpix\s*recebid[oa]\b/.test(normalized) || /\btransfer[eê]ncia\s*recebid[oa]\b/.test(normalized)) {
    return { type: "income", lowConfidence: false };
  }

  if (/\benvio\s*de\s*pix\b/.test(normalized) || /\benvio\s*de\s*transfer[eê]ncia\b/.test(normalized)) {
    return { type: "expense", lowConfidence: false };
  }
  if (/\brecebimento\s*de\s*pix\b/.test(normalized) || /\brecebimento\s*de\s*transfer[eê]ncia\b/.test(normalized)) {
    return { type: "income", lowConfidence: false };
  }

  if (/\bpix\b/.test(normalized)) {
    if (/envi|envio|pago|pagamento/i.test(text)) {
      return { type: "expense", lowConfidence: false };
    }
    if (/receb|deposit/i.test(text)) {
      return { type: "income", lowConfidence: false };
    }
  }

  if (/\bcompra\b/.test(normalized) || /\bcart[aã]o\b/.test(normalized) || /\bd[eé]bito\b/.test(normalized)) {
    return { type: "expense", lowConfidence: false };
  }

  if (/\bcr[eé]dito\b/.test(normalized) && !/\bcompra\b/.test(normalized)) {
    if (/receb|deposit|sal[aá]rio/i.test(text)) {
      return { type: "income", lowConfidence: false };
    }
  }

  if (/\bnf[\s-]?e\b/i.test(text) || /\bcupom\b/i.test(text) || /\bvenda\b/i.test(text)) {
    return { type: "expense", lowConfidence: true };
  }

  return { type: "unknown", lowConfidence: true };
}

function extractPaymentMethod(text: string): { method: string | null; lowConfidence: boolean } {
  const normalized = normalize(text);

  const normalizedSpaced = normalized
    .replace(/tr[ae]nsf[eê]r[\s]*[eê]ncia/g, "transferencia")
    .replace(/tr[ae]nsf[eê]r[\s]*[eê]ncia/g, "transferencia");

  if (/\bpix\b/.test(normalizedSpaced)) return { method: "Pix", lowConfidence: false };
  if (/\btef\b/.test(normalizedSpaced)) return { method: "Transferência", lowConfidence: false };
  if (/\btransferencia\s*banc[aá]ria\b/.test(normalizedSpaced)) return { method: "Transferência", lowConfidence: false };
  if (/\btransferencia\b/.test(normalizedSpaced)) return { method: "Transferência", lowConfidence: false };
  if (/\bboleto\b/.test(normalizedSpaced)) return { method: "Boleto", lowConfidence: false };
  if (/\bcart[aã]o\s*de\s*cr[eé]dito\b/.test(normalizedSpaced)) return { method: "Cartão de Crédito", lowConfidence: false };
  if (/\bcart[aã]o\s*de\s*d[eé]bito\b/.test(normalizedSpaced)) return { method: "Cartão de Débito", lowConfidence: false };
  if (/\bcart[aã]o\b/.test(normalizedSpaced)) return { method: "Cartão de Crédito", lowConfidence: true };
  if (/\bdinheiro\b/.test(normalizedSpaced) || /\bres[óo]sto\b/.test(normalizedSpaced)) return { method: "Dinheiro", lowConfidence: false };

  return { method: null, lowConfidence: false };
}

function extractEstablishment(text: string): { name: string | null; lowConfidence: boolean } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines.slice(0, 8)) {
    if (/\b(?:ltda|me|eireli|s\.?a\.?|s\.?a|epp|ltda\.?me)\b/i.test(line)) {
      const cleaned = line.replace(/[^\w\s\u00C0-\u024F.,&-]/g, "").trim();
      if (cleaned.length > 3) return { name: cleaned, lowConfidence: false };
    }
  }

  const pixReceived = /\b(?:quem\s*pagou|remetente|origem|pagador)\b/i;
  const pixSent = /\b(?:quem\s*recebeu|recebedor|destino|favorecido)\b/i;

  if (pixSent.test(text)) {
    for (let i = 0; i < lines.length; i++) {
      if (pixSent.test(lines[i])) {
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && nextLine.length > 2 && !/R\$/.test(nextLine)) {
          return { name: nextLine, lowConfidence: false };
        }
      }
    }
  }

  if (pixReceived.test(text)) {
    for (let i = 0; i < lines.length; i++) {
      if (pixReceived.test(lines[i])) {
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && nextLine.length > 2 && !/R\$/.test(nextLine)) {
          return { name: nextLine, lowConfidence: false };
        }
      }
    }
  }

  for (const line of lines.slice(0, 10)) {
    if (/[A-Z]{3,}/.test(line) && !/\d{4,}/.test(line) && !/R\$/.test(line) && line.length > 3 && line.length < 80) {
      const cleaned = line.replace(/[^\w\s\u00C0-\u024F.,&-]/g, "").trim();
      if (cleaned.length > 3) return { name: cleaned, lowConfidence: true };
    }
  }

  return { name: null, lowConfidence: false };
}

function extractCnpjCpf(text: string): { taxId: string | null; lowConfidence: boolean } {
  const cnpjPattern = /\b(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2})\b/;
  const cnpjMatch = text.match(cnpjPattern);
  if (cnpjMatch) {
    const raw = cnpjMatch[1].replace(/[^\d]/g, "");
    if (raw.length === 14) {
      const formatted = raw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
      return { taxId: formatted, lowConfidence: false };
    }
  }

  const cpfPattern = /\b(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})\b/;
  const cpfMatch = text.match(cpfPattern);
  if (cpfMatch) {
    const raw = cpfMatch[1].replace(/[^\d]/g, "");
    if (raw.length === 11) {
      const formatted = raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      return { taxId: formatted, lowConfidence: false };
    }
  }

  const cnpjAlt = /\b(\d{14})\b/;
  const cnpjAltMatch = text.match(cnpjAlt);
  if (cnpjAltMatch) {
    const raw = cnpjAltMatch[1];
    if (/^\d{14}$/.test(raw)) {
      const formatted = raw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
      return { taxId: formatted, lowConfidence: true };
    }
  }

  return { taxId: null, lowConfidence: false };
}

function extractFiscalDocument(text: string): { doc: string | null; lowConfidence: boolean } {
  const patterns = [
    /(?:cupom\s*(?:fiscal)?|n[uú]mero\s*(?:do\s*)?cupom|n[úu]mero\s*fiscal)\s*(?:n[º°]?\s*)?:?\s*(\d{3,})/i,
    /(?:ecf|ecf[\s:]+)\s*(?:n[º°]?\s*)?(\d{1,6})/i,
    /(?:nnf|n\s*nf)\s*:?\s*(\d{3,})/i,
    /(?:nf[\s-]?e|nfe|nota\s*fiscal\s*(?:eletr[oô]nica)?)\s*(?:n[uú]mero\s*)?:?\s*(\d{5,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return { doc: match[1].replace(/\s/g, ""), lowConfidence: false };
    }
  }

  const chavePattern = /(?:chave\s*(?:de\s*)?(?:acesso|nf[\s-]?e))\s*:?\s*(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/i;
  const chaveMatch = text.match(chavePattern);
  if (chaveMatch) {
    return { doc: chaveMatch[1].replace(/\s/g, ""), lowConfidence: false };
  }

  return { doc: null, lowConfidence: false };
}

function extractReceiptId(text: string): { id: string | null; lowConfidence: boolean } {
  const patterns = [
    /(?:identificador|id)\s*(?:da\s*)?(?:transa[çc][aã]o|opera[çc][aã]o|pix)\s*:?\s*([A-Za-z0-9\-_]+)/i,
    /(?:id\s*do\s*comprovante|comprovante\s*n[º°]?)\s*:?\s*([A-Za-z0-9\-_]+)/i,
    /(?:protocolo|c[oó]digo\s*de\s*verifica[çc][aã]o)\s*:?\s*(\d{6,})/i,
    /(?:nsu|nsu\s*doc|nsu\s*host)\s*:?\s*(\d{6,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].length >= 4) {
      return { id: match[1], lowConfidence: false };
    }
  }

  return { id: null, lowConfidence: false };
}

function extractInstitution(text: string): { institution: string | null; lowConfidence: boolean } {
  const normalized = normalize(text);

  const banks = [
    "Banco Inter", "Itaú Unibanco", "Itaú", "Bradesco", "Banco do Brasil", "Caixa Econômica", "Caixa",
    "Santander", "Nubank", "C6 Bank", "BTG Pactual", "BTG", "Original",
    "Sicredi", "Sicoob", "Pan", "Credicard", "BV", "BMW", "BMG",
    "Next", "Neon", "PagSeguro", "Mercado Pago", "PicPay", "Stone",
  ];

  for (const bank of banks) {
    if (normalized.includes(normalize(bank))) {
      return { institution: bank, lowConfidence: false };
    }
  }

  const bankPatterns = [
    /(?:banco|institui[çc][aã]o|bank)\s*:?\s*(.+)/i,
    /(?:institui[çc][aã]o\s*(?:recebedora|pagadora|de\s*origem|de\s*destino))\s*:?\s*(.+)/i,
  ];

  for (const pattern of bankPatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = match[1].trim().substring(0, 60);
      if (value.length > 2 && !/R\$/.test(value)) {
        value = value.replace(/\s*(?:S\.?A\.?|S\.?A|Ltda|Ltda\.?Me|ME|EIRELI|EPP)\s*$/i, "").trim();
        if (value.length > 2) return { institution: value, lowConfidence: false };
      }
    }
  }

  return { institution: null, lowConfidence: false };
}

const EXCLUDE_ITEM_LINE = /(?:cnpj|cpf|endere[çc]|centro|rua\b|av\.\s|avenida|pagamento|transfer[eê]ncia|chave|acesso|nfc|autoriza[çc][aã]o|protocolo|consumidor|tribut|impost|cupom|s[eé]rie|caixa|cxa|cod\s*venda|valor\s*total|descont|valor\s*[àa]\s*pagar|nota\s*fiscal|documento|auxiliar|htips?|www|\.gov|consulte)/i;

function parseDiscountValue(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.]/g, "");
  if (!cleaned) return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    normalized = cleaned;
  } else if (cleaned.length === 4) {
    normalized = cleaned.slice(0, -2) + "." + cleaned.slice(-2);
  } else {
    normalized = cleaned;
  }
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
}

const DISCOUNT_LINE_PATTERN = /\bDe\s+([\d.,]+)\s+(?:Poi|PoI|P0r|Por)\s+([\d.,]+)\s*[-–—]?\s*desconto\b/i;
const DISCOUNT_LINE_PATTERN_LENIENT = /\bDe\s+\S+\s+(?:Poi|PoI|P0r|Por)\s+([\d.,]+)\s*[-–—]?\s*desconto\b/i;

function sanitizeItemName(raw: string): string {
  let name = raw;

  // 1. Remove leading SKU/product codes (e.g. "16204 ", "04780 ", "BAU23 ")
  name = name.replace(/^\w{2,5}\s+/, "");

  // 2. Remove quantity/unit column markers (e.g. "1X UN", "IX UN", "LX UN", "2 UN")
  //    OCR may read "1" as "I" or "L", so accept those as well.
  name = name.replace(/\s+\d?[ILX]X?\s*(?:UN|cx|lt|kg|mt)\b/gi, "");

  // 3. Remove trailing price-artifact digits:
  //    a) When at least one group has a separator (., /), remove all trailing groups
  //       e.g. " 4/46 47", " 27.24 27,24", " 31,34"
  //    b) Otherwise, remove only 4+ pure digit groups (price in centavos)
  //       e.g. " 15243" but NOT " 200" (product dosage)
  name = name.replace(/(?:\s\d[\d]*[.,/][\d.,/]*)+(?:\s\d[\d.,/]+)*$/, "");
  name = name.replace(/\s\d{4,}$/, "");

  // 4. Collapse multiple spaces and trim
  name = name.replace(/\s{2,}/g, " ").trim();

  return name;
}

function cleanItemName(name: string, knownPrice: number | null): string {
  if (knownPrice === null) return name;
  const priceStr = knownPrice.toFixed(2).replace(".", ",");
  const priceNoDec = Math.round(knownPrice * 100).toString();
  let cleaned = name;
  if (cleaned.endsWith(priceNoDec) && priceNoDec.length >= 3) {
    cleaned = cleaned.slice(0, -priceNoDec.length).trimEnd();
  }
  if (cleaned.endsWith(priceStr.replace(",", ""))) {
    cleaned = cleaned.slice(0, -priceStr.replace(",", "").length).trimEnd();
  }
  return cleaned;
}

function extractItems(text: string): PurchasedItem[] {
  const items: PurchasedItem[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let itemRegionStart = -1;
  let itemRegionEnd = lines.length;

  const headerPattern = /\b(?:COD|C[OÓ]DIGO|DESC|PRODUTO|ITEM|QTD|QUANT|VL\s*UNIT|VL\s*ITEM|VALOR\s*(?:UNIT|ITEM))\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      itemRegionStart = i + 1;
      break;
    }
  }

  if (itemRegionStart < 0) {
    const ocrDescPattern = /I?DESCR[IO][ÇC][AÃ]U?\b/i;
    const ocrQtyPattern = /\bQTD?\b/i;
    for (let i = 0; i < lines.length; i++) {
      if (ocrDescPattern.test(lines[i]) && ocrQtyPattern.test(lines[i])) {
        itemRegionStart = i + 1;
        break;
      }
    }
  }

  const footerPattern = /\b(?:Qtde\.?\s*Total\s*de\s*Itens|Total\s*de\s*Itens|Subtotal|Sub\s*total|TOTAL:?\s*R\$|FORMA\s*(?:DE\s*)?PAGAMENTO|VALOR\s*(?:A|À)\s*PAGAR|VALOR\s*TOTAL|VALOR\s*PAGO)\b/i;
  for (let i = itemRegionStart >= 0 ? itemRegionStart : 0; i < lines.length; i++) {
    if (footerPattern.test(lines[i])) {
      itemRegionEnd = i;
      break;
    }
  }

  if (itemRegionStart < 0) {
    return items;
  }

  const itemPattern = /^(.+?)\s+(\d+)\s+x\s+R?\$?\s*([\d.,]+)\s+R?\$?\s*([\d.,]+)$/;
  const simpleItemPattern = /^(.+?)\s+R?\$?\s*([\d.,]+)$/;
  const qtyItemPattern = /^(.+?)\s+(\d+|[Ii])\s*[Xx]?\s*(?:un|cx|lt|kg|mt)\s+R?\$?\s*([\d.,]+)\s+R?\$?\s*([\d.,]+)$/i;

  for (let i = itemRegionStart; i < itemRegionEnd; i++) {
    const line = lines[i];

    const discountMatch = line.match(DISCOUNT_LINE_PATTERN);
    const discountMatchLenient = !discountMatch ? line.match(DISCOUNT_LINE_PATTERN_LENIENT) : null;
    if (discountMatch || discountMatchLenient) {
      if (items.length > 0) {
        const groups = discountMatch ?? discountMatchLenient!;
        const finalPrice = parseDiscountValue(groups[2] ?? groups[1]);
        if (finalPrice !== null) {
          const lastItem = items[items.length - 1];
          lastItem.total = finalPrice;
          lastItem.unit_price = finalPrice;
          lastItem.name = cleanItemName(lastItem.name, finalPrice);
        }
      }
      continue;
    }

    // Fallback for OCR-corrupted discount lines: both strict and lenient patterns
    // failed, but the line still mentions "descont".  Extract exactly one reliable
    // monetary candidate after the word "descont" and treat it as the discount
    // amount, computing the final price from the previous item's unit_price.
    if (/descont/i.test(line) && items.length > 0) {
      const lastItem = items[items.length - 1];
      const originalPrice = lastItem.unit_price;
      if (originalPrice !== null && originalPrice > 0) {
        const descontPos = line.toLowerCase().indexOf("descont");
        const afterDescont = line.substring(descontPos);
        const monetaryRe = /\b(\d+[.,]\d{1,2})\b/g;
        const monetaryCandidates: number[] = [];
        let m: RegExpExecArray | null;
        while ((m = monetaryRe.exec(afterDescont)) !== null) {
          const parsed = parseBrlValue(m[1]);
          if (parsed !== null) monetaryCandidates.push(parsed);
        }
        if (monetaryCandidates.length === 1) {
          const discount = monetaryCandidates[0];
          const result = originalPrice - discount;
          if (
            discount > 0 &&
            discount < originalPrice &&
            Number.isFinite(originalPrice) &&
            Number.isFinite(discount) &&
            Number.isFinite(result) &&
            result > 0
          ) {
            lastItem.total = result;
            lastItem.unit_price = result;
            lastItem.name = cleanItemName(lastItem.name, result);
          }
        }
      }
      continue;
    }

    if (EXCLUDE_ITEM_LINE.test(line)) continue;

    let match = line.match(itemPattern) || line.match(qtyItemPattern);
    if (match) {
      const name = sanitizeItemName(match[1].trim());
      if (name.length < 2 || /\b(?:total|subtotal|desconto|troco|pagamento|valor)\b/i.test(name)) continue;

      const quantity = parseInt(match[2], 10);
      const unitPrice = parseBrlValue(match[3]);
      const total = parseBrlValue(match[4]);

      if (unitPrice !== null || total !== null) {
        items.push({
          name,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
          unit_price: unitPrice,
          total: total,
        });
      }
      continue;
    }

    // Market column format: "PRODUCT NAME   QTY   R$UNIT   R$TOTAL"
    // Handles lines where quantity is separated by whitespace (no "X UN" marker)
    // and R$ may or may not have a space before the number.
    const columnItemPattern = /^(.+?)\s+(\d{1,2})\s+R?\$?\s*([\d.,]+)\s+R?\$?\s*([\d.,]+)\s*$/;
    match = line.match(columnItemPattern);
    if (match) {
      const name = sanitizeItemName(match[1].trim());
      if (name.length < 2 || /\b(?:total|subtotal|desconto|troco|pagamento|valor)\b/i.test(name)) continue;
      if (EXCLUDE_ITEM_LINE.test(name)) continue;

      const quantity = parseInt(match[2], 10);
      const unitPrice = parseBrlValue(match[3]);
      const total = parseBrlValue(match[4]);

      if (unitPrice !== null && total !== null) {
        items.push({
          name,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
          unit_price: unitPrice,
          total,
        });
      }
      continue;
    }

    match = line.match(simpleItemPattern);
    if (match) {
      const name = sanitizeItemName(match[1].trim());
      if (name.length < 2 || /\b(?:total|subtotal|desconto|troco|pagamento|valor)\b/i.test(name)) continue;
      if (EXCLUDE_ITEM_LINE.test(name)) continue;

      const price = parseBrlValue(match[2]);
      if (price !== null && price < 10000) {
        items.push({ name, quantity: null, unit_price: price, total: price });
      }
      continue;
    }

    if (i + 1 < itemRegionEnd) {
      const multiFirst = line.match(/^(\d{3})\s+(\d+)\s+(.+)$/);
      if (multiFirst) {
        const nextLine = lines[i + 1];
        const multiSecond = nextLine.match(/^\s*(\S+)\s+[xX]\s*(\d+[.,]\d+)\s+.*?(\d+[.,]\d+)\s*$/);
        if (multiSecond) {
          const name = sanitizeItemName(multiFirst[3].trim());
          if (name.length >= 2 && !/\b(?:total|subtotal|desconto|troco|pagamento|valor)\b/i.test(name)) {
            const quantity = parseBrlValue(multiSecond[1]);
            const unitPrice = parseBrlValue(multiSecond[2]);
            const total = parseBrlValue(multiSecond[3]);
            if (unitPrice !== null && total !== null) {
              items.push({
                name,
                quantity: Number.isFinite(quantity) && quantity! > 0 ? quantity : null,
                unit_price: unitPrice,
                total,
              });
              i++;
              continue;
            }
          }
        }
      }
    }
  }

  return items;
}

function detectReceipt(text: string): boolean {
  const indicators = [
    /\br\$[\s\d.,]+/i,
    /\bpix\b/i,
    /\bcomprovante\b/i,
    /\bcupom\b/i,
    /\bnf[\s-]?e\b/i,
    /\bvenda\b/i,
    /\bpgto\b/i,
    /\bpagamento\b/i,
    /\btotal\b/i,
    /\bvalor\b/i,
    /\bdata\b.*\d{2}[-/]\d{2}[-/]\d{4}/i,
  ];

  let count = 0;
  for (const pattern of indicators) {
    if (pattern.test(text)) count++;
  }
  return count >= 2;
}

function guessCategory(type: "income" | "expense" | "unknown", text: string): string | null {
  const normalized = normalize(text);

  if (type === "income") {
    if (/\bsal[aá]rio\b/.test(normalized)) return "Salário";
    if (/\bfreelance\b/.test(normalized) || /\bservi[çc]o\b/.test(normalized)) return "Freelance";
    return null;
  }

  if (/\b(?:farm[aá]cia|drog|rem[eé]dio|medicamento|sa[uú]de|hospital|cl[ií]nica)\b/.test(normalized)) return "Saúde";
  if (/\b(?:supermercado|mercado|alimenta[çc][aã]o|super|hiper|comida|alim|padaria|açougue|feira)\b/.test(normalized)) return "Alimentação";
  if (/\b(?:posto|combust[ií]vel|gasolina|etanol|diesel|estacionamento)\b/.test(normalized)) return "Transporte";
  if (/\b(?:restaurante|lanchonete|bar|pizzaria|churrascaria|hamb[uú]rguer)\b/.test(normalized)) return "Alimentação";
  if (/\b(?:cinema|teatro|show|ingresso|parque|lazer)\b/.test(normalized)) return "Lazer";
  if (/\b(?:aluguel|condom[ií]nio|luz|[aá]gua|telefone|internet)\b/.test(normalized)) return "Moradia";
  if (/\b(?:escola|faculdade|curso|universidade|educa[çc][aã]o)\b/.test(normalized)) return "Educação";

  return null;
}

function extractMerchantName(text: string): { name: string | null; lowConfidence: boolean } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines.slice(0, 5)) {
    if (/\b(?:ltda|me|eireli|s\.?a\.?|s\.?a|epp|ltda\.?me)\b/i.test(line)) {
      const cleaned = line.replace(/[^\w\s\u00C0-\u024F.,&-]/g, "").trim();
      if (cleaned.length > 3) return { name: cleaned, lowConfidence: false };
    }
  }

  for (const line of lines.slice(0, 10)) {
    if (/[A-Z]{4,}/.test(line) && !/\d{4,}/.test(line) && !/R\$/.test(line) && line.length > 3 && line.length < 80) {
      const cleaned = line.replace(/[^\w\s\u00C0-\u024F.,&-]/g, "").trim();
      if (cleaned.length > 3) return { name: cleaned, lowConfidence: true };
    }
  }

  return { name: null, lowConfidence: false };
}

export function parseReceiptText(text: string): LocalParsedReceipt {
  const lowConfidenceFields: string[] = [];

  if (!text || text.trim().length < 10) {
    return {
      is_receipt: false,
      type: "unknown",
      amount: null,
      date: null,
      time: null,
      counterparty: null,
      institution: null,
      payment_method: null,
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: null,
      notes: null,
      low_confidence_fields: [],
    };
  }

  const isReceipt = detectReceipt(text);

  const valueResult = extractValue(text);
  if (valueResult.lowConfidence) lowConfidenceFields.push("amount");

  const dateResult = extractDate(text);
  if (dateResult.lowConfidence) lowConfidenceFields.push("date");

  const time = extractTime(text);

  const typeResult = extractType(text);
  if (typeResult.lowConfidence) lowConfidenceFields.push("type");

  const paymentResult = extractPaymentMethod(text);
  if (paymentResult.lowConfidence) lowConfidenceFields.push("payment_method");

  const establishment = extractEstablishment(text);
  if (establishment.lowConfidence) lowConfidenceFields.push("merchant_name");

  const cnpj = extractCnpjCpf(text);
  if (cnpj.lowConfidence) lowConfidenceFields.push("tax_id");

  const fiscalDoc = extractFiscalDocument(text);
  if (fiscalDoc.lowConfidence) lowConfidenceFields.push("fiscal_document_number");

  const receiptId = extractReceiptId(text);
  if (receiptId.lowConfidence) lowConfidenceFields.push("receipt_id");

  const institutionResult = extractInstitution(text);

  const merchantName = extractMerchantName(text);
  if (merchantName.lowConfidence) lowConfidenceFields.push("merchant_name_extracted");

  const items = extractItems(text);
  if (items.length > 0) lowConfidenceFields.push("purchased_items");

  let itemValuesAreFinal: boolean | undefined;
  if (items.length > 0 && valueResult.value !== null) {
    const sumCents = items.reduce((acc, i) => acc + (i.total != null ? Math.round(i.total * 100) : 0), 0);
    const amountCents = Math.round(valueResult.value * 100);
    itemValuesAreFinal = Math.abs(sumCents - amountCents) <= 1;
  }

  const category = guessCategory(typeResult.type, text);

  const counterparty = typeResult.type === "expense"
    ? (establishment.name ?? merchantName.name)
    : (merchantName.name ?? establishment.name);

  const title = counterparty
    ? `${typeResult.type === "income" ? "Recebimento de " : "Pagamento para "}${counterparty}`
    : typeResult.type === "income" ? "Recebimento" : "Despesa";

  return {
    is_receipt: isReceipt,
    type: typeResult.type,
    amount: valueResult.value,
    date: dateResult.date,
    time,
    counterparty,
    institution: institutionResult.institution,
    payment_method: paymentResult.method,
    category_hint: category,
    receipt_id: receiptId.id,
    merchant_name: merchantName.name ?? establishment.name,
    tax_id: cnpj.taxId,
    fiscal_document_number: fiscalDoc.doc,
    card_brand: null,
    card_last_four: null,
    title,
    notes: null,
    purchased_items: items.length > 0 ? items : undefined,
    item_values_are_final: itemValuesAreFinal,
    low_confidence_fields: lowConfidenceFields,
  };
}
