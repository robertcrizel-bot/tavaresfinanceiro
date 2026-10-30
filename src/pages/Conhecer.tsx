import { Link } from "react-router-dom";
import {
  ArrowRight, BarChart3, CalendarDays, Camera, CheckCircle2, CreditCard, Eye,
  HelpCircle, PlayCircle, ReceiptText, Save, Smartphone, Wallet, XCircle,
} from "lucide-react";

export const LANDING_PRICE_LABEL = "R$ 14,90";

const pains = [
  "O mês acaba e você não sabe onde o dinheiro foi parar.",
  "A fatura do cartão chega maior do que você esperava.",
  "Parcelas espalhadas em vários meses viram surpresa.",
  "Aluguel, luz e internet vencem e você lembra em cima da hora.",
  "Planilhas começam bem, mas são abandonadas em poucas semanas.",
];

const solutions = [
  { icon: Wallet, title: "Contas e lançamentos", text: "Registre entradas e saídas por conta, cartão ou dinheiro, com categorias, observações e anexos." },
  { icon: CreditCard, title: "Cartões e faturas", text: "Compras parceladas entram nas próximas faturas. Pagar a fatura não conta o gasto duas vezes." },
  { icon: CalendarDays, title: "Previsões do mês", text: "Cadastre contas fixas com vencimento e marque quando pagar. Veja o que ainda falta no mês." },
  { icon: BarChart3, title: "Relatórios e extratos", text: "Veja gastos por categoria e período e exporte extratos de contas e cartões." },
];

const steps = [
  { icon: Camera, title: "Fotografe", text: "Tire uma foto do cupom ou envie o comprovante Pix." },
  { icon: Eye, title: "Revise", text: "A IA (Cloudflare) sugere valor, data, categoria e itens. Você confere e corrige." },
  { icon: Save, title: "Salve", text: "O lançamento entra no seu controle, com o comprovante anexado." },
];

const differentials = [
  "Sem conexão com seu banco: nenhum acesso bancário é solicitado",
  "Transferências entre suas contas não viram gasto",
  "Funciona no navegador do celular e do computador",
  "Seus dados podem ser exportados a qualquer momento",
];

const faq = [
  { q: "Preciso instalar alguma coisa?", a: "Não. O FinVision funciona no navegador do celular ou computador. Se quiser, você pode adicioná-lo à tela inicial." },
  { q: "A leitura de comprovantes é perfeita?", a: "Não. A IA ajuda a preencher os dados, mas fotos ruins podem gerar erros. Por isso você sempre revisa antes de salvar. A leitura tem limites de uso." },
  { q: "Quanto custa?", a: `O plano previsto é de ${LANDING_PRICE_LABEL} por mês. Nenhuma cobrança é feita por esta página.` },
  { q: "O app conecta na minha conta bancária?", a: "Não. Você registra os lançamentos manualmente ou a partir de comprovantes." },
  { q: "Posso levar meus dados embora?", a: "Sim. No Perfil você exporta seus dados financeiros a qualquer momento." },
];

const primaryBtn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const secondaryBtn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Cta({ label = "Criar minha conta" }: { label?: string }) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link to="/auth" className={primaryBtn}>{label} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      <Link to="/demonstracao" className={secondaryBtn}><PlayCircle className="h-4 w-4" aria-hidden /> Ver como funciona</Link>
    </div>
  );
}

