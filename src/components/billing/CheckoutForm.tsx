import React, { useEffect, useRef, useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { stripePromise } from '../../lib/stripe';
import { supabase } from '../../lib/supabase';
import { getSku, PLAN_LABELS, type PlanCode, type BillingCycle } from '../../config/planCatalog';
import { useSubscription } from '../../hooks/useSubscription';
import { useUser } from '../../context/UserContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface CheckoutFormProps {
  plan: PlanCode;
  cycle: BillingCycle;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentStep: React.FC<{ onConfirmed: () => void; onClose: () => void; onSubmittingChange: (v: boolean) => void }> = ({ onConfirmed, onClose, onSubmittingChange }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    onSubmittingChange(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/settings` },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Não foi possível confirmar o pagamento.');
      setSubmitting(false);
      onSubmittingChange(false);
      return;
    }

    // Sucesso ou pendente (Pix aguardando pagamento) -- os dois casos vão pro
    // step de espera, que casa pelo subscriptionId via Realtime. Não dá pra
    // confiar em "sucesso imediato = já pode fechar": mesmo cartão aprovado
    // na hora ainda depende do webhook invoice.paid criar a linha em
    // subscriptions antes do resto do app reconhecer o plano novo.
    onSubmittingChange(false);
    onConfirmed();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-xs text-danger-ink font-medium">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? 'Processando…' : 'Confirmar assinatura'}
        </Button>
      </div>
    </form>
  );
};

const WaitingStep: React.FC<{ subscriptionId: string; plan: PlanCode; onSuccess: () => void; onClose: () => void }> = ({
  subscriptionId, plan, onSuccess, onClose,
}) => {
  const { data: subscription } = useSubscription();
  const { refreshProfile } = useUser();
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
      <div className="flex flex-col items-center gap-3 py-4">
        <CheckCircle className="w-12 h-12 text-mint-500" />
        <p className="text-sm text-ink-secondary text-center">
          Seu plano <strong className="text-ink">{PLAN_LABELS[plan]}</strong> está ativo.
        </p>
        <Button onClick={onSuccess}>Fechar</Button>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <AlertCircle className="w-12 h-12 text-warning" />
        <p className="text-sm text-ink-secondary text-center">
          Isso está demorando mais que o esperado. Se você concluiu o pagamento (inclusive via Pix), aguarde mais um pouco ou fale com o suporte -- ele não vai duplicar a cobrança.
        </p>
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <Loader2 className="w-10 h-10 text-mint-500 animate-spin" />
      <p className="text-sm text-ink-secondary text-center">
        Confirmando seu pagamento…<br />
        Se escolheu Pix, finalize no seu banco -- a atualização acontece automaticamente aqui.
      </p>
    </div>
  );
};

export const CheckoutForm: React.FC<CheckoutFormProps> = ({ plan, cycle, open, onClose, onSuccess }) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setSubscriptionId(null);
      setConfirmed(false);
      setError(null);
      setSubmitting(false);
      return;
    }
    const sku = getSku(plan, cycle);
    supabase.functions
      .invoke('stripe-create-subscription', {
        body: { plan_code: plan, billing_cycle: cycle, price_id: sku.stripePriceId },
      })
      .then(({ data, error: invokeError }) => {
        if (invokeError || !data?.clientSecret || !data?.subscriptionId) {
          setError('Não foi possível iniciar o checkout. Tente novamente.');
          return;
        }
        setClientSecret(data.clientSecret);
        setSubscriptionId(data.subscriptionId);
      });
  }, [open, plan, cycle]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assinar ${PLAN_LABELS[plan]}`}
      description="Pagamento por cartão ou Pix."
      size="md"
      closeOnBackdrop={!submitting}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
    >
      {error && <p className="text-xs text-danger-ink font-medium mb-3">{error}</p>}
      {confirmed && subscriptionId ? (
        <WaitingStep subscriptionId={subscriptionId} plan={plan} onSuccess={onSuccess} onClose={onClose} />
      ) : !clientSecret ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-mint-200 border-t-mint-500 rounded-full animate-spin" />
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentStep onConfirmed={() => setConfirmed(true)} onClose={onClose} onSubmittingChange={setSubmitting} />
        </Elements>
      )}
    </Modal>
  );
};
