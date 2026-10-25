import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CreditCard, LayoutDashboard, PiggyBank, ScanLine, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { markOnboardingDone, shouldShowOnboarding } from "@/lib/onboarding";

const steps = [
  { icon: LayoutDashboard, title: "Boas-vindas ao FinanceControl", text: "Em poucos passos você deixa tudo pronto. Este guia aparece só uma vez e pode ser reaberto no Perfil.", link: null },
  { icon: Wallet, title: "1. Cadastre contas e cartões", text: "Adicione suas contas, o caixa Dinheiro e seus cartões de crédito com limite e vencimento.", link: { to: "/accounts", label: "Abrir Contas & cartões" } },
  { icon: PiggyBank, title: "2. Registre entradas e saídas", text: "Use “Novo registro” no painel para lançar salários, compras e despesas. Compras no cartão podem ser parceladas.", link: { to: "/records", label: "Ver meus registros" } },
  { icon: ScanLine, title: "3. Leia um comprovante", text: "Envie a foto de um cupom ou comprovante Pix e revise os dados antes de salvar.", link: { to: "/receipt", label: "Ler comprovante" } },
  { icon: CreditCard, title: "4. Planeje o mês", text: "Cadastre contas fixas em Previsões e acompanhe os gastos por categoria em Análises.", link: { to: "/forecasts", label: "Abrir Previsões" } },
];

export function OnboardingTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setOpen(shouldShowOnboarding(user?.id, user?.created_at));
    setStep(0);
  }, [user?.id, user?.created_at]);

  if (!open || !user) return null;
  const close = () => { markOnboardingDone(user.id); setOpen(false); };
  const current = steps[step];
  const Icon = current.icon;
  const last = step === steps.length - 1;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="onboarding-title"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-2xl border border-primary/30 bg-popover p-4 shadow-2xl md:bottom-6 md:left-auto md:right-6 md:mx-0"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Primeiros passos · {step + 1} de {steps.length}</p>
          <h2 id="onboarding-title" className="mt-1 font-display text-lg font-bold text-foreground">{current.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{current.text}</p>
          {current.link && (
            <Link to={current.link.to} className="mt-2 inline-block text-sm font-bold text-primary hover:underline">{current.link.label} →</Link>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={close} aria-label="Fechar guia">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={close}>Pular</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(s => s - 1)} className="gap-1">
            <ArrowLeft className="h-4 w-4" />Voltar
          </Button>
          {last ? (
            <Button size="sm" onClick={close} className="gap-1"><Check className="h-4 w-4" />Concluir</Button>
          ) : (
            <Button size="sm" onClick={() => setStep(s => s + 1)} className="gap-1">Próximo<ArrowRight className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
    </section>
  );
}
