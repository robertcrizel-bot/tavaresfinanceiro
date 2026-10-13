import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  dismissAppUpdateNotice,
  getAppUpdateState,
  requestAppReload,
  subscribeAppUpdate,
} from "@/lib/app-update";

export function AppUpdateBanner() {
  const [, setTick] = useState(0);

  useEffect(() => subscribeAppUpdate(() => setTick((n) => n + 1)), []);

  const { updateAvailable, dismissed, busy } = getAppUpdateState();
  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="app-update-banner"
      className="fixed left-1/2 top-2 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-primary/30 bg-card/95 px-3 py-2 shadow-lg backdrop-blur"
    >
      <p className="min-w-0 flex-1 text-xs font-semibold text-foreground">
        {busy
          ? "Nova versão disponível — conclua a operação atual para atualizar."
          : "Nova versão disponível."}
      </p>
      {!busy && (
        <Button size="sm" className="h-7 shrink-0 text-xs" onClick={() => requestAppReload()}>
          Atualizar
        </Button>
      )}
      <button
        type="button"
        aria-label="Dispensar aviso de atualização"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
        onClick={dismissAppUpdateNotice}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
