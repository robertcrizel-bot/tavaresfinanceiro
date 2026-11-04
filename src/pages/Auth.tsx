import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "cadastro");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        toast({ title: "Bem-vindo de volta!" });
      } else {
        await signUp(email, password, displayName || undefined);
        toast({ title: "Conta criada!", description: "Verifique seu email para confirmar." });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Não foi possível autenticar.";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      // Supabase redirects to Google; the existing auth listener restores the session.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Não foi possível conectar ao Google.";
      toast({ title: "Erro no acesso com Google", description: message, variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">
            <span className="text-foreground">Fin</span><span className="text-primary">Vision</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            {isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 space-y-4">
          {!isLogin && (
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
            />
          </div>
          {isLogin && (
            <div className="text-right">
              <Link className="text-sm font-medium text-primary hover:underline" to="/recuperar-senha">
                Esqueci minha senha
              </Link>
            </div>
          )}
          {!isLogin && <p className="text-xs leading-5 text-muted-foreground">O cadastro não ativa uma assinatura. Durante o Beta, o acesso depende de liberação.</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLogin ? "Entrar" : "Criar Conta"}
          </Button>
        </form>

        <div className="space-y-3" aria-label="Outras opções de acesso">
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span>ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="h-11 w-full gap-3 rounded-xl font-medium" disabled={loading} onClick={() => void handleGoogleSignIn()}>
            <span className="text-lg font-bold text-[#4285F4]" aria-hidden="true">G</span>
            Continuar com Google
          </Button>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            O acesso Beta continua sujeito à aprovação, inclusive com Google.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? "Criar conta" : "Fazer login"}
          </button>
        </p>
      </div>
    </div>
  );
}
