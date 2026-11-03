import { ArrowRight, Check, ReceiptText, ScanLine, Sparkles } from "lucide-react";

/** Marketing illustration only: no upload, OCR call, editable form or saved data. */
export function ReceiptAssistDemo() {
  return (
    <figure className="fv-receipt-demo" aria-label="Exemplo ilustrativo de preenchimento assistido por IA com dados fictícios">
      <div className="fv-receipt-demo-heading">
        <span><ScanLine size={15} aria-hidden="true" /> Do comprovante ao lançamento</span>
        <span className="fv-demo-tag">ILUSTRAÇÃO DEMO</span>
      </div>
      <div className="fv-receipt-flow">
        <div className="fv-demo-receipt">
          <ReceiptText size={24} aria-hidden="true" />
          <p className="fv-demo-merchant">Mercado Exemplo</p>
          <p className="fv-demo-receipt-note">Comprovante fictício · 16/10/2026</p>
          <dl className="fv-demo-receipt-items">
            <div><dt>Mercearia</dt><dd>R$ 168,00</dd></div>
            <div><dt>Hortifruti</dt><dd>R$ 52,80</dd></div>
            <div><dt>Arroz</dt><dd>R$ 27,90</dd></div>
          </dl>
          <div className="fv-demo-receipt-total"><span>Total</span><strong>R$ 248,70</strong></div>
          <div className="fv-demo-barcode" aria-hidden="true" />
          <p className="fv-demo-receipt-note">DADOS DE EXEMPLO</p>
        </div>
        <div className="fv-receipt-flow-arrow" aria-hidden="true"><ArrowRight size={22} /></div>
        <div className="fv-demo-suggestions">
          <p className="fv-demo-suggestions-heading"><Sparkles size={17} aria-hidden="true" /> A IA adianta o preenchimento</p>
          <dl>
            <div><dt>Descrição sugerida</dt><dd>Supermercado</dd></div>
            <div className="fv-demo-suggested-amount"><dt>Valor sugerido</dt><dd>R$ 248,70</dd></div>
            <div><dt>Data sugerida</dt><dd>16/10/2026</dd></div>
            <div><dt>Categoria sugerida</dt><dd>Alimentação</dd></div>
          </dl>
          <p className="fv-demo-review"><Check size={16} aria-hidden="true" /> Você revisa e confirma</p>
        </div>
      </div>
      <figcaption>Fluxo ilustrativo com dados fictícios. Nenhuma leitura é executada nesta página.</figcaption>
    </figure>
  );
}
