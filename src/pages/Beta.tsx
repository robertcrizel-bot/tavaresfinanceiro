import { Link } from "react-router-dom";
import {
  ArrowRight, CalendarDays, CheckCircle2, CreditCard, FileDown,
  LockKeyhole, ReceiptText, Smartphone, Wallet,
} from "lucide-react";
import { getBetaCheckoutUrl } from "@/lib/beta-checkout";
import { BETA_MONTHLY_PRICE_LABEL } from "@/lib/beta-plan";

const features = [
  { icon: Wallet, title: "Contas e lançamentos", description: "Registre receitas e despesas e acompanhe seu dinheiro em um só lugar." },
  { icon: CreditCard, title: "Cartões e faturas", description: "Organize compras, cartões e o acompanhamento das suas faturas." },
  { icon: CalendarDays, title: "Contas recorrentes", description: "Antecipe as despesas e receitas que se repetem ao longo dos meses." },
  { icon: ReceiptText, title: "Comprovantes", description: "Guarde comprovantes junto dos seus registros financeiros." },
  { icon: FileDown, title: "Seus dados com você", description: "Exporte seus registros financeiros quando precisar." },
  { icon: Smartphone, title: "No computador e celular", description: "Use o FinVision pelo navegador, sem planilhas espalhadas." },
];

export default function Beta() {
  const checkoutUrl = getBetaCheckoutUrl(import.meta.env.VITE_BETA_CHECKOUT_URL);
  const price = BETA_MONTHLY_PRICE_LABEL;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link className="text-xl font-black tracking-tight" to="/beta">
          Finance<span className="text-primary">Control</span>
        </Link>
        <Link to="/auth" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          Já tenho conta
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-14 pt-12 md:pb-20 md:pt-20">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-bold text-primary">
              <CheckCircle2 className="h-4 w-4" /> Vagas limitadas · Beta do FinVision
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Seu dinheiro, suas contas, <span className="text-primary">tudo mais organizado.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Chega de esquecer despesas ou perder o controle das faturas.
              Organize suas finanças pessoais com registros, previsões e comprovantes em um só lugar.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {checkoutUrl ? (
                <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  Conhecer a assinatura <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <span aria-label="Inscrições pagas ainda não disponíveis"
                  className="inline-flex min-h-12 items-center rounded-xl border border-border bg-secondary px-6 text-sm font-semibold text-muted-foreground">
                  Assinaturas em preparação
                </span>
              )}
              <Link to="/auth" className="inline-flex min-h-12 items-center rounded-xl border border-border px-6 text-sm font-semibold hover:bg-accent">
                Acessar minha conta
              </Link>
            </div>
            {checkoutUrl && (
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Pagamento processado fora do FinVision. Durante a beta, o acesso é
                liberado após confirmação do pagamento; pagar não ativa a conta instantaneamente.
              </p>
            )}
          </div>
        </section>

        <section className="border-y border-border bg-card/40 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-2xl font-bold sm:text-3xl">O essencial para cuidar das suas finanças</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-2xl border border-border bg-card p-6">
                  <Icon className="mb-4 h-7 w-7 text-primary" />
                  <h3 className="font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center md:py-20">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Convite para a beta</p>
            <h2 className="mt-3 text-3xl font-bold">Comece com o que realmente precisa.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Estamos abrindo uma fase inicial para aprimorar o produto com um grupo pequeno de usuários.
              O controle manual é o foco desta oferta; a leitura por IA ainda está em avaliação
              e não está incluída como benefício garantido.
            </p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-card p-7 shadow-sm">
            <p className="text-sm font-bold text-primary">Plano Beta</p>
            <p className="mt-2 text-4xl font-black">{price}<span className="ml-2 text-sm font-normal text-muted-foreground">/ mês</span></p>
            <div className="mt-6 space-y-3 text-sm">
              <p className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-primary" /> Registro de receitas e despesas</p>
              <p className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-primary" /> Contas, cartões e previsões</p>
              <p className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-primary" /> Exportação dos próprios dados</p>
              <p className="flex items-center gap-3"><LockKeyhole className="h-4 w-4 text-primary" /> Acesso por conta individual</p>
            </div>
            {checkoutUrl ? (
              <a className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                Ver formas de pagamento <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <p className="mt-7 rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-muted-foreground">
                Inscrições pagas ainda não foram abertas. Nenhum pagamento é solicitado nesta página.
              </p>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <h2 className="text-2xl font-bold sm:text-3xl">Perguntas frequentes</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold">Preciso instalar um aplicativo?</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Não. O FinVision funciona pelo navegador no celular ou no computador.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold">A leitura por inteligência artificial está incluída?</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Não como benefício garantido do plano Beta. A oferta é de organização
                financeira manual; recursos de leitura automática estão em avaliação.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold">Quando meu acesso é liberado?</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Após o cadastro e a confirmação da cobrança no provedor de pagamento,
                nossa equipe libera o acesso durante a fase Beta. O pagamento não
                libera a conta automaticamente.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold">Consigo levar meus dados se sair?</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A versão Beta permite exportar os registros financeiros em JSON.
                Imagens e PDFs dos comprovantes não fazem parte desse arquivo.
              </p>
            </article>
          </div>
          <p className="mt-6 text-xs leading-6 text-muted-foreground">
            As condições de contratação, cancelamento, privacidade e suporte serão
            apresentadas antes da abertura das assinaturas. Nenhum pagamento é
            solicitado enquanto o link oficial não estiver disponível.
          </p>
        </section>
      </main>
      <footer className="border-t border-border px-5 py-7 text-center text-xs text-muted-foreground">
        FinVision · Beta de controle financeiro pessoal · Não é instituição financeira
      </footer>
    </div>
  );
}
