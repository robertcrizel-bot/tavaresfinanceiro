import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Download,
  Smartphone,
  CheckCircle2,
  Share,
  Share2,
  ArrowRight,
  Info,
  ScanLine,
} from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIos(/iphone|ipad|ipod/i.test(ua));
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  const sharingInstructions = (
    <div className="space-y-4 max-w-md text-left w-full">
      <div className="glass-card rounded-xl p-5 space-y-3 border-l-4 border-l-primary">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Share2 className="h-4 w-4 text-primary" />
          Como compartilhar comprovantes do banco (Android):
        </p>
        <ol className="text-xs sm:text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>
            Instale o app e <strong className="text-foreground">abra-o uma vez pela tela inicial</strong> para registrar o recurso no Android.
          </li>
          <li>
            No app do seu banco, ao abrir o comprovante (PIX, transferência ou pagamento), toque em <strong className="text-foreground">Compartilhar</strong>.
          </li>
          <li>
            Escolha o <strong className="text-foreground">FinanceControl</strong> na lista de apps. O comprovante será lido automaticamente!
          </li>
        </ol>
      </div>

      <div className="glass-card rounded-xl p-4 flex items-start gap-3 text-xs text-muted-foreground bg-muted/40">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground block mb-0.5">Usa iPhone ou iPad (iOS)?</strong>
          O sistema da Apple ainda não permite que apps web recebam arquivos pelo menu Compartilhar. Para importar, basta abrir o FinanceControl e tocar em <strong className="text-foreground">"Ler comprovante"</strong>.
        </div>
      </div>
    </div>
  );

  if (isStandalone || installed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="h-16 w-16 text-income" />
          <h1 className="text-2xl font-bold text-foreground">App instalado!</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            O FinanceControl já está na sua tela inicial.
          </p>
        </div>

        {sharingInstructions}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild className="gap-2">
            <Link to="/">
              Ir para o painel <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link to="/receipt">
              <ScanLine className="h-4 w-4" /> Ler comprovante
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-6 my-8">
      <div className="rounded-2xl overflow-hidden w-24 h-24 shadow-lg">
        <img src="/icon-192.png" alt="FinanceControl" width={96} height={96} />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Instalar FinanceControl</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Adicione o app à tela inicial do seu celular para acesso rápido e para compartilhar comprovantes direto do banco.
        </p>
      </div>

      {deferredPrompt ? (
        <Button size="lg" className="gap-2" onClick={handleInstall}>
          <Download className="h-5 w-5" />
          Instalar agora
        </Button>
      ) : isIos ? (
        <div className="glass-card rounded-xl p-5 max-w-sm space-y-3 text-left w-full">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Como instalar no iPhone / iPad:
          </p>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li className="flex items-start gap-2">
              <span>Toque no botão <Share className="inline h-4 w-4 text-primary" /> (Compartilhar) no Safari</span>
            </li>
            <li>Role para baixo e toque em <strong className="text-foreground">"Adicionar à Tela de Início"</strong></li>
            <li>Confirme tocando em <strong className="text-foreground">"Adicionar"</strong></li>
          </ol>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-5 max-w-sm space-y-3 text-left w-full">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Como instalar no Android:
          </p>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Abra o menu do navegador Chrome (⋮)</li>
            <li>Toque em <strong className="text-foreground">"Instalar app"</strong> ou <strong className="text-foreground">"Adicionar à tela inicial"</strong></li>
          </ol>
        </div>
      )}

      {sharingInstructions}

      <Button variant="ghost" asChild className="text-xs text-muted-foreground">
        <Link to="/">Voltar ao painel principal</Link>
      </Button>
    </div>
  );
}
