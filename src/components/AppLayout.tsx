import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { OnboardingTour } from "@/components/OnboardingTour";
import { AppUpdateBanner } from "@/components/AppUpdateBanner";
import { startAppUpdateWatcher } from "@/lib/app-update";
import { Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

const pageNames: Record<string, string> = {
  "/": "Visão geral",
  "/analises-despesas": "Análises",
  "/records": "Registros",
  "/extratos": "Extratos",
  "/accounts": "Contas & cartões",
  "/transfers": "Transferências",
  "/categories": "Categorias",
  "/forecasts": "Previsões",
  "/receipt": "Importar comprovante",
  "/profile": "Perfil",
};

export default function AppLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    startAppUpdateWatcher();
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hidden h-14 shrink-0 items-center justify-between border-b border-border/70 bg-background/80 px-5 backdrop-blur-xl md:flex">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-xl border border-border bg-card" />
              <span className="h-4 w-px bg-border" />
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {pageNames[pathname] ?? "FinVision"}
              </span>
            </div>
            <div className="flex items-center gap-3">
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
              Sua central financeira
            </span>
            <ThemeToggle />
            </div>
          </header>
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl md:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-sidebar text-sm font-extrabold text-sidebar-primary">F</span>
              <div>
                <p className="font-display text-sm font-bold leading-none text-foreground"><span className="text-foreground dark:text-white">Fin</span><span className="text-primary">Vision</span></p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{pageNames[pathname] ?? "Finanças"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <SidebarTrigger className="h-9 w-9 rounded-xl border border-border bg-card text-foreground" />
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden px-3 pb-20 pt-3 sm:px-5 md:px-6 md:pb-8 md:pt-5 lg:px-8 lg:pt-6">
            <Outlet />
          </main>
        </div>
        <BottomNav />
        {pathname === "/" && <OnboardingTour />}
        <AppUpdateBanner />
      </div>
    </SidebarProvider>
  );
}
