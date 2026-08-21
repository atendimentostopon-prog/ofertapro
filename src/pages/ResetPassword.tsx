import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { AuthLayout } from '../components/auth/AuthLayout';
import {
  PasswordStrengthMeter,
  isPasswordValid as computePasswordValid,
} from '../components/auth/PasswordStrengthMeter';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) setReady(true);
      setCheckingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
        setCheckingSession(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const passwordsMatch = password === confirmPassword;
  const isValid = computePasswordValid(password);
  const canSubmit = ready && isValid && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password.trim(),
      });
      if (updateError) throw updateError;
      toast('Senha alterada com sucesso! Faça login com a nova senha.', 'success');
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (err: any) {
      console.error('Erro ao redefinir senha:', err);
      setError(err.message || 'Não foi possível redefinir a senha. O link pode ter expirado.');
    } finally {
      setLoading(false);
    }
  };

  const headerAction = (
    <Link to="/login" className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors">
      <ArrowLeft className="w-3.5 h-3.5" />
      Voltar
    </Link>
  );

  return (
    <AuthLayout
      title="Redefinir senha"
      description="Escolha uma nova senha para a sua conta."
      headerRightAction={headerAction}
      showFloatingDecor={false}
    >
      {error && (
        <div className="mb-5 p-3 bg-red-500/6 border border-red-500/12 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300/90 font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {checkingSession ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-500/25 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : !ready ? (
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Link inválido ou expirado</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Este link de redefinição não é válido ou já foi utilizado. Solicite um novo pelo botão abaixo.
            </p>
          </div>
          <Link to="/forgot" className="inline-block text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors">
            Solicitar novo link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400" htmlFor="password">Nova senha</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="input-modern pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <PasswordStrengthMeter password={password} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400" htmlFor="confirm">Confirme a nova senha</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Digite a mesma senha"
              className={`input-modern ${confirmPassword && !passwordsMatch ? 'border-red-500/25' : ''}`}
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-[11px] text-red-400 font-medium">As senhas não coincidem.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full btn-gradient flex items-center justify-center gap-2 py-2.5 text-sm mt-2 disabled:opacity-35 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span className="font-semibold tracking-tight">Salvar nova senha</span>
                <Check className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPassword;
