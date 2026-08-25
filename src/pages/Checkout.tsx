import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Check, CheckCircle, AlertCircle, Shield, Lock, RefreshCw } from 'lucide-react';
import { stripePromise } from '../lib/stripe';
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

const WaitingStep: React.FC<{ subscriptionId: string; plan: PlanCode }> = ({ subscriptionId, plan }) => {
  const { data: subscription } = useSubscription();
  const { refreshProfile } = useUser();
  const nav = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const refreshedRef = useRef(false);

  const success = !!(subscription && subscription.provider_subscription_id === subscriptionId && subscription.status === 'active');

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

const PaymentPanel: React.FC<{ onConfirmed: () => void }> = ({ onConfirmed }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (billingName?: string) => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/settings`,
          ...(billingName ? { payment_method_data: { billing_details: { name: billingName } } } : {}),
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        setError(confirmError.message || 'Não foi possível confirmar o pagamento.');
        return;
      }

      // Vai pro step de espera mesmo em sucesso imediato -- não dá pra confiar
      // em "sucesso imediato = já pode fechar": o cartão aprovado na hora ainda
      // depende do webhook invoice.paid criar a linha em subscriptions antes
      // do resto do app reconhecer o plano novo.
      onConfirmed();
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao processar o pagamento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ExpressCheckoutElement
        onConfirm={() => confirm()}
        options={{ buttonType: { applePay: 'buy', googlePay: 'buy' }, layout: { maxColumns: 2 } }}
      />

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-line" />
        <span className="text-[10px] text-ink-tertiary font-medium uppercase tracking-wider select-none">ou com cartão</span>
        <div className="flex-1 h-px bg-line" />
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          confirm(name);
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-secondary" htmlFor="cc-name">Nome no cartão</label>
          <input
            id="cc-name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Como está impresso no cartão"
            className="input-modern"
            autoComplete="cc-name"
          />
        </div>

        <PaymentElement options={{ fields: { billingDetails: { name: 'never' } } }} />

        {error && <p className="text-xs text-danger-ink font-medium">{error}</p>}

        <button
          type="submit"
          disabled={!stripe || submitting}
          className="w-full btn-gradient flex items-center justify-center gap-2 py-3 text-sm mt-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          {submitting ? (
            <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="font-semibold tracking-tight">Confirmar assinatura</span>
          )}
        </button>
      </form>
    </>
  );
};

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user, loading: userLoading } = useUser();

  const planParam = searchParams.get('plan');
  const cycleParam = (searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly') as BillingCycle;
  const plan = VALID_PLANS.includes(planParam as PlanCode) ? (planParam as PlanCode) : null;

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
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

    const sku = getSku(plan, cycleParam);
    supabase.functions
      .invoke('stripe-create-subscription', {
        body: { plan_code: plan, billing_cycle: cycleParam, price_id: sku.stripePriceId },
      })
      .then(async ({ data, error: invokeError }) => {
        if (invokeError || !data?.clientSecret || !data?.subscriptionId) {
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
        setClientSecret(data.clientSecret);
        setSubscriptionId(data.subscriptionId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, user, plan, cycleParam]);

  if (!plan) return null;

  const sku = getSku(plan, cycleParam);

  return (
    <div className="min-h-screen bg-surface-1 text-ink">
      <header className="border-b border-line bg-surface-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <img src="/brand/logo-primary.png" alt={APP_NAME} className="h-7 w-auto select-none" draggable={false} />
          <button
            onClick={() => nav('/pricing')}
            className="text-xs font-medium text-ink-tertiary hover:text-ink-secondary transition-colors cursor-pointer"
          >
            Voltar aos planos
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-8 items-start">
        <div className="bg-surface-0 border border-line rounded-2xl p-6 shadow-card">
          <p className="text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Resumo do pedido</p>
          <h2 className="text-xl font-bold text-ink font-display mt-1">Plano {PLAN_LABELS[plan]}</h2>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-ink font-display">R$ {sku.price.toFixed(2).replace('.', ',')}</span>
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

          <div className="mt-8 pt-6 border-t border-line flex items-center justify-center gap-6">
            {[
              { icon: <Shield className="w-3.5 h-3.5" />, text: 'Pagamento seguro' },
              { icon: <Lock className="w-3.5 h-3.5" />, text: 'Dados criptografados' },
              { icon: <RefreshCw className="w-3.5 h-3.5" />, text: 'Cancele quando quiser' },
            ].map(f => (
              <div key={f.text} className="flex flex-col items-center gap-1 text-ink-tertiary text-center">
                <span className="text-mint-700">{f.icon}</span>
                <span className="text-[10px] font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-0 border border-line rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-bold text-ink font-display">Pagamento</h2>
          <p className="text-sm text-ink-secondary mt-1">Cartão, Apple Pay ou Google Pay.</p>

          <div className="mt-6">
            {error ? (
              <p className="text-xs text-danger-ink font-medium">{error}</p>
            ) : confirmed && subscriptionId ? (
              <WaitingStep subscriptionId={subscriptionId} plan={plan} />
            ) : !clientSecret ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-mint-200 border-t-mint-500 rounded-full animate-spin" />
              </div>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentPanel onConfirmed={() => setConfirmed(true)} />
              </Elements>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
