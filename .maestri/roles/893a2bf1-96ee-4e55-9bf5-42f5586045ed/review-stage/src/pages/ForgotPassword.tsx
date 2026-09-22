import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AlertCircle, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAppUrl } from '../config/app';
import { AuthLayout } from '../components/auth/AuthLayout';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${getAppUrl()}/reset` }
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: any) {
      console.error('Erro ao enviar reset:', err);
      let message = err.message;
      if (message?.toLowerCase().includes('load failed') || message?.toLowerCase().includes('fetch')) {
        message = 'Erro de conexão. Verifique sua internet e tente novamente.';
      }
      setError(message || 'Não foi possível enviar o link. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const headerAction = (
    <Link to="/login" className="text-xs font-semibold text-ink-secondary hover:text-ink flex items-center gap-1.5 transition-colors">
      <ArrowLeft className="w-3.5 h-3.5" />
      Voltar
    </Link>
  );

  return (
    <AuthLayout
      title="Esqueceu sua senha?"
      description="Digite o e-mail da sua conta e enviaremos um link para redefinir sua senha."
      headerRightAction={headerAction}
    >
      {error && (
        <div className="mb-5 p-3 bg-danger-bg border border-danger/20 rounded-md flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-danger-ink mt-0.5 shrink-0" />
          <p className="text-xs text-danger-ink font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {sent ? (
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-2xl bg-success-bg border border-success/20 flex items-center justify-center mx-auto">
            <Mail className="w-7 h-7 text-success-ink" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-ink font-display">Link enviado!</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Se o e-mail <span className="font-semibold text-ink">{email}</span> estiver cadastrado, você receberá o link de recuperação em instantes.
            </p>
          </div>
          <Link to="/login" className="inline-block text-xs text-mint-800 hover:text-mint-900 font-semibold transition-colors">
            Voltar ao login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-secondary" htmlFor="email">E-mail cadastrado</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              className="input-modern"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full btn-gradient flex items-center justify-center gap-2 py-2.5 text-sm mt-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span className="font-semibold tracking-tight">Enviar link de recuperação</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
