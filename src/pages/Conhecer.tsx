import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check,
  CreditCard, Files, LayoutDashboard, LockKeyhole, Menu,
  Plus, ReceiptText, ScanLine, Smartphone, Sparkles, Wallet, X,
} from "lucide-react";
import { ReceiptAssistDemo } from "@/components/landing/ReceiptAssistDemo";
import "./Conhecer.css";

export const LANDING_PRICE_LABEL = "R$ 14,90";

const navigation = [
  { href: "#recursos", label: "Recursos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#plano", label: "Plano" },
  { href: "#faq", label: "Dúvidas" },
];
const pains = [
  { icon: CalendarDays, title: "Contas esquecidas", text: "O vencimento passou no meio da correria.", solution: "Reúna os vencimentos em Previsões e acompanhe o que falta pagar." },
  { icon: CreditCard, title: "Faturas inesperadas", text: "O cartão fechou acima do que você imaginava.", solution: "Veja compras e faturas de cada cartão em um só lugar." },
  { icon: Files, title: "Parcelas pelo caminho", text: "Uma compra de hoje ainda pesa nos próximos meses.", solution: "Acompanhe seus parcelamentos nas próximas faturas." },
  { icon: BarChart3, title: "Gastos sem clareza", text: "O mês termina e fica a dúvida: para onde foi?", solution: "Analise as despesas por categoria e período." },
  { icon: ReceiptText, title: "Informações espalhadas", text: "Um pouco na planilha, outro tanto nos comprovantes.", solution: "Centralize registros, contas e comprovantes no FinVision." },
];
const features = [
  { icon: ReceiptText, title: "Registros financeiros", headline: "Cada gasto, com os detalhes certos.", text: "Organize entradas e saídas por categoria, acrescente observações e mantenha o comprovante junto do lançamento.", image: "registros-focus", alt: "Recorte real de registros DEMO com descrição, categoria e valor de cada gasto" },
  { icon: Files, title: "Extratos", headline: "Encontre a movimentação que procura.", text: "Consulte o histórico de contas e cartões, filtre o período e tenha os detalhes à mão quando precisar conferir um valor.", image: "extratos-movimentos", alt: "Recorte real de extratos DEMO com receitas e despesas fictícias" },
  { icon: Wallet, title: "Contas e cartões", headline: "Acompanhe a fatura sem perder o contexto.", text: "Veja contas, limites e compras parceladas no mesmo lugar para entender o que já está comprometido.", image: "contas-detail", alt: "Cartão DEMO com limite e fatura preenchidos" },
  { icon: CalendarDays, title: "Previsões", headline: "Planeje antes de o mês acontecer.", text: "Organize os vencimentos e acompanhe o orçamento para decidir com uma visão do que ainda vem pela frente.", image: "orcamento-detail", alt: "Orçamento e valores realizados DEMO com barras preenchidas por categoria" },
];
const steps = [
  { title: "Crie sua conta", text: "Faça o cadastro e solicite acesso ao Beta. A entrada depende de liberação." },
  { title: "Organize contas e cartões", text: "Com o acesso liberado, cadastre suas contas e cartões para começar." },
  { title: "Registre suas movimentações", text: "Adicione receitas, despesas e compras. Mantenha os detalhes por perto." },
  { title: "Acompanhe suas finanças", text: "Consulte o dashboard, analise seus gastos e planeje o mês." },
];
const screens = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", height: 1320, title: "Seu ponto de partida para decidir melhor.", text: "Receitas, despesas, saldo e movimentações reunidos em uma visão geral.", alt: "Dashboard real do FinVision com dados DEMO: saldo, receitas, despesas e gráficos preenchidos" },
  { id: "analises", icon: BarChart3, label: "Análises", title: "Mais contexto para cada escolha.", text: "Uma área dedicada a entender as despesas, com filtros por período e categoria.", alt: "Tela real de Análises de Despesas do FinVision com categorias, evolução e orçamento DEMO" },
  { id: "registros", icon: ReceiptText, label: "Registros", title: "Os detalhes que fazem a diferença.", text: "Uma visão organizada dos lançamentos, com filtros para encontrar o que precisa.", alt: "Tela real de Meus Registros do FinVision com lançamentos e parcelas DEMO" },
  { id: "extratos", icon: Files, label: "Extratos", title: "Cada movimentação conta uma parte da história.", text: "Consulte o período, acompanhe o fluxo e visualize as despesas por categoria.", alt: "Tela real de Extratos do FinVision com movimentações, gráfico donut e evolução DEMO" },
  { id: "contas", icon: CreditCard, label: "Cartões", height: 730, title: "A fatura de hoje. As escolhas de amanhã.", text: "Veja o limite, o valor da fatura e as condições do cartão em um só lugar.", alt: "Tela real de Cartões do FinVision com fatura e limite DEMO" },
  { id: "previsoes", icon: CalendarDays, label: "Previsões", title: "Antecipe o mês, sem perder os detalhes.", text: "Reúna receitas e contas previstas e acompanhe o que já foi pago.", alt: "Tela real de Previsões do FinVision com contas e receitas recorrentes DEMO" },
];
const faq = [
  { q: "Como o FinVision funciona?", a: "Você cadastra suas contas e cartões e registra receitas e despesas. O FinVision reúne essas informações no dashboard, nas análises, nos extratos e nas previsões. Não há conexão automática com seu banco." },
  { q: "Posso usar no celular e no computador?", a: "Sim. O FinVision funciona pelo navegador no celular, tablet e computador. Não é necessário instalar um aplicativo para começar." },
  { q: "Quais recursos estão disponíveis?", a: "O aplicativo reúne dashboard financeiro, contas e cartões, registros, análises de despesas, extratos e previsões. A leitura assistida de comprovantes com IA está em avaliação, sujeita à disponibilidade e a limites de uso." },
  { q: "Como ficam a segurança e a privacidade?", a: "O acesso às informações exige autenticação e permissões da sua conta. O FinVision não pede sua senha bancária nem se conecta ao banco. Você pode exportar seus registros financeiros pelo Perfil; imagens e PDFs de comprovantes não fazem parte dessa exportação em JSON. As condições de privacidade serão apresentadas antes da abertura das assinaturas." },
  { q: "Como funciona a leitura de comprovantes com IA?", a: "Quando disponível, a IA analisa o comprovante e sugere dados como valor, data, estabelecimento/descrição e categoria. Os campos identificados são levados ao cadastro para sua conferência. Sempre que possível, os itens reconhecidos também entram na descrição do lançamento. Confira e corrija as informações antes de salvar: a IA pode errar, está sujeita a limites de uso e não é um benefício garantido do plano Beta." },
  { q: "Como faço o cadastro e solicito o Beta?", a: "Clique em “Quero testar o FinVision” para criar sua conta. Depois de confirmar o e-mail, quando solicitado, entre no aplicativo e use “Solicitar análise de acesso”. O cadastro não libera o acesso automaticamente: a solicitação depende de análise e liberação." },
  { q: "Quanto custa? Já posso assinar?", a: `O preço planejado é ${LANDING_PRICE_LABEL}/mês. A assinatura está em preparação e não há pagamento nesta página. Nesta etapa, você pode criar uma conta e solicitar acesso ao Beta, sujeito à liberação. As condições da assinatura serão apresentadas antes da contratação.` },
];

