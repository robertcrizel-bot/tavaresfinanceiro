import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, CheckCircle2, Share } from "lucide-react";

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

  if (isStandalone || installed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <CheckCircle2 className="h-16 w-16 text-income" />
        <h1 className="text-2xl font-bold text-foreground">App instalado!</h1>
        <p className="text-muted-foreground max-w-sm">
          O FinanceControl já está na sua tela inicial. Abra-o por lá para a melhor experiência.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-6">
      <div className="rounded-2xl overflow-hidden w-24 h-24 shadow-lg">
        <img src="/icon-192.png" alt="Finance Control" width={96} height={96} />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Instalar Finance Control</h1>
        <p className="text-muted-foreground max-w-sm">
          Adicione o app à tela inicial do seu celular para acesso rápido, como um app nativo.
        </p>
      </div>

      {deferredPrompt ? (
        <Button size="lg" className="gap-2" onClick={handleInstall}>
          <Download className="h-5 w-5" />
          Instalar agora
        </Button>
      ) : isIos ? (
        <div className="glass-card rounded-xl p-5 max-w-sm space-y-3 text-left">
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
        <div className="glass-card rounded-xl p-5 max-w-sm space-y-3 text-left">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Como instalar:
          </p>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Abra o menu do navegador (⋮)</li>
            <li>Toque em <strong className="text-foreground">"Instalar app"</strong> ou <strong className="text-foreground">"Adicionar à tela inicial"</strong></li>
          </ol>
        </div>
      )}
    </div>
  );
}
