// src/components/settings/BillingTab.tsx
import React, { useState } from "react";
import { CreditCard, Calendar, XCircle } from "lucide-react";
import { APP_NAME } from "../../config/app";
import { SettingsSection } from "./shared";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useSubscription } from "../../hooks/useSubscription";
import { PLAN_LABELS } from "../../config/planCatalog";
import { supabase } from "../../lib/supabase";
import { FEATURES } from "../../config/features";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";

export const BillingTab: React.FC = () => {
  const { data: subscription, loading } = useSubscription();
  const { user } = useUser();
  const nav = useNavigate();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Beta gratuito (fallback quando billing off)
  if (!FEATURES.billing) {
    return (
      <div className="space-y-6">
        <SettingsSection title="Planos & Cobrança" description={`Status do seu plano de faturamento no ${APP_NAME}`} icon={CreditCard}>
          <div className="p-6 bg-ice border border-mint-200 rounded-2xl">
            <h4 className="text-sm font-bold text-ink font-display">Plano Beta Gratuito Ativo</h4>
            <p className="text-xs text-ink-secondary mt-2">
              O {APP_NAME} está em beta e todos os recursos PRO estão liberados. Cobrança começa na próxima atualização.
            </p>
          </div>
        </SettingsSection>
      </div>
    );
  }

  const handleCancel = async () => {
    if (!subscription) return;
    setCanceling(true);
    setCancelError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-cancel-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ subscription_id: subscription.cakto_subscription_id }),
        }
      );
      if (!res.ok) {
        setCancelError("Erro ao cancelar. Tente novamente ou entre em contato com o suporte.");
      }
    } finally {
      setCanceling(false);
      setConfirmCancel(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection title="Meu plano" description="Detalhes da sua assinatura atual" icon={CreditCard}>
        {loading ? (
          <div className="p-6 text-xs text-ink-secondary">Carregando…</div>
        ) : !subscription && user?.plan === 'starter' ? (
          <div className="p-6 bg-success-bg border border-success/20 rounded-2xl">
            <h4 className="text-sm font-bold text-success-ink font-display">Plano Starter — cortesia</h4>
            <p className="text-xs text-success-ink/80 mt-2">Você usa o {APP_NAME} por cortesia como usuário fundador. Uso vitalício, sem cobrança.</p>
          </div>
        ) : !subscription ? (
          <div className="p-6 bg-surface-1 border border-line rounded-2xl">
            <h4 className="text-sm font-bold text-ink font-display">Sem plano ativo</h4>
            <p className="text-xs text-ink-secondary mt-2">Escolha um plano para desbloquear o acesso ao {APP_NAME}.</p>
            <Button className="mt-4" onClick={() => nav("/pricing")}>Ver planos</Button>
          </div>
        ) : (
          <div className="p-6 bg-surface-1 border border-line rounded-2xl space-y-4">
            <div>
              <h4 className="text-sm font-bold text-ink font-display">
                Plano {PLAN_LABELS[subscription.plan_code]} ({subscription.billing_cycle === "monthly" ? "mensal" : "anual"})
              </h4>
              <p className="text-xs text-ink-secondary mt-1">
                R$ {subscription.amount.toFixed(2).replace(".", ",")}/{subscription.billing_cycle === "monthly" ? "mês" : "ano"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-secondary">
              <Calendar className="w-4 h-4" />
              {subscription.cancel_at_period_end
                ? <>Cancelada — acesso até <strong>{new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</strong></>
                : <>Próxima cobrança em <strong>{new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</strong></>
              }
            </div>
            {subscription.status === "past_due" && (
              <div className="p-3 bg-warning-bg border border-warning/20 rounded-lg text-xs text-warning-ink">
                Pagamento em atraso. Cakto está retentando. Se não recuperar até {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}, seu plano cai pra free.
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => nav("/pricing")}>Trocar plano</Button>
              {!subscription.cancel_at_period_end && (
                <Button variant="ghost" onClick={() => { setCancelError(null); setConfirmCancel(true); }} className="text-danger-ink hover:text-danger">
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancelar assinatura
                </Button>
              )}
            </div>
            {cancelError && (
              <div className="mt-3 text-xs text-danger-ink">{cancelError}</div>
            )}
          </div>
        )}
      </SettingsSection>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} size="sm" title="Cancelar assinatura?"
        description={subscription ? `Você mantém o acesso até ${new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}.` : ""}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Voltar</Button>
            <Button onClick={handleCancel} disabled={canceling}>Confirmar cancelamento</Button>
          </div>
        }
      >
        <p className="text-xs text-ink-secondary">A cobrança automática será desligada imediatamente. Reative a qualquer momento em Planos.</p>
      </Modal>
    </div>
  );
};
