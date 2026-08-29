import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';
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
import CaktoPaymentPanel from '../components/checkout/CaktoPaymentPanel';

const VALID_PLANS: PlanCode[] = ['starter', 'pro', 'enterprise'];

const PLAN_COPY: Record<PlanCode, { eyebrow: string; headline: string; subline: string }> = {
  starter: {
    eyebrow: 'Plano Starter',
    headline: 'Comece a vigiar seus grupos.',
    subline: 'Monitoramento essencial pra não deixar nenhuma oferta boa passar batido.',
  },
  pro: {
    eyebrow: 'Plano Profissional',
    headline: 'Bora ligar seu radar.',
    subline: 'A gente vigia os grupos. Você só dispara o que vale a pena.',
  },
  enterprise: {
    eyebrow: 'Plano Business',
    headline: 'Escala sem limite.',
    subline: 'Grupos, canais e disparos ilimitados pra sua operação virar máquina.',
  },
};

function money(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

const WaitingStep: React.FC<{ plan: PlanCode }> = ({ plan }) => {
  const { data: subscription } = useSubscription();
  const { refreshProfile } = useUser();
  const nav = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const refreshedRef = useRef(false);

  // Não dá pra casar por subscriptionId aqui -- a Cakto só confirma a
  // assinatura depois que o pagamento aprova (cartão pode levar alguns
  // segundos), então nunca temos o ID de antemão. useSubscription() retorna a
  // assinatura active/past_due mais recente do usuário, então plan_code +
  // status já identifica com segurança a que acabou de ser criada.
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
  // O ciclo vem da tela de Planos (query param). Nao ha toggle no checkout: pra
  // trocar mensal/anual o usuario volta pra /pricing. Isso mantem o
  // CaktoPaymentPanel montado uma vez so, com as parcelas ja certas pro ciclo.
  const cycle = (searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly') as BillingCycle;
  const plan = VALID_PLANS.includes(planParam as PlanCode) ? (planParam as PlanCode) : null;

  const [confirmedLocally, setConfirmedLocally] = useState(false);

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
  }, [userLoading, user, plan, nav]);

  if (!plan) return null;

  const sku = getSku(plan, cycle);
  const copy = PLAN_COPY[plan];

  const nextBillingLabel = (() => {
    const d = new Date();
    if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  })();

  const showWaiting = confirmedLocally;

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[1180px] grid grid-cols-1 md:grid-cols-[1.08fr_1fr] bg-surface-0 rounded-[28px] overflow-hidden shadow-xl">

        {/* ================= PAINEL ESQUERDO -- resumo do plano ================= */}
        <section
          className="relative flex flex-col items-center text-center px-6 sm:px-10 py-8 sm:py-12 overflow-hidden isolate text-ink-inverse"
          style={{
            background:
              'radial-gradient(120% 90% at 50% -10%, rgba(94,231,165,0.16), transparent 55%), radial-gradient(90% 70% at 50% 115%, rgba(94,231,165,0.10), transparent 60%), linear-gradient(165deg, #101418 0%, #090c0f 100%)',
          }}
          aria-label="Resumo do plano"
        >
          <div
            className="absolute w-[620px] h-[620px] left-1/2 top-[4%] -ml-[140px] rounded-full pointer-events-none z-0"
            style={{ background: 'radial-gradient(circle, rgba(94,231,165,0.30) 0%, rgba(94,231,165,0.08) 45%, transparent 70%)', filter: 'blur(10px)' }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex items-center gap-2 font-display font-semibold text-[1.05rem] tracking-tight">
            <img src="/brand/symbol-mint.png" alt="" className="w-[22px] h-[22px]" draggable={false} />
            {APP_NAME}
          </div>

          <button
            onClick={() => nav('/pricing')}
            className="relative z-10 mt-[22px] inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-ink-inverse transition-colors cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Voltar aos planos
          </button>

          <div className="relative z-10 mt-10 inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-mint-400">
            <span className="w-1.5 h-1.5 rounded-full bg-mint-400 shadow-[0_0_0_3px_rgba(94,231,165,0.22)]" />
            {copy.eyebrow}
          </div>
          <h1 className="relative z-10 mt-3.5 text-[clamp(1.75rem,2.6vw+0.7rem,2.5rem)] font-semibold leading-[1.08] tracking-tight font-display text-balance text-ink-inverse">
            {copy.headline}
          </h1>
          <p className="relative z-10 mt-3 max-w-[34ch] text-[0.9375rem] leading-relaxed text-white/70">
            {copy.subline}
          </p>

          <div className="relative z-10 mt-8 sm:mt-12 flex flex-col items-center justify-center">
            <div className="flex items-end gap-2.5">
              <span className="font-display text-2xl font-semibold text-mint-400 pb-2.5">R$</span>
              <span className="font-display text-[clamp(3rem,5vw+1rem,4.25rem)] font-bold tracking-tight leading-[0.95] bg-gradient-to-b from-white to-ice bg-clip-text text-transparent">
                {Number.isInteger(sku.price) ? sku.price : sku.price.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-[0.9375rem] text-white/70 pb-3.5">/{cycle === 'monthly' ? 'mês' : 'ano'}</span>
            </div>
            {cycle === 'yearly' && (
              <span className="mt-3 inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-mint-400">
                <span className="w-1.5 h-1.5 rounded-full bg-mint-400" />
                Plano anual com 17% de desconto
              </span>
            )}
          </div>

          <div className="relative z-10 mt-7 sm:mt-10 max-w-[340px] w-full border-t border-mint-400/15 pt-[22px] text-left">
            <div className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-white/40 mb-3.5">O que vem junto</div>
            <ul className="grid gap-2.5 list-none m-0 p-0 mb-5">
              {FEATURES_BY_PLAN[plan].slice(0, 4).map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-white/70 leading-snug">
                  <Check className="w-[15px] h-[15px] text-mint-400 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between pt-[18px] border-t border-mint-400/15">
              <span className="text-[0.8125rem] text-white/70">Total hoje</span>
              <span className="font-display text-[1.375rem] font-semibold">{money(sku.price)}</span>
            </div>
            <div className="mt-2 text-xs text-white/40">
              Renova dia {nextBillingLabel}. Cancela quando quiser, sem pegadinha.
            </div>
          </div>
        </section>

        {/* ================= PAINEL DIREITO -- pagamento ================= */}
        <section className="flex flex-col px-6 sm:px-10 py-8 sm:py-12" aria-label="Pagamento">
          {showWaiting ? (
            <>
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-graphite text-ink-inverse flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-ink font-display leading-tight">Pagamento</h2>
                  <p className="text-xs text-ink-secondary">Só mais um instante</p>
                </div>
              </div>
              <div className="mt-6">
                <WaitingStep plan={plan} />
              </div>
            </>
          ) : (
            <CaktoPaymentPanel
              plan={plan}
              cycle={cycle}
              price={sku.price}
              onSuccess={() => setConfirmedLocally(true)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
