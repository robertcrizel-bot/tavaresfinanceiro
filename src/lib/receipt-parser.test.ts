import { describe, expect, it } from "vitest";
import { parseReceiptText, LocalParsedReceipt } from "@/lib/receipt-parser";

describe("parseReceiptText", () => {
  describe("Cenário A: PIX Inter (comprovante digital)", () => {
    const pixText = `Comprovante de Pagamento
Pix enviado

Valor: R$ 6,00
Data: 11/09/2026
Horário: 14:50

Quem recebeu:
Ribeiro do Vale Alimentos LTDA
CNPJ 19.370.513/0001-12

Instituição recebedora:
Banco Inter S.A.

Identificador: a1b2c3d4-e5f6-7890-abcd-ef1234567890
ID da Transação: 98765432101234567890

Pix enviado com sucesso.`;

    it("identifica is_receipt como true", () => {
      const result = parseReceiptText(pixText);
      expect(result.is_receipt).toBe(true);
    });

    it("identifica tipo como expense", () => {
      const result = parseReceiptText(pixText);
      expect(result.type).toBe("expense");
    });

    it("identifica valor corretamente", () => {
      const result = parseReceiptText(pixText);
      expect(result.amount).toBe(6.0);
    });

    it("identifica data corretamente", () => {
      const result = parseReceiptText(pixText);
      expect(result.date).toBe("2026-09-11");
    });

    it("identifica horário", () => {
      const result = parseReceiptText(pixText);
      expect(result.time).toBe("14:50:00");
    });

    it("identifica favorecido/recebedor", () => {
      const result = parseReceiptText(pixText);
      expect(result.counterparty).toBe("Ribeiro do Vale Alimentos LTDA");
    });

    it("identifica CNPJ", () => {
      const result = parseReceiptText(pixText);
      expect(result.tax_id).toBe("19.370.513/0001-12");
    });

    it("identifica instituição", () => {
      const result = parseReceiptText(pixText);
      expect(result.institution).toBe("Banco Inter");
    });

    it("identifica forma de pagamento como Pix", () => {
      const result = parseReceiptText(pixText);
      expect(result.payment_method).toBe("Pix");
    });

    it("captura identificador/ID", () => {
      const result = parseReceiptText(pixText);
      expect(result.receipt_id).toBeTruthy();
      expect(result.receipt_id!.length).toBeGreaterThan(5);
    });
  });

  describe("Cenário B: Cupom fiscal Drogal (farmácia)", () => {
    const drogalText = `DROGAL FARMACÊUTICA LTDA
CNPJ: 12.345.678/0001-90
Rua das Flores, 123 - Centro

CUPOM FISCAL - ECF Nº 001

Data: 10/09/2026  Horário: 15:32

ITEM  CODIGO  PRODUTO                   QTD   VALOR UNIT  VALOR TOTAL
001   12345   POSTEC POMADA 30G          1    R$ 12,90    R$ 12,90
002   67890   MAMADEIRA AVENT 250ML      2    R$ 35,90    R$ 71,80
003   11111   PARACETAMOL 750MG          1    R$ 8,50     R$ 8,50
004   22222   DIPIRONA GOTAS 20ML        3    R$ 15,20    R$ 45,60
005   33333   BANDAGEM ELASTICA 10CM     1    R$ 9,80     R$ 9,80

Subtotal:                    R$ 148,60
Desconto (10%):             -R$ 14,86
Valor a Pagar:              R$ 185,06

FORMA DE PAGAMENTO: Transferência Bancária
Banco: Bradesco

Cupom Nº: 55111
CHAVE DE ACESSO: 352609101234567890123456789012345678901234567890

Obrigado pela preferência!`;

    it("identifica is_receipt como true", () => {
      const result = parseReceiptText(drogalText);
      expect(result.is_receipt).toBe(true);
    });

    it("identifica valor total corretamente", () => {
      const result = parseReceiptText(drogalText);
      expect(result.amount).toBe(185.06);
    });

    it("identifica data", () => {
      const result = parseReceiptText(drogalText);
      expect(result.date).toBe("2026-09-10");
    });

    it("identifica estabelecimento", () => {
      const result = parseReceiptText(drogalText);
      expect(result.counterparty).toContain("DROGAL");
    });

    it("identifica forma de pagamento como Transferência", () => {
      const result = parseReceiptText(drogalText);
      expect(result.payment_method).toBe("Transferência");
    });

    it("identifica CNPJ", () => {
      const result = parseReceiptText(drogalText);
      expect(result.tax_id).toBe("12.345.678/0001-90");
    });

    it("identifica número do cupom", () => {
      const result = parseReceiptText(drogalText);
      expect(result.fiscal_document_number).toBe("55111");
    });

    it("captura itens quando possível", () => {
      const result = parseReceiptText(drogalText);
      expect(result.purchased_items).toBeDefined();
      expect(result.purchased_items!.length).toBeGreaterThan(0);
    });

    it("identifica tipo como expense", () => {
      const result = parseReceiptText(drogalText);
      expect(result.type).toBe("expense");
    });
  });

  describe("Cenário C: Cupom de mercado mais ruidoso", () => {
    const mercadoText = `SUPERMERCADO BARATO LTDA
CNPJ: 98.765.432/0001-10
Av. Brasil, 456

VENDA Nº 123456
ECF: 003
Data: 09/09/2026  10:15

PRODUTO                          QTD   VL UNIT   VL TOTAL
ARROZ TIPO 1 5KG                  1    R$22,90   R$ 22,90
FEIJAO CARIOCA 1KG                2    R$ 8,49   R$ 16,98
OLEO DE SOJA 900ML                1    R$ 7,99   R$  7,99
ACUCAR CRISTAL 1KG                3    R$ 5,99   R$ 17,97
CAFE TORRADO 500G                 1    R$14,90   R$ 14,90
PAO FRANCES                       1    R$ 0,45   R$  0,45
BANANA PRATA KG                   1    R$ 5,99   R$  5,99
LEITE INTEGRAL 1L                 2    R$ 5,49   R$ 10,98
MACARRAO ESPAGUETE 500G           2    R$ 4,29   R$  8,58
MOLHO DE TOMATE 340G              3    R$ 3,99   R$ 11,97
CARNE MOIDA KG                    1    R$32,90   R$ 32,90
REFRIGERANTE 2L                   2    R$ 9,99   R$ 19,98
PAPEL HIGIENICO 12UN              1    R$ 18,90   R$ 18,90

SUBTOTAL:                        R$ 190,50
DESCONTO/-:                     -R$ 26,68
VALOR TOTAL:                     R$ 163,82

FORMA DE PAGAMENTO: TEF
Banco: Bradesco

N.FISCAL: 987654
NFC-E: 35260909123456789012345678901234567890123456

VOLTE SEMPRE!`;

    it("identifica is_receipt como true", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.is_receipt).toBe(true);
    });

    it("identifica valor total corretamente", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.amount).toBe(163.82);
    });

    it("identifica forma de pagamento como TEF (Transferência)", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.payment_method).toBe("Transferência");
    });

    it("identifica data", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.date).toBe("2026-09-09");
    });

    it("identifica estabelecimento quando possível", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.counterparty).toBeTruthy();
    });

    it("captura exatamente 13 itens com nome, quantidade, preço unitário e total corretos", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.purchased_items).toBeDefined();
      expect(result.purchased_items!.length).toBe(13);

      const items = result.purchased_items!;

      const find = (substring: string) => items.find((i) => i.name.includes(substring))!;

      // ARROZ TIPO 1 5KG — qty 1, unit 22.90, total 22.90
      const arroz = find("TIPO 1 5KG");
      expect(arroz.quantity).toBe(1);
      expect(arroz.unit_price).toBe(22.90);
      expect(arroz.total).toBe(22.90);

      // FEIJAO CARIOCA 1KG — qty 2, unit 8.49, total 16.98
      const feijao = find("FEIJAO");
      expect(feijao.quantity).toBe(2);
      expect(feijao.unit_price).toBe(8.49);
      expect(feijao.total).toBe(16.98);

      // OLEO DE SOJA 900ML — qty 1, unit 7.99, total 7.99
      const oleo = find("SOJA");
      expect(oleo.quantity).toBe(1);
      expect(oleo.unit_price).toBe(7.99);
      expect(oleo.total).toBe(7.99);

      // ACUCAR CRISTAL 1KG — qty 3, unit 5.99, total 17.97
      const acucar = find("ACUCAR");
      expect(acucar.quantity).toBe(3);
      expect(acucar.unit_price).toBe(5.99);
      expect(acucar.total).toBe(17.97);

      // CAFE TORRADO 500G — qty 1, unit 14.90, total 14.90
      const cafe = find("TORRADO");
      expect(cafe.quantity).toBe(1);
      expect(cafe.unit_price).toBe(14.90);
      expect(cafe.total).toBe(14.90);

      // PAO FRANCES — qty 1, unit 0.45, total 0.45
      const pao = find("FRANCES");
      expect(pao.quantity).toBe(1);
      expect(pao.unit_price).toBe(0.45);
      expect(pao.total).toBe(0.45);

      // BANANA PRATA KG — qty 1, unit 5.99, total 5.99
      const banana = find("BANANA");
      expect(banana.quantity).toBe(1);
      expect(banana.unit_price).toBe(5.99);
      expect(banana.total).toBe(5.99);

      // LEITE INTEGRAL 1L — qty 2, unit 5.49, total 10.98
      const leite = find("INTEGRAL");
      expect(leite.quantity).toBe(2);
      expect(leite.unit_price).toBe(5.49);
      expect(leite.total).toBe(10.98);

      // MACARRAO ESPAGUETE 500G — qty 2, unit 4.29, total 8.58
      const macarrao = find("MACARRAO");
      expect(macarrao.quantity).toBe(2);
      expect(macarrao.unit_price).toBe(4.29);
      expect(macarrao.total).toBe(8.58);

      // MOLHO DE TOMATE 340G — qty 3, unit 3.99, total 11.97
      const molho = find("TOMATE");
      expect(molho.quantity).toBe(3);
      expect(molho.unit_price).toBe(3.99);
      expect(molho.total).toBe(11.97);

      // CARNE MOIDA KG — qty 1, unit 32.90, total 32.90
      const carne = find("MOIDA");
      expect(carne.quantity).toBe(1);
      expect(carne.unit_price).toBe(32.90);
      expect(carne.total).toBe(32.90);

      // REFRIGERANTE 2L — qty 2, unit 9.99, total 19.98
      const refri = find("REFRIGERANTE");
      expect(refri.quantity).toBe(2);
      expect(refri.unit_price).toBe(9.99);
      expect(refri.total).toBe(19.98);

      // PAPEL HIGIENICO 12UN — qty 1, unit 18.90, total 18.90
      const papel = find("HIGIENICO");
      expect(papel.quantity).toBe(1);
      expect(papel.unit_price).toBe(18.90);
      expect(papel.total).toBe(18.90);
    });

    it("nomes dos itens não contêm dígitos de quantidade incorporados", () => {
      const result = parseReceiptText(mercadoText);
      const items = result.purchased_items!;
      const names = items.map((i) => i.name);

      // Nomes não devem terminar com dígitos de quantidade grudados
      expect(names.some((n) => /500G\d/.test(n))).toBe(false);
      expect(names.some((n) => /340G\d/.test(n))).toBe(false);
      expect(names.some((n) => /MACARRAO.*\d{2,}$/.test(n))).toBe(false);
      expect(names.some((n) => /MOLHO.*\d{2,}$/.test(n))).toBe(false);
    });

    it("identifica tipo como expense", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.type).toBe("expense");
    });

    it("item_values_are_final é false porque existe desconto global", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.item_values_are_final).toBe(false);
      expect(result.purchased_items).toBeDefined();
      expect(result.purchased_items!.length).toBe(13);
      expect(result.amount).toBe(163.82);

      const sumCents = result.purchased_items!.reduce(
        (acc, i) => acc + (i.total != null ? Math.round(i.total * 100) : 0),
        0,
      );
      const amountCents = Math.round(result.amount! * 100);
      expect(sumCents - amountCents).toBe(2667);
    });

    it("não falha mesmo com texto ruim (retorna resultado parcial)", () => {
      const result = parseReceiptText(mercadoText);
      expect(result.amount).not.toBeNull();
      expect(result.payment_method).not.toBeNull();
    });
  });

  describe("Casos extremos", () => {
    it("retorna is_receipt false para texto muito curto", () => {
      const result = parseReceiptText("abc");
      expect(result.is_receipt).toBe(false);
    });

    it("retorna is_receipt false para texto vazio", () => {
      const result = parseReceiptText("");
      expect(result.is_receipt).toBe(false);
    });

    it("retorna is_receipt false para texto sem indicadores", () => {
      const result = parseReceiptText("Esta é uma frase qualquer sem relação com comprovantes.");
      expect(result.is_receipt).toBe(false);
    });

    it("não inventa valor quando não encontra", () => {
      const result = parseReceiptText("Comprovante de pagamento\nData: 10/09/2026\nPIX enviado");
      expect(result.amount).toBeNull();
    });

    it("não inventa data quando não encontra", () => {
      const result = parseReceiptText("Comprovante de pagamento\nR$ 50,00\nPIX enviado");
      expect(result.date).toBeNull();
    });

    it("low_confidence_fields é preenchido quando apropriado", () => {
      const result = parseReceiptText("Comprovante\nR$ 50,00\n10/09/2026\nPIX");
      expect(Array.isArray(result.low_confidence_fields)).toBe(true);
    });
  });

  describe("Parsing de valores BRL", () => {
    it("parse corretamente R$ 1.234,56", () => {
      const result = parseReceiptText("Valor Total: R$ 1.234,56\nData: 01/01/2026");
      expect(result.amount).toBe(1234.56);
    });

    it("parse corretamente R$ 6,00", () => {
      const result = parseReceiptText("Valor: R$ 6,00\nData: 01/01/2026");
      expect(result.amount).toBe(6.0);
    });

    it("prefere 'Valor a Pagar' sobre outros valores", () => {
      const text = `Subtotal: R$ 100,00
Desconto: R$ 10,00
Valor a Pagar: R$ 90,00`;
      const result = parseReceiptText(text);
      expect(result.amount).toBe(90.0);
    });

    it("prefere 'Total' sobre subtotal quando múltiplos valores", () => {
      const text = `Subtotal: R$ 100,00
Total: R$ 85,50`;
      const result = parseReceiptText(text);
      expect(result.amount).toBe(85.5);
    });
  });

  describe("Parsing de datas", () => {
    it("parse DD/MM/AAAA", () => {
      const result = parseReceiptText("Data: 15/03/2026\nR$ 100,00");
      expect(result.date).toBe("2026-03-15");
    });

    it("parse DD-MM-AAAA", () => {
      const result = parseReceiptText("Data: 15-03-2026\nR$ 100,00");
      expect(result.date).toBe("2026-03-15");
    });

    it("parse DD.MM.AAAA", () => {
      const result = parseReceiptText("Data: 15.03.2026\nR$ 100,00");
      expect(result.date).toBe("2026-03-15");
    });

    it("prefere data de pagamento/emissão quando há múltiplas", () => {
      const text = `Data de Autorização: 01/01/2020
Data de Pagamento: 15/06/2026
R$ 50,00`;
      const result = parseReceiptText(text);
      expect(result.date).toBe("2026-06-15");
    });
  });

  describe("Validação de horário", () => {
    it("aceita horário válido 14:50", () => {
      const result = parseReceiptText("Horário: 14:50\nR$ 10,00\n10/09/2026");
      expect(result.time).toBe("14:50:00");
    });

    it("aceita horário válido 00:00:00", () => {
      const result = parseReceiptText("Horário: 00:00:00\nR$ 10,00\n10/09/2026");
      expect(result.time).toBe("00:00:00");
    });

    it("aceita horário válido 23:59:59", () => {
      const result = parseReceiptText("Horário: 23:59:59\nR$ 10,00\n10/09/2026");
      expect(result.time).toBe("23:59:59");
    });

    it("rejeita horário impossível 19:99:00", () => {
      const result = parseReceiptText("Horário: 19:99:00\nR$ 10,00\n10/09/2026");
      expect(result.time).toBeNull();
    });

    it("rejeita horário impossível 25:00:00", () => {
      const result = parseReceiptText("Horário: 25:00:00\nR$ 10,00\n10/09/2026");
      expect(result.time).toBeNull();
    });

    it("rejeita horário impossível 12:60:00", () => {
      const result = parseReceiptText("Horário: 12:60:00\nR$ 10,00\n10/09/2026");
      expect(result.time).toBeNull();
    });

    it("rejeita horário impossível 10:30:99", () => {
      const result = parseReceiptText("Horário: 10:30:99\nR$ 10,00\n10/09/2026");
      expect(result.time).toBeNull();
    });
  });

  describe("Detecção de tipo", () => {
    it("detecta 'Pix enviado' como expense", () => {
      const result = parseReceiptText("Pix enviado\nR$ 10,00");
      expect(result.type).toBe("expense");
    });

    it("detecta 'Pix recebido' como income", () => {
      const result = parseReceiptText("Pix recebido\nR$ 500,00");
      expect(result.type).toBe("income");
    });

    it("detecta 'Transferência enviada' como expense", () => {
      const result = parseReceiptText("Transferência enviada\nR$ 100,00");
      expect(result.type).toBe("expense");
    });

    it("detecta 'Transferência recebida' como income", () => {
      const result = parseReceiptText("Transferência recebida\nR$ 200,00");
      expect(result.type).toBe("income");
    });

    it("detecta 'compra' como expense", () => {
      const result = parseReceiptText("Compra aprovada\nR$ 50,00");
      expect(result.type).toBe("expense");
    });
  });

  describe("Forma de pagamento", () => {
    it("detecta Pix", () => {
      const result = parseReceiptText("Forma: Pix\nR$ 10,00");
      expect(result.payment_method).toBe("Pix");
    });

    it("detecta TEF", () => {
      const result = parseReceiptText("Forma: TEF\nR$ 10,00");
      expect(result.payment_method).toBe("Transferência");
    });

    it("detecta Cartão de Crédito", () => {
      const result = parseReceiptText("Forma: Cartão de Crédito\nR$ 10,00");
      expect(result.payment_method).toBe("Cartão de Crédito");
    });

    it("detecta Cartão de Débito", () => {
      const result = parseReceiptText("Forma: Cartão de Débito\nR$ 10,00");
      expect(result.payment_method).toBe("Cartão de Débito");
    });

    it("detecta Boleto", () => {
      const result = parseReceiptText("Forma: Boleto\nR$ 10,00");
      expect(result.payment_method).toBe("Boleto");
    });

    it("detecta Dinheiro", () => {
      const result = parseReceiptText("Forma: Dinheiro\nR$ 10,00");
      expect(result.payment_method).toBe("Dinheiro");
    });
  });

  describe("CNPJ/CPF", () => {
    it("extrai CNPJ formatado corretamente", () => {
      const result = parseReceiptText("CNPJ: 12.345.678/0001-90\nR$ 10,00");
      expect(result.tax_id).toBe("12.345.678/0001-90");
    });

    it("extrai CNPJ sem formatação", () => {
      const result = parseReceiptText("CNPJ 12345678000190\nR$ 10,00");
      expect(result.tax_id).toBe("12.345.678/0001-90");
    });
  });

  describe("Instituição", () => {
    it("detecta Banco Inter", () => {
      const result = parseReceiptText("Banco Inter S.A.\nR$ 10,00");
      expect(result.institution).toBe("Banco Inter");
    });

    it("detecta Itaú", () => {
      const result = parseReceiptText("Banco Itaú Unibanco\nR$ 10,00");
      expect(result.institution).toContain("Itaú");
    });

    it("detecta Bradesco", () => {
      const result = parseReceiptText("Banco Bradesco S.A.\nR$ 10,00");
      expect(result.institution).toBe("Bradesco");
    });
  });

  describe("Cenário D: OCR REAL - Drogal Farmacêutica (cupom NF-e)", () => {
    const drogalRealOcr = `+ DROGAL FARMACEUTICA LTDA FL 087
Drogal) ix cAPITAG VICENTE DIAS, 161
CENTRO - 8A0 JOSE DO RIO PARDO SP
CNP B43 75.64 7/0056 88 LES
646, 155. 182,119
11/08/2026 CUPOM 55411
Documento Ausillar da Nota Fiscal de Consumidor Eletrónica
4 [COD |DES QTD JUN |VLUNRS| VLITEM R$
16204 POSTEC POMADA 200 1X UN 15243 152,43
De 152,43 Poi 114,32 desconto de 25,00% 38,11
04780 MAMADES /5MCO 26CPR IX UN 4/46 47 46
De 47,46 Poi 35,60 desconto de 24,99% 11,66
BAU23  CAFEINA CAR ISOPRODO LUA UNSET,34 31,34
De 31,34 Por 1880 desconto de 46,01% 12,54
27995 ME OXICAM | 5MG 10CPR 1X UN 27.24 27,24
De edp2q Poi 16,34 desconto de 40,01 Y% 10,90
Qtde. Total de Itens: 4
Valor Total R$: 258.47
Desconto R$ 13,41
Valor à Pagar R$: 185,06
FORMA PAGAMENTO: Valor Pago R$
Transfer ência Bancária 185,06
Consulte pela Chave de Acesso em
htips://www.ntce fazenda. sp .gov by consulta
3320 0954 37506 4/00 686868 6500 70600 Ub43 2917 7329 5254
IH TM rl CONSUMIDOR NÃO
[=] FATE on IDENTIFICADO
a A, NÍí Core nº: 54329 Série; 7
fom ps A we L1/09/2026 14:28:59
. io
H J E, Protocalo de Autorização
[] HH 138266217
E » 126621 7110378
5 é
ve . * Lata de Autorização
11/09/2026 14:26:57
Ti
Fi 87 | Ter:/ 57 | CXALT | Cod Venda: 59 390 | Cupom: 55141;
Tributos Total Incidentes (i el Federeal 12.741/12): R$147,09`;

    it("identifica is_receipt como true", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.is_receipt).toBe(true);
    });

    it("identifica type como expense", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.type).toBe("expense");
    });

    it("identifica amount como 185.06 (Valor à Pagar, NÃO tributos)", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.amount).toBe(185.06);
    });

    it("identifica date como 2026-09-11 (data repetida com horário)", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.date).toBe("2026-09-11");
    });

    it("identifica time", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.time).toBeTruthy();
    });

    it("identifica counterparty contendo DROGAL", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.counterparty).toContain("DROGAL");
    });

    it("identifica payment_method como Transferência", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.payment_method).toBe("Transferência");
    });

    it("identifica fiscal_document_number como 55411", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.fiscal_document_number).toBe("55411");
    });

    it("purchased_items não contém linhas de endereço/CNPJ/chave/tributos", () => {
      const result = parseReceiptText(drogalRealOcr);
      if (result.purchased_items && result.purchased_items.length > 0) {
        const allNames = result.purchased_items.map((i) => i.name).join(" ");
        expect(allNames).not.toContain("DROGAL FARMACEUTICA");
        expect(allNames).not.toContain("VICENTE DIAS");
        expect(allNames).not.toContain("Transferência Bancária");
        expect(allNames).not.toContain("chave de acesso");
        expect(allNames).not.toContain("Tributos");
        expect(allNames).not.toContain("Core nº");
        expect(allNames).not.toContain("Série");
      }
    });

    it("purchased_items retorna valores finais (com desconto) e não brutos", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.purchased_items).toBeDefined();
      expect(result.purchased_items!.length).toBe(4);

      const totals = result.purchased_items!.map((i) => i.total);
      expect(totals[0]).toBe(114.32);
      expect(totals[1]).toBe(35.60);
      expect(totals[2]).toBe(18.80);
      expect(totals[3]).toBe(16.34);

      const sum = totals.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(185.06, 2);
    });

    it("amount coincide com a soma dos valores finais dos itens", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.amount).toBe(185.06);
      if (result.purchased_items && result.purchased_items.length > 0) {
        const sum = result.purchased_items.reduce((a, i) => a + (i.total ?? 0), 0);
        expect(sum).toBeCloseTo(result.amount!, 2);
      }
    });

    it("item_values_are_final é true porque soma dos itens confere com amount", () => {
      const result = parseReceiptText(drogalRealOcr);
      expect(result.item_values_are_final).toBe(true);
      expect(result.purchased_items).toBeDefined();
      expect(result.purchased_items!.length).toBe(4);

      const totals = result.purchased_items!.map((i) => i.total);
      expect(totals[0]).toBe(114.32);
      expect(totals[1]).toBe(35.60);
      expect(totals[2]).toBe(18.80);
      expect(totals[3]).toBe(16.34);
    });
  });

  describe("Regressão: OCR corrompido — desconto via fallback", () => {
    const corruptedOcr = `4 COD |DES QTD JUN |VLUNRS| VLITEM R$
16204 POSTEC POMADA 20G 1X UN 152,43 152,43
De 152,43 Poi 114,32 desconto de 25 00% -36,11
4780 MAMADES /5MCG 28CPR LX UN 4/746 47 46
De 4746 Por 3560 desconto de 24,99 % 11,66
64023 CAFEINA HCARISOPRODO — 1X UN 31,34 31,34
De 31,34 Por 1880 — desconto de 46,01% E Srs
27995 ME OXICAM 15MG 10CPR 1X UN 27,24 27,94
—De2d2q Porri] descontorde 4001% 10,90
Qtde. Total de Itens: 4
Valor Total R$: 258,47
Desconto R$; 73.41
Valor a Pagar R$: 185,06
FORMA PAGAMENTO: Valor Pago R$:
Transferência Bancária 185,06`;

    it("retorna exatamente 4 itens com totais corretos e soma = amount", () => {
      const result = parseReceiptText(corruptedOcr);
      expect(result.purchased_items).toBeDefined();
      expect(result.purchased_items!.length).toBe(4);

      const totals = result.purchased_items!.map((i) => i.total);
      expect(totals[0]).toBe(114.32);
      expect(totals[1]).toBe(35.60);
      expect(totals[2]).toBe(18.80);
      expect(totals[3]).toBeCloseTo(16.34, 2);

      const sum = totals.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(185.06, 2);
      expect(result.amount).toBe(185.06);
    });

    it("nomes dos itens estão presentes e utilizáveis", () => {
      const result = parseReceiptText(corruptedOcr);
      expect(result.purchased_items).toBeDefined();
      const names = result.purchased_items!.map((i) => i.name);
      expect(names.length).toBe(4);
      for (const name of names) {
        expect(name.length).toBeGreaterThan(0);
        expect(typeof name).toBe("string");
      }
    });
  });

  describe("item_values_are_final — casos de limite", () => {
    it("true quando diferença é exatamente R$0,01", () => {
      const text = `PRODUTO  QTD  VL UNIT  VL TOTAL
ARROZ    1    5,00     5,00
FEIJAO   1    10,00    10,01
VALOR TOTAL: R$ 15,00`;
      const result = parseReceiptText(text);
      expect(result.item_values_are_final).toBe(true);
    });

    it("false quando diferença é maior que R$0,01", () => {
      const text = `PRODUTO  QTD  VL UNIT  VL TOTAL
ARROZ    1    5,00     5,00
FEIJAO   1    10,00    10,02
VALOR TOTAL: R$ 15,00`;
      const result = parseReceiptText(text);
      expect(result.item_values_are_final).toBe(false);
    });

    it("undefined quando não há itens", () => {
      const text = `Comprovante de pagamento\nR$ 50,00\n10/09/2026`;
      const result = parseReceiptText(text);
      expect(result.item_values_are_final).toBeUndefined();
    });

    it("undefined quando não há amount", () => {
      const text = `PRODUTO  QTD  VL UNIT  VL TOTAL
ARROZ    1    5,00     5,00`;
      const result = parseReceiptText(text);
      expect(result.item_values_are_final).toBeUndefined();
    });
  });

  describe("sanitizeItemName — remoção genérica de marcadores qty/unit", () => {
    const textWithMarker = (name: string) =>
      `ITEM  QTD  VL UNIT  VL TOTAL\n${name}  1  R$ 10,00  R$ 10,00\nTOTAL R$ 10,00`;

    it("remove LX UN (OCR 1 → L)", () => {
      const result = parseReceiptText(textWithMarker("MAMADES /5MCG 28CPR LX UN"));
      expect(result.purchased_items![0].name).toBe("MAMADES /5MCG 28CPR");
    });

    it("remove IX UN (OCR 1 → I)", () => {
      const result = parseReceiptText(textWithMarker("PRODUTO IX UN"));
      expect(result.purchased_items![0].name).toBe("PRODUTO");
    });

    it("remove 1X UN (original)", () => {
      const result = parseReceiptText(textWithMarker("PRODUTO 1X UN"));
      expect(result.purchased_items![0].name).toBe("PRODUTO");
    });

    it("remove lx UN (lowercase)", () => {
      const result = parseReceiptText(textWithMarker("PRODUTO lx UN"));
      expect(result.purchased_items![0].name).toBe("PRODUTO");
    });

    it("remove LX kg", () => {
      const result = parseReceiptText(textWithMarker("PRODUTO LX kg"));
      expect(result.purchased_items![0].name).toBe("PRODUTO");
    });
  });
});