function Brand() {
  return <span className="fv-brand"><span className="fv-brand-mark" aria-hidden="true">F<span /></span><span>Fin<span className="fv-green">Vision</span></span></span>;
}
function SignupLink({ children = "Quero testar o FinVision", className = "" }: { children?: ReactNode; className?: string }) {
  return <Link to="/auth?mode=cadastro" className={`fv-button fv-button-primary ${className}`}>{children}<ArrowUpRight size={18} aria-hidden="true" /></Link>;
}

export default function Conhecer() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [selectedScreen, setSelectedScreen] = useState(screens[0]);
  return (
    <div className="fv-landing">
      <a href="#conteudo" className="fv-skip">Pular para o conteúdo</a>
      <header className="fv-header">
        <div className="fv-container fv-header-inner">
          <Link to="/conhecer" aria-label="FinVision — início" onClick={() => setMenuOpen(false)}><Brand /></Link>
          <nav aria-label="Navegação principal" className="fv-desktop-nav">{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
          <div className="fv-header-actions">
            <Link to="/auth" className="fv-login">Entrar <ArrowUpRight size={14} aria-hidden="true" /></Link>
            <SignupLink className="fv-header-signup">Solicitar acesso Beta</SignupLink>
            <button ref={menuButton} type="button" className="fv-menu-button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} aria-controls={menuOpen ? "fv-mobile-menu" : undefined} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
          </div>
        </div>
        {menuOpen && <nav id="fv-mobile-menu" aria-label="Navegação móvel" className="fv-mobile-nav fv-container" onKeyDown={event => { if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } }}>
          {navigation.map(item => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight size={16} aria-hidden="true" /></a>)}
          <Link to="/auth?mode=cadastro" onClick={() => setMenuOpen(false)}>Solicitar acesso Beta<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </nav>}
      </header>
      <main id="conteudo">
        <section className="fv-hero fv-container" aria-labelledby="hero-title">
          <div className="fv-hero-layout">
            <div className="fv-hero-copy">
              <h1 id="hero-title">Assuma o controle<br />do seu <span className="fv-green">dinheiro.</span></h1>
              <p className="fv-lead">
                Organize contas, cartões e gastos em um só lugar.{" "}<br className="fv-desktop-break" />
                Mais clareza para decidir. Mais tranquilidade para planejar.
              </p>
              <div className="fv-cta-row">
                <SignupLink />
                <a href="#recursos" className="fv-button fv-button-secondary">
                  Conhecer os recursos <ArrowDown size={16} aria-hidden="true" />
                </a>
              </div>
              <p className="fv-hero-note">
                <LockKeyhole size={13} aria-hidden="true" />
                Cadastro sem pagamento. Acesso Beta sujeito à liberação.
              </p>
            </div>
            <figure className="fv-hero-product">
              <div className="fv-browser">
                <div className="fv-browser-bar">
                  <span className="fv-browser-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span>FinVision <span className="fv-demo-tag">DEMO</span></span>
                  <span className="fv-live-label">Outubro / 2026</span>
                </div>
                <picture>
                  <source media="(max-width: 599px)" srcSet="/landing/dashboard-mobile-focus.webp" width="366" height="450" />
                  <img
                    className="fv-dashboard-image"
                    src="/landing/dashboard.webp"
                    alt="Dashboard real do FinVision com dados DEMO: receitas de R$ 8.540,00, despesas de R$ 4.516,95 e saldo de R$ 4.023,05"
                    width="1440"
                    height="1320"
                    loading="eager"
                  />
                </picture>
              </div>
              <figcaption>
                <span className="fv-dot" /> Telas reais. Dados DEMO fictícios. Nenhuma informação de clientes.
              </figcaption>
            </figure>
          </div>
          <div className="fv-assurances"><span><Smartphone size={17} aria-hidden="true" /> No celular e computador</span><span><Wallet size={17} aria-hidden="true" /> Sem conexão bancária</span><span><ScanLine size={17} aria-hidden="true" /> IA com revisão por você</span></div>
        </section>
        <section className="fv-section fv-problem" aria-labelledby="problema-title"><div className="fv-container">
          <div className="fv-section-heading fv-heading-split"><div><p className="fv-eyebrow">Menos peças soltas. Mais visão.</p><h2 id="problema-title">Seu dinheiro não precisa<br />ser um quebra-cabeça.</h2></div><p className="fv-description">A rotina já é cheia. O FinVision ajuda a reunir o que importa para você acompanhar o mês com mais clareza.</p></div>
          <div className="fv-pain-grid">{pains.map(({ icon: Icon, title, text, solution }) => <article className="fv-pain" key={title}><Icon size={22} aria-hidden="true" /><h3>{title}</h3><p>{text}</p><div className="fv-pain-solution"><ArrowDown size={14} aria-hidden="true" /><p>{solution}</p></div></article>)}</div>
        </div></section>
        <section id="recursos" className="fv-section fv-container" aria-labelledby="recursos-title">
          <div className="fv-section-heading fv-centered">
            <p className="fv-eyebrow">Clareza para decidir. Praticidade para registrar.</p>
            <h2 id="recursos-title">Entenda seus gastos.<br /><span className="fv-green">Simplifique sua rotina.</span></h2>
            <p className="fv-description">Descubra o que pesa no orçamento e reduza o trabalho de registrar cada gasto. Mais contexto para suas decisões, menos digitação no dia a dia.</p>
          </div>
          <div className="fv-feature-highlights">
            <article id="analises-destaque" className="fv-feature fv-feature-spotlight" aria-labelledby="analises-destaque-title">
              <div className="fv-spotlight-copy">
                <span className="fv-icon-box"><BarChart3 size={24} aria-hidden="true" /></span>
                <p className="fv-eyebrow">01 / Análises de despesas</p>
                <h3 id="analises-destaque-title">Veja para onde<br />seu dinheiro está indo.</h3>
                <p>Visualize seus gastos por categoria, período e forma de pagamento. Descubra excessos, compare períodos e identifique o que está pesando no seu orçamento.</p>
                <ul className="fv-value-points">
                  <li><Check size={17} aria-hidden="true" /> Entenda quais categorias concentram os gastos</li>
                  <li><Check size={17} aria-hidden="true" /> Compare o mês atual com o anterior</li>
                  <li><Check size={17} aria-hidden="true" /> Enxergue rapidamente o que aumentou</li>
                </ul>
                <a href="#produto" className="fv-text-link" onClick={() => setSelectedScreen(screens.find(screen => screen.id === "analises")!)}>
                  Explorar as análises <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              </div>
              <figure className="fv-analytics-preview">
                <div className="fv-analytics-preview-heading"><span>Seus gastos em perspectiva</span><span className="fv-demo-tag">DEMO</span></div>
                <picture>
                  <source media="(max-width: 599px)" srcSet="/landing/analises-categorias.webp" width="406" height="535" />
                  <img src="/landing/analises-overview.webp" alt="Recorte real das análises do FinVision com dados DEMO: gastos por categoria, comparação entre períodos, aumentos e orçamento realizado" width="826" height="776" loading="lazy" />
                </picture>
                <figcaption>Tela real com dados DEMO fictícios. No celular, o recorte destaca as categorias para facilitar a leitura.</figcaption>
              </figure>
            </article>
            <article id="ia-destaque" className="fv-feature fv-feature-spotlight fv-spotlight-ai" aria-labelledby="ia-destaque-title">
              <div className="fv-spotlight-copy">
                <span className="fv-icon-box"><Sparkles size={24} aria-hidden="true" /></span>
                <p className="fv-eyebrow">02 / Leitura por IA</p>
                <h3 id="ia-destaque-title">Leitura por IA. Menos digitação, mais praticidade.</h3>
                <p>Fez um Pix ou fotografou um comprovante? Compartilhe a imagem direto do banco ou da galeria com o FinVision. Ele abre a leitura, sugere os dados e reconhece a conta quando possível. Você confere e salva.</p>
                <ul className="fv-value-points">
                  <li><Check size={17} aria-hidden="true" /> Dados preenchidos para revisar</li>
                  <li><Check size={17} aria-hidden="true" /> Itens incluídos quando identificados</li>
                </ul>
                <a href="#ia-fluxo" className="fv-button fv-button-primary" aria-describedby="ia-fluxo-caption">
                  Veja como a IA agiliza seus lançamentos <ArrowDown size={17} aria-hidden="true" />
                </a>
                <p className="fv-small-note">Recurso em avaliação no Beta, sujeito à disponibilidade e a limites de uso. A IA pode errar; você sempre revisa antes de salvar.</p>
              </div>
              <ReceiptAssistDemo />
            </article>
          </div>
          <p className="fv-supporting-heading">E o restante da sua vida financeira, no mesmo lugar.</p>
          <div className="fv-feature-grid">
            <article className="fv-feature fv-showcase-wide fv-showcase-dashboard" aria-labelledby="fv-dashboard-title">
              <div className="fv-showcase-copy">
                <span className="fv-icon-box"><LayoutDashboard size={22} aria-hidden="true" /></span>
                <p className="fv-eyebrow">Dashboard financeiro</p>
                <h3 id="fv-dashboard-title">Toda a sua vida financeira em uma só visão.</h3>
                <p>Acompanhe saldo, entradas, saídas e movimentações em um painel claro e prático.</p>
                <a href="#produto" className="fv-text-link" onClick={() => setSelectedScreen(screens.find(screen => screen.id === "dashboard")!)}>Explorar o dashboard <ArrowUpRight size={16} aria-hidden="true" /></a>
              </div>
              <figure className="fv-showcase-visual">
                <img src="/landing/dashboard-focus.webp" alt="Recorte DEMO do dashboard do FinVision, com saldos, receitas, despesas e gráficos" loading="lazy" />
                <figcaption>Dashboard real com dados fictícios para demonstração.</figcaption>
              </figure>
            </article>
            <article className="fv-feature fv-showcase-wide fv-showcase-records" aria-labelledby="fv-records-title">
              <div className="fv-showcase-copy">
                <span className="fv-icon-box"><ReceiptText size={22} aria-hidden="true" /></span>
                <p className="fv-eyebrow">Registros financeiros</p>
                <h3 id="fv-records-title">Cada lançamento com os detalhes certos.</h3>
                <p>Encontre seus registros por data, descrição, categoria e valor — sem perder informações importantes.</p>
                <a href="#produto" className="fv-text-link" onClick={() => setSelectedScreen(screens.find(screen => screen.id === "registros")!)}>Explorar os registros <ArrowUpRight size={16} aria-hidden="true" /></a>
              </div>
              <div className="fv-showcase-visual fv-showcase-records-visual">
                <div className="fv-demo-records" role="region" aria-label="Exemplo ilustrativo de registros financeiros com dados fictícios">
                  <div className="fv-demo-records-head"><span>Data</span><span>Descrição</span><span>Categoria</span><span>Valor</span></div>
                  {[
                    ["24/10", "Estacionamento", "Transporte", "−R$ 18,00"],
                    ["23/10", "Delivery", "Alimentação", "−R$ 54,90"],
                    ["22/10", "Presente", "Outros", "−R$ 149,90"],
                    ["21/10", "Academia", "Saúde", "−R$ 149,90"],
                    ["20/10", "Restaurante", "Alimentação", "−R$ 89,90"],
                  ].map(([date, description, category, amount]) => (
                    <div className="fv-demo-records-row" key={date}><span>{date}</span><strong>{description}</strong><span>{category}</span><span>{amount}</span></div>
                  ))}
                  <p className="fv-demo-records-note">Exemplo com dados fictícios. Veja a tela completa na galeria.</p>
                </div>
              </div>
            </article>
            {features.filter(feature => feature.image !== "registros-focus").map(({ icon: Icon, title, headline, text, image, alt }) => <article key={title} className={`fv-feature fv-feature-small fv-feature-${image}`}><div className="fv-small-feature-copy"><span className="fv-icon-box"><Icon size={22} aria-hidden="true" /></span><p className="fv-eyebrow">{title}</p><h3>{headline}</h3><p>{text}</p></div><div className="fv-mini-product"><span className="fv-demo-tag">DEMO</span><img src={`/landing/${image}.webp`} alt={alt} loading="lazy" /></div></article>)}
          </div>
        </section>
        <section id="como-funciona" className="fv-section fv-how" aria-labelledby="como-title"><div className="fv-container">
          <div className="fv-section-heading fv-centered"><p className="fv-eyebrow">Um passo de cada vez</p><h2 id="como-title">Organizar fica mais simples<br />quando você sabe por onde começar.</h2></div>
          <ol className="fv-steps">{steps.map(({ title, text }, index) => <li key={title}><span className="fv-step-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
          <div className="fv-centered fv-how-cta"><SignupLink>Começar meu cadastro</SignupLink></div>
        </div></section>
        <section id="produto" className="fv-section fv-container" aria-labelledby="produto-title">
          <div className="fv-section-heading fv-heading-split"><div><p className="fv-eyebrow">Conheça por dentro</p><h2 id="produto-title">Seus números.<br /><em>Uma nova perspectiva.</em></h2></div><p className="fv-description">Explore as telas reais do FinVision com exemplos de uso. Todos os valores abaixo são dados DEMO fictícios.</p></div>
          <div className="fv-screen-buttons" role="group" aria-label="Escolher tela do produto">{screens.map(screen => <button type="button" key={screen.id} aria-pressed={selectedScreen.id === screen.id} onClick={() => setSelectedScreen(screen)}><screen.icon size={17} aria-hidden="true" />{screen.label}</button>)}</div>
          <figure className="fv-product-figure"><div className="fv-product-caption" aria-live="polite"><div><span className="fv-demo-tag">DEMO — DADOS FICTÍCIOS</span><h3>{selectedScreen.title}</h3><p>{selectedScreen.text}</p></div><a href={`/landing/${selectedScreen.id}.webp`} target="_blank" rel="noopener noreferrer" className="fv-text-link" aria-label={`Ampliar captura de ${selectedScreen.label} em nova aba`}>Ampliar <ArrowUpRight size={15} aria-hidden="true" /></a></div><img src={`/landing/${selectedScreen.id}.webp`} alt={selectedScreen.alt} width="1440" height={selectedScreen.height ?? 1100} loading="lazy" /><figcaption>Telas reais do aplicativo com dados DEMO fictícios. Os exemplos não representam clientes nem resultados garantidos.</figcaption></figure>
          <p className="fv-demo-link">Prefere conhecer o passo a passo? <Link to="/demonstracao" className="fv-text-link">Ver roteiro de apresentação <ArrowRight size={15} aria-hidden="true" /></Link></p>
        </section>
        <section id="plano" className="fv-section fv-plan-section" aria-labelledby="plano-title"><div className="fv-container fv-plan-layout">
          <div><p className="fv-eyebrow">Clareza também no preço</p><h2 id="plano-title">Um plano simples.<br /><span className="fv-green">Mais espaço para se organizar.</span></h2><p className="fv-description">Estamos preparando o próximo passo do FinVision. Enquanto isso, crie sua conta e solicite acesso à fase Beta.</p><Link to="/beta" className="fv-text-link">Entenda a fase Beta <ArrowUpRight size={16} aria-hidden="true" /></Link><div className="fv-plan-info"><LockKeyhole size={20} aria-hidden="true" /><p>Você decide quando começar.<br /><span>Nenhum pagamento é solicitado nesta página.</span></p></div></div>
          <article className="fv-price-card"><div className="fv-price-card-heading"><Brand /><span className="fv-status">Em preparação</span></div><p className="fv-price-label">Preço planejado para a assinatura</p><p className="fv-price">{LANDING_PRICE_LABEL}<span>/mês</span></p><p className="fv-price-subtitle">Organização para acompanhar seu dia a dia.</p><ul>{["Dashboard e análises de despesas", "Contas, cartões, faturas e parcelamentos", "Registros financeiros e extratos", "Previsões e contas recorrentes", "Exportação dos seus registros financeiros"].map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul><SignupLink>Solicitar acesso Beta</SignupLink><p className="fv-small-note">Assinatura em preparação. O acesso Beta depende de liberação e não é automático após o cadastro.</p></article>
        </div></section>
        <section id="faq" className="fv-section fv-container fv-faq-layout" aria-labelledby="faq-title"><div><p className="fv-eyebrow">Sem dúvidas pelo caminho</p><h2 id="faq-title">Antes de<br />dar o primeiro passo.</h2><p className="fv-description">Respostas diretas para você conhecer melhor o FinVision.</p><Link to="/beta" className="fv-text-link">Mais sobre o Beta <ArrowUpRight size={16} aria-hidden="true" /></Link></div><div className="fv-faq-list">{faq.map(({ q, a }) => <details key={q}><summary>{q}<Plus className="fv-faq-plus" size={19} aria-hidden="true" /></summary><p>{a}</p></details>)}</div></section>
        <section className="fv-final-section fv-container" aria-labelledby="final-title"><div className="fv-final"><span className="fv-final-icon" aria-hidden="true"><LayoutDashboard size={26} /></span><p className="fv-eyebrow">Seu próximo passo começa aqui</p><h2 id="final-title">Mais clareza para o seu dinheiro.<br /><span className="fv-green">Mais tranquilidade para você.</span></h2><p>Crie sua conta e solicite acesso ao Beta do FinVision.</p><SignupLink>Criar conta e solicitar acesso Beta</SignupLink><p className="fv-small-note">Sem pagamento nesta etapa. Acesso sujeito à liberação.</p></div></section>
      </main>
      <footer className="fv-footer"><div className="fv-container"><div className="fv-footer-top"><div><Link to="/conhecer" aria-label="FinVision — início"><Brand /></Link><p>Seu dinheiro mais organizado.<br />Suas decisões mais claras.</p></div><nav aria-label="Navegação do rodapé"><a href="#recursos">Recursos</a><Link to="/demonstracao">Apresentação</Link><Link to="/beta">Fase Beta</Link><Link to="/auth">Entrar</Link></nav></div><div className="fv-footer-bottom"><p>© {new Date().getFullYear()} FinVision. Organização financeira pessoal.</p><p>Feito para trazer clareza ao seu dia a dia.</p></div></div></footer>
    </div>
  );
}
