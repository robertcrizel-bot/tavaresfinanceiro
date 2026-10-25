import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, CreditCard, PlayCircle, ReceiptText, Smartphone, Wallet } from "lucide-react";

export const LANDING_PRICE_LABEL = "R$ 14,90";

const features = [
  { icon: ReceiptText, title: "Leitura de comprovantes por IA", text: "Envie a foto de um cupom ou comprovante Pix. A IA (Cloudflare) sugere valor, data, categoria e itens; você revisa antes de salvar." },
  { icon: CreditCard, title: "Cartões e faturas", text: "Compras parceladas entram automaticamente nas próximas faturas. Pagar a fatura não conta o gasto duas vezes." },
  { icon: Wallet, title: "Despesas e receitas", text: "Registre entradas e saídas por conta, cartão ou dinheiro, com categorias, observações e anexos." },
  { icon: CalendarDays, title: "Previsões do mês", text: "Cadastre aluguel, energia, internet e outras contas fixas com vencimento e marque quando pagar." },
  { icon: BarChart3, title: "Relatórios e extratos", text: "Veja para onde vai o dinheiro por categoria e período, e exporte extratos de contas e cartões." },
  { icon: Smartphone, title: "No celular e no computador", text: "Funciona no navegador e pode ser instalado na tela inicial do celular." },
];

const faq = [
  { q: "Preciso instalar alguma coisa?", a: "Não. O FinanceControl funciona no navegador do celular ou computador. Se quiser, você pode adicioná-lo à tela inicial." },
  { q: "A leitura de comprovantes é perfeita?", a: "Não. A IA ajuda a preencher os dados, mas fotos ruins podem gerar erros. Por isso você sempre revisa antes de salvar. A leitura tem limites de uso." },
  { q: "Quanto custa?", a: `O plano previsto é de ${LANDING_PRICE_LABEL} por mês. Nenhuma cobrança é feita por esta página.` },
  { q: "O app conecta na minha conta bancária?", a: "Não. Você registra os lançamentos manualmente ou a partir de comprovantes. Nenhum acesso ao banco é solicitado." },
  { q: "Posso levar meus dados embora?", a: "Sim. No Perfil você exporta seus dados financeiros a qualquer momento." },
];

export default function Conhecer() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Link className="font-display text-xl font-bold tracking-tight" to="/conhecer">Finance<span className="text-primary">Control</span></Link>
        <nav aria-label="Principal" className="flex items-center gap-4 text-sm font-semibold">
          <Link to="/demonstracao" className="hidden text-muted-foreground hover:text-foreground sm:inline">Demonstração</Link>
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">Entrar</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-14 pt-10 md:pt-16">
          <p className="eyebrow">Finanças pessoais sem planilha</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Seu dinheiro, com clareza. <span className="text-primary">Do cupom à fatura.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Registre gastos, leia comprovantes com IA, acompanhe cartões e planeje as contas do mês em um só lugar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/auth" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Criar minha conta <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/demonstracao" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-accent">
              <PlayCircle className="h-4 w-4" aria-hidden /> Ver como funciona
            </Link>
          </div>
        </section>

        <section aria-labelledby="funcoes" className="mx-auto max-w-6xl px-5 pb-16">
          <h2 id="funcoes" className="font-display text-2xl font-bold sm:text-3xl">O que você encontra no app</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="dashboard-card p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="preco" className="mx-auto max-w-6xl px-5 pb-16">
          <div className="workspace-panel grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <h2 id="preco" className="font-display text-2xl font-bold">Um plano simples</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {["Contas, cartões, faturas e previsões", "Leitura de comprovantes por IA (com limite de uso)", "Relatórios, extratos e exportação dos seus dados"].map(i => (
                  <li key={i} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />{i}</li>
                ))}
              </ul>
            </div>
            <div className="text-left md:text-right">
              <p className="font-display text-4xl font-bold tabular-nums">{LANDING_PRICE_LABEL}<span className="text-base font-semibold text-muted-foreground">/mês</span></p>
              <p className="mt-1 text-xs text-muted-foreground">Preço previsto. Nenhuma cobrança é feita nesta página.</p>
              <Link to="/beta" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                Participar do Beta <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq" className="mx-auto max-w-3xl px-5 pb-20">
          <h2 id="faq" className="font-display text-2xl font-bold">Perguntas frequentes</h2>
          <div className="mt-5 space-y-2">
            {faq.map(({ q, a }) => (
              <details key={q} className="dashboard-card group p-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{q}</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        FinanceControl · <Link to="/demonstracao" className="hover:text-foreground">Demonstração</Link> · <Link to="/auth" className="hover:text-foreground">Entrar</Link>
      </footer>
    </div>
  );
}
