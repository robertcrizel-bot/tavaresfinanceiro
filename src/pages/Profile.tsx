import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Mail, User, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { BUILD_COMMIT, BUILD_TIME } from "@/lib/build-info";

function formatBuildTime(iso: string): string {
  if (!iso || iso === "desconhecido") return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: displayName })
      .eq("user_id", user.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Perfil atualizado" });
    setSaving(false);
    setEditing(false);
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

      <div className="glass-card rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="flex gap-2">
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <Button size="sm" onClick={handleSave} disabled={saving}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{displayName || "Usuário"}</h2>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Membro desde {user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—"}
            </p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>{user?.email}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        <p className="font-bold uppercase tracking-[0.14em]">Versão do aplicativo</p>
        <p className="mt-1">
          Build: {BUILD_COMMIT} · {formatBuildTime(BUILD_TIME)}
        </p>
        <p>Origem: {typeof window !== "undefined" ? window.location.origin : "—"}</p>
      </div>

      <Button
        variant="outline"
        className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" /> Sair da conta
      </Button>
    </div>
  );
}
