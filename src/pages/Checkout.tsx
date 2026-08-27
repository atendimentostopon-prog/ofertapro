import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle, AlertCircle, Shield, Lock, RefreshCw, CreditCard, Sparkles, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  getSku,
  PLAN_LABELS,
  FEATURES_BY_PLAN,
  type PlanCode,
  type BillingCycle,
} from '../config/planCatalog';
import { useSubscription } from '../hooks/useSubscription';
import { useUser } from '../context/UserContext';
import { APP_NAME } from '../config/app';

const VALID_PLANS: PlanCode[] = ['starter', 'pro', 'enterprise'];

const WaitingStep: React.FC<{ plan: PlanCode }> = ({ plan }) => {
  const { data: subscription } = useSubscription();
  const { refreshProfile } = useUser();
  const nav = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const refreshedRef = useRef(false);

  // Não dá pra casar por subscriptionId aqui -- no fluxo hospedado a Stripe só
  // cria a subscription depois que o usuário paga na página dela, então nunca
  // temos o ID de antemão. useSubscription() já busca a assinatura
  // active/past_due mais recente do usuário, então plan_code + status já
  // identifica com segurança que é a assinatura que acabou de ser criada.
  const success = !!(subscription && subscription.plan_code === plan && subscription.status === 'active');

  useEffect(() => {
    if (success) return;
    const t = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!success || refreshedRef.current) return;
    refreshedRef.current = true;
    // profiles.plan já foi atualizado pelo webhook no banco, mas o UserContext
    // só recarrega no login/onAuthStateChange -- sem isso o resto do app
    // (Dashboard, limites de oferta/canal) continua achando que o user é free.
    refreshProfile();
  }, [success, refreshProfile]);

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle className="w-12 h-12 text-mint-500" />
        <p className="text-sm text-ink-secondary">
          Seu plano <strong className="text-ink">{PLAN_LABELS[plan]}</strong> está ativo.
        </p>
        <button onClick={() => nav('/dashboard')} className="btn-gradient px-6 py-2.5 font-semibold text-sm mt-2 cursor-pointer">
          Ir para o Dashboard
        </button>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <AlertCircle className="w-12 h-12 text-warning" />
        <p className="text-sm text-ink-secondary">
          Isso está demorando mais que o esperado. Se você concluiu o pagamento, aguarde mais um pouco ou fale com o suporte -- ele não vai duplicar a cobrança.
        </p>
        <button onClick={() => nav('/pricing')} className="btn-secondary px-6 py-2.5 font-semibold text-sm mt-2 cursor-pointer">
          Voltar aos planos
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="w-8 h-8 border-2 border-mint-200 border-t-mint-500 rounded-full animate-spin" />
      <p className="text-sm text-ink-secondary">
        Confirmando seu pagamento…<br />
        A atualização acontece automaticamente aqui.
      </p>
    </div>
  );
};

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user, loading: userLoading } = useUser();

  const planParam = searchParams.get('plan');
  const cycleParam = (searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly') as BillingCycle;
  const plan = VALID_PLANS.includes(planParam as PlanCode) ? (planParam as PlanCode) : null;
  const returningFromStripe = searchParams.get('success') === '1';

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      nav('/login', { replace: true });
      return;
    }
    if (!plan) {
      nav('/pricing', { replace: true });
      return;
    }
    // Voltando do Stripe Checkout depois do pagamento -- não cria uma sessão
    // nova, só mostra o step de espera até o webhook confirmar.
    if (returningFromStripe) return;

    const sku = getSku(plan, cycleParam);
    supabase.functions
      .invoke('stripe-create-subscription', {
        body: { plan_code: plan, billing_cycle: cycleParam, price_id: sku.stripePriceId },
      })
      .then(async ({ data, error: invokeError }) => {
        if (invokeError || !data?.url) {
          // supabase.functions.invoke só popula `data` em respostas 2xx -- num erro
          // (400/401/500), `data` vem null e `invokeError.message` é sempre o texto
          // genérico da lib. A mensagem específica da edge function só dá pra ler
          // no corpo bruto da resposta em invokeError.context.
          let message: string | undefined = data?.error;
          if (!message && invokeError && typeof (invokeError as any)?.context?.json === 'function') {
            try {
              const body = await (invokeError as any).context.json();
              message = body?.error;
            } catch {
              // resposta de erro não veio como JSON -- ignora e cai no fallback genérico
            }
          }
          setError(message || invokeError?.message || 'Não foi possível iniciar o checkout. Tente novamente.');
          return;
        }
        window.location.href = data.url;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, user, plan, cycleParam, returningFromStripe]);

  if (!plan) return null;

  const sku = getSku(plan, cycleParam);

  const nextBillingLabel = (() => {
    const d = new Date();
    if (cycleParam === 'monthly') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  })();

  return (
    <div className="min-h-screen bg-gradient-to-b from-mint-50 via-surface-1 to-surface-1 text-ink">
      <header className="border-b border-line bg-surface-0/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <img src="/brand/logo-primary.png" alt={APP_NAME} className="h-7 w-auto select-none" draggable={false} />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-mint-800 bg-mint-100 px-2.5 py-1 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              Ambiente seguro
            </span>
            <button
              onClick={() => nav('/pricing')}
              className="text-xs font-medium text-ink-tertiary hover:text-ink-secondary transition-colors cursor-pointer"
            >
              Voltar aos planos
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center mb-10 animate-fade-in">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink font-display">Só mais um passo</h1>
          <p className="text-sm text-ink-secondary mt-1.5">Finalize sua assinatura e desbloqueie o {PLAN_LABELS[plan]} agora mesmo.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr] gap-6 items-start">
          <div className="relative bg-surface-0 border border-line rounded-2xl p-6 shadow-lg overflow-hidden animate-slide-up">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-mint-400 via-mint-500 to-mint-600" />

            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-mint-100 text-mint-700 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-ink-tertiary uppercase tracking-wide">Resumo do pedido</p>
                <h2 className="text-lg font-bold text-ink font-display leading-tight">Plano {PLAN_LABELS[plan]}</h2>
              </div>
            </div>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold gradient-text-brand font-display">R$ {sku.price.toFixed(2).replace('.', ',')}</span>
              <span className="text-xs text-ink-tertiary">/{cycleParam === 'monthly' ? 'mês' : 'ano'}</span>
            </div>

            <ul className="mt-6 space-y-2.5">
              {FEATURES_BY_PLAN[plan].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink-secondary">
                  <Check className="w-4 h-4 text-mint-500 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-6 pt-5 border-t border-line space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-secondary">Cobrado hoje</span>
                <span className="font-semibold text-ink">R$ {sku.price.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-ink-tertiary">
                <span>Próxima cobrança</span>
                <span>{nextBillingLabel}</span>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-line flex items-center justify-center gap-5">
              {[
                { icon: <Shield className="w-3.5 h-3.5" />, text: 'Pagamento seguro' },
                { icon: <Lock className="w-3.5 h-3.5" />, text: 'Dados criptografados' },
                { icon: <RefreshCw className="w-3.5 h-3.5" />, text: 'Cancele quando quiser' },
              ].map(f => (
                <div key={f.text} className="flex flex-col items-center gap-1.5 text-center">
                  <span className="w-8 h-8 rounded-full bg-mint-50 text-mint-700 flex items-center justify-center">{f.icon}</span>
                  <span className="text-[10px] font-medium text-ink-tertiary max-w-[64px] leading-tight">{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="bg-surface-0 border border-line rounded-2xl p-6 shadow-lg animate-slide-up"
            style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-graphite text-ink-inverse flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink font-display leading-tight">Pagamento</h2>
                <p className="text-xs text-ink-secondary">Cartão, Apple Pay ou Google Pay</p>
              </div>
            </div>

            <div className="mt-6">
              {error ? (
                <p className="text-xs text-danger-ink font-medium">{error}</p>
              ) : returningFromStripe ? (
                <WaitingStep plan={plan} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <div className="w-6 h-6 border-2 border-mint-200 border-t-mint-500 rounded-full animate-spin" />
                  <p className="text-xs text-ink-tertiary">Preparando pagamento seguro…</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
