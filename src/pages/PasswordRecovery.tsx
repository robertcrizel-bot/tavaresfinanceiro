import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, LockKeyhole, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Password reset works for both the standard recovery email and a Supabase
 * PASSWORD_RECOVERY event. The URL never contains a password, nor is the
 * password written to logs/local storage.
 *
 * Deployment requirement: allow
 * https://<production-host>/recuperar-senha?recovery=1
 * in Supabase Auth's redirect URL allowlist.
 */
export default function PasswordRecovery() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recoveryEvent, setRecoveryEvent] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryEvent(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Supabase can consume the URL token before this page subscribes.
  // The recovery marker is non-sensitive and checked with a valid session.
  const recoveryIntent = new URLSearchParams(window.location.search).get("recovery") === "1";
  const canChangePassword = Boolean(user && (recoveryIntent || recoveryEvent));

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const redirectTo = new URL("/recuperar-senha?recovery=1", window.location.origin).toString();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) throw resetError;
      setMessage("Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Verifique também a pasta de spam.");
    } catch {
      setError("Não foi possível enviar o link. Tente novamente mais tarde.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setError("");
    if (password.length < 8) { setError("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (password !== confirmPassword) { setError("As senhas digitadas não coincidem."); return; }
    submitting.current = true;
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      navigate("/", { replace: true });
    } catch {
      setError("Não foi possível atualizar a senha. Solicite um novo link, se necessário.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center justify-center gap-3 text-primary">
          {canChangePassword ? <LockKeyhole className="h-7 w-7" /> : <Mail className="h-7 w-7" />}
          <h1 className="text-2xl font-bold text-foreground">
            {canChangePassword ? "Criar nova senha" : "Recuperar senha"}
          </h1>
        </div>
        {canChangePassword ? (
          <form onSubmit={changePassword} className="glass-card space-y-4 rounded-xl p-6">
            <p className="text-sm text-muted-foreground">Defina uma senha nova para sua conta.</p>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" autoComplete="new-password" type="password" minLength={8}
                required value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input id="confirm-password" autoComplete="new-password" type="password" minLength={8}
                required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Atualizar senha
            </Button>
          </form>
        ) : (
          <form onSubmit={sendLink} className="glass-card space-y-4 rounded-xl p-6">
            <p className="text-sm text-muted-foreground">Informe o e-mail da sua conta para receber um link de recuperação.</p>
            <div className="space-y-2">
              <Label htmlFor="recovery-email">E-mail</Label>
              <Input id="recovery-email" autoComplete="email" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} />
            </div>
            {message && <p role="status" className="text-sm text-primary">{message}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar link
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link className="font-medium text-primary hover:underline" to="/auth">Voltar ao login</Link>
        </p>
      </div>
    </main>
  );
}