export default function Conhecer() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Link className="font-display text-xl font-bold tracking-tight" to="/conhecer">Finance<span className="text-primary">Control</span></Link>
        <nav aria-label="Principal" className="flex items-center gap-4 text-sm font-semibold">
          <Link to="/demonstracao" className="hidden text-muted-foreground hover:text-foreground sm:inline">Demonstração</Link>
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">Entrar</Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-8 md:pt-16">
          <p className="eyebrow">Finanças pessoais sem planilha</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Você sabe para onde seu dinheiro <span className="text-primary">está indo?</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Registre gastos, leia cupons com IA, acompanhe cartões e planeje as contas do mês — tudo em um só lugar, direto do celular.
          </p>
          <Cta />
        </section>

        {/* Dor */}
        <section aria-labelledby="dor" className="border-y border-border bg-card/40 py-16">
          <div className="mx-auto max-w-3xl px-5">
            <h2 id="dor" className="font-display text-2xl font-bold sm:text-3xl">Isso parece familiar?</h2>
            <ul className="mt-6 space-y-3">
              {pains.map(p => (
                <li key={p} className="dashboard-card flex gap-3 p-4 text-sm leading-6">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />{p}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-base font-semibold">Não é falta de disciplina. É falta de uma ferramenta simples.</p>
          </div>
        </section>

        {/* Destaque IA */}
        <section aria-labelledby="cupom" className="mx-auto max-w-6xl px-5 py-16">
          <p className="eyebrow">Destaque</p>
          <h2 id="cupom" className="mt-2 font-display text-2xl font-bold sm:text-3xl">Do cupom ao lançamento em três passos</h2>
          <ol className="mt-8 grid gap-3 md:grid-cols-3">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="workspace-panel p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="font-display text-sm font-bold text-muted-foreground">Passo {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex gap-2 text-xs leading-5 text-muted-foreground">
            <ReceiptText className="h-4 w-4 shrink-0" aria-hidden /> A IA pode errar em fotos ruins — por isso você sempre revisa. A leitura tem limites de uso.
          </p>
        </section>

        {/* Soluções */}
        <section aria-labelledby="funcoes" className="mx-auto max-w-6xl px-5 pb-16">
          <h2 id="funcoes" className="font-display text-2xl font-bold sm:text-3xl">Tudo o que você precisa para ter clareza</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {solutions.map(({ icon: Icon, title, text }) => (
              <article key={title} className="dashboard-card p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Diferenciais + demonstração */}
        <section aria-labelledby="diferenciais" className="border-y border-border bg-card/40 py-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-2 md:items-center">
            <div>
              <h2 id="diferenciais" className="font-display text-2xl font-bold sm:text-3xl">Feito para a vida real</h2>
              <ul className="mt-6 space-y-3 text-sm">
                {differentials.map(d => (
                  <li key={d} className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />{d}</li>
                ))}
              </ul>
            </div>
            <div className="workspace-panel p-6">
              <Smartphone className="h-8 w-8 text-primary" aria-hidden />
              <h3 className="mt-4 text-lg font-bold">Veja o app em ação</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Uma demonstração rápida das principais telas, sem precisar criar conta.</p>
              <Link to="/demonstracao" className={`${secondaryBtn} mt-5 w-full`}><PlayCircle className="h-4 w-4" aria-hidden /> Abrir demonstração</Link>
            </div>
          </div>
        </section>

        {/* Oferta */}
        <section aria-labelledby="preco" className="mx-auto max-w-6xl px-5 py-16">
          <div className="workspace-panel grid gap-6 border-primary/30 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <p className="eyebrow">Plano único</p>
              <h2 id="preco" className="mt-2 font-display text-2xl font-bold">Um plano simples</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {["Contas, cartões, faturas e previsões", "Leitura de cupons por IA (com limite de uso)", "Relatórios, extratos e exportação dos seus dados"].map(i => (
                  <li key={i} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />{i}</li>
                ))}
              </ul>
            </div>
            <div className="text-left md:text-right">
              <p className="font-display text-4xl font-bold tabular-nums">{LANDING_PRICE_LABEL}<span className="text-base font-semibold text-muted-foreground">/mês</span></p>
              <p className="mt-1 text-xs text-muted-foreground">Preço previsto. Nenhuma cobrança é feita nesta página.</p>
              <Link to="/beta" className={`${primaryBtn} mt-4 w-full md:w-auto`}>Participar do Beta <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq" className="mx-auto max-w-3xl px-5 pb-16">
          <h2 id="faq" className="flex items-center gap-2 font-display text-2xl font-bold"><HelpCircle className="h-6 w-6 text-primary" aria-hidden /> Perguntas frequentes</h2>
          <div className="mt-5 space-y-2">
            {faq.map(({ q, a }) => (
              <details key={q} className="dashboard-card p-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{q}</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-3xl px-5 pb-20 text-center">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Comece hoje a saber para onde vai seu dinheiro.</h2>
          <div className="flex justify-center"><Cta /></div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        FinVision · <Link to="/demonstracao" className="hover:text-foreground">Demonstração</Link> · <Link to="/auth" className="hover:text-foreground">Entrar</Link>
      </footer>
    </div>
  );
}
