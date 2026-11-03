import { ArrowRight, Check, ReceiptText, ScanLine, Sparkles } from "lucide-react";

/** Marketing illustration only: no upload, OCR call, editable form or saved data. */
export function ReceiptAssistDemo() {
  return (
    <figure id="ia-fluxo" tabIndex={-1} className="fv-receipt-demo" aria-label="Exemplo ilustrativo: comprovante lido por IA, lançamento preenchido e itens incluídos na descrição do cadastro">
      <div className="fv-receipt-demo-heading">
        <span><ScanLine size={15} aria-hidden="true" /> Do comprovante ao cadastro preenchido</span>
        <span className="fv-demo-tag">ILUSTRAÇÃO DEMO</span>
      </div>
      <ol className="fv-demo-pipeline" aria-label="Etapas do preenchimento automático">
        <li><span>01</span> Comprovante</li>
        <li><span>02</span> Leitura por IA</li>
        <li><span>03</span> Lançamento preenchido</li>
        <li><span>04</span> Itens incluídos</li>
      </ol>
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
        <div className="fv-receipt-flow-arrow" aria-hidden="true">
          <span className="fv-demo-processing-icon"><Sparkles size={23} /></span>
          <span>Leitura por IA</span>
          <ArrowRight size={22} />
        </div>
        <div className="fv-demo-suggestions">
          <p className="fv-demo-suggestions-heading"><Check size={17} aria-hidden="true" /> Lançamento preenchido</p>
          <p className="fv-demo-filled-note">Praticamente pronto. Agora é só revisar.</p>
          <dl className="fv-demo-filled-fields">
            <div><dt>Estabelecimento / título</dt><dd>Mercado Exemplo</dd></div>
            <div className="fv-demo-suggested-amount"><dt>Valor preenchido</dt><dd>R$ 248,70</dd></div>
            <div><dt>Data preenchida</dt><dd>16/10/2026</dd></div>
            <div><dt>Categoria sugerida</dt><dd>Alimentação</dd></div>
          </dl>
          <div className="fv-demo-filled-items" role="group" aria-label="Itens incluídos automaticamente na descrição do cadastro, quando identificados">
            <div className="fv-demo-filled-items-heading"><ReceiptText size={15} aria-hidden="true" /><span>Descrição · itens da compra</span><span>3 itens</span></div>
            <ul>
              <li><span>1 × Mercearia</span><span>R$ 168,00</span></li>
              <li><span>1 × Hortifruti</span><span>R$ 52,80</span></li>
              <li><span>1 × Arroz</span><span>R$ 27,90</span></li>
            </ul>
            <p>Incluídos automaticamente quando identificados.</p>
          </div>
          <p className="fv-demo-review"><Check size={16} aria-hidden="true" /> Você revisa e confirma</p>
        </div>
      </div>
      <figcaption id="ia-fluxo-caption">Fluxo ilustrativo com dados fictícios, antes de salvar. Os itens identificados são incluídos na descrição do lançamento. Nenhuma leitura é executada nesta página.</figcaption>
    </figure>
  );
}
