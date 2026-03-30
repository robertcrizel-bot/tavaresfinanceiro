import { Button } from "@/components/ui/button";
import { LogOut, Mail, User, Crown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Profile() {
  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

      <div className="glass-card rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">João Silva</h2>
            <p className="text-sm text-muted-foreground">Membro desde Jan 2025</p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>joao.silva@email.com</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Crown className="h-4 w-4" />
            <span>Plano Gratuito</span>
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => toast({ title: "Logout simulado", description: "Em um app real, você seria desconectado." })}
      >
        <LogOut className="h-4 w-4" /> Sair da conta
      </Button>
    </div>
  );
}
