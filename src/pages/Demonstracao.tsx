import { Link } from "react-router-dom";
import { ArrowRight, ImageOff } from "lucide-react";

export const STORYBOARD = [
  { time: "0–6s", scene: "Abertura", screen: "Painel com o saldo do período", narration: "Quer saber para onde vai seu dinheiro? Conheça o FinanceControl." },
  { time: "6–16s", scene: "Novo registro", screen: "Botão “Novo registro” e formulário", narration: "Registre uma entrada ou uma saída em segundos, com categoria e forma de pagamento." },
  { time: "16–28s", scene: "Leitura de comprovante", screen: "Tela “Ler comprovante” com a revisão dos dados", narration: "Tire foto de um cupom ou comprovante Pix. A IA sugere os dados e você confere antes de salvar." },
  { time: "28–38s", scene: "Cartões e faturas", screen: "Contas & cartões com limite e fatura", narration: "Parcele compras no cartão e acompanhe a fatura de cada mês, sem contar gasto em dobro." },
  { time: "38–48s", scene: "Previsões", screen: "Lista de contas fixas do mês", narration: "Cadastre aluguel, luz e internet e veja o que já foi pago e o que vence." },
  { time: "48–58s", scene: "Encerramento", screen: "Análises por categoria e chamada final", narration: "Clareza do cupom à fatura. Crie sua conta no FinanceControl." },
];

export default function Demonstracao() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link className="font-display text-xl font-bold tracking-tight" to="/conhecer">Finance<span className="text-primary">Control</span></Link>
        <Link to="/auth" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Entrar</Link>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-20">
        <p className="eyebrow">Roteiro do vídeo · 45–60 segundos</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Como o FinanceControl funciona</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Este é o roteiro planejado do vídeo explicativo. O vídeo ainda não foi gravado; os espaços abaixo receberão capturas reais do aplicativo.
        </p>

        <ol className="mt-8 space-y-4">
          {STORYBOARD.map((s, i) => (
            <li key={s.scene} className="dashboard-card grid gap-4 p-4 md:grid-cols-[220px_1fr] md:p-5">
              <div role="img" aria-label={`Espaço reservado para captura: ${s.screen}`}
                className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground md:aspect-[4/3]">
                <div className="flex flex-col items-center gap-1 px-3 text-center text-xs"><ImageOff className="h-5 w-5" aria-hidden />Captura futura</div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Cena {i + 1} · {s.time}</p>
                <h2 className="mt-1 text-lg font-bold">{s.scene}</h2>
                <p className="mt-1 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Tela:</span> {s.screen}</p>
                <p className="mt-2 text-sm leading-6"><span className="font-semibold">Narração:</span> “{s.narration}”</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link to="/auth" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            Criar minha conta <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/conhecer" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold hover:bg-accent">Voltar para a apresentação</Link>
        </div>
      </main>
    </div>
  );
}
