// src/components/settings/BillingTab.tsx
import React, { useRef, useState } from "react";
import { CreditCard, Calendar, XCircle, Check, Sparkles } from "lucide-react";
import { APP_NAME } from "../../config/app";
import { SettingsSection } from "./shared";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useSubscription } from "../../hooks/useSubscription";
import { PLAN_LABELS, PLAN_CATALOG, FEATURES_BY_PLAN, PlanCode } from "../../config/planCatalog";
import { supabase } from "../../lib/supabase";
import { FEATURES } from "../../config/features";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";

import { useAccountAccess } from "../../hooks/useAccountAccess";
import { useToast } from "../../context/ToastContext";
import { Disclosure } from "../ui/Disclosure";

export const BillingTab: React.FC = () => {
  const { data: subscription, loading, error, refresh } = useSubscription();
  const access = useAccountAccess();
  const { toast } = useToast();
  const cancelInFlight = useRef(false);
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
    if (!subscription || cancelInFlight.current) return;
    cancelInFlight.current = true;
    setCanceling(true);
    setCancelError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Sessão expirada. Entre novamente para continuar.");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-cancel-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ subscription_id: subscription.provider_subscription_id }),
        }
      );
      if (!res.ok) {
        throw new Error("Não foi possível cancelar. Tente novamente ou fale com o suporte.");
      }
      await refresh();
      toast("Cancelamento solicitado. Consulte abaixo o prazo de acesso.", "success");
      setConfirmCancel(false);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Não foi possível cancelar. Verifique sua conexão e tente novamente.");
    } finally {
      cancelInFlight.current = false;
      setCanceling(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection title="Meu plano" description="Detalhes da sua assinatura atual" icon={CreditCard}>
        {loading ? (
          <div className="p-6 text-xs text-ink-secondary">Carregando…</div>
        ) : error ? (
          <div role="alert" className="space-y-3 text-sm text-danger-ink">
            <p>Não foi possível atualizar sua assinatura. Os últimos dados confirmados foram preservados.</p>
            <Button variant="secondary" onClick={() => void refresh()}>Tentar novamente</Button>
          </div>
        ) : !subscription && access.isTrialing ? (
          <div className="rounded-xl border border-mint-200 bg-ice p-5">
            <h4 className="font-semibold text-ink">Teste grátis · {access.daysLeft} {access.daysLeft === 1 ? "dia restante" : "dias restantes"}</h4>
            <p className="mt-2 text-sm text-ink-secondary">Seu teste termina em {access.trialEndsAt?.toLocaleDateString("pt-BR")}.</p>
            <Button className="mt-4" onClick={() => nav("/pricing")}>Ver planos</Button>
          </div>
        ) : !subscription && access.isExpired ? (
          <div className="rounded-xl border border-line p-5">
            <h4 className="font-semibold text-ink">Acesso encerrado</h4>
            <p className="mt-2 text-sm text-ink-secondary">Seus dados continuam salvos. Escolha um plano para retomar o uso.</p>
            <Button className="mt-4" onClick={() => nav("/pricing")}>Ver planos</Button>
          </div>
        ) : !subscription && user?.plan === 'starter' ? (
          <div className="p-6 bg-success-bg border border-success/20 rounded-2xl">
            <h4 className="text-sm font-bold text-success-ink font-display">Plano Starter</h4>
            <p className="text-xs text-success-ink/80 mt-2">Acesso Starter liberado na sua conta. Nenhuma assinatura recorrente foi encontrada.</p>
          </div>
        ) : !subscription && (user?.plan === 'pro' || user?.plan === 'enterprise') ? (
          <div className="p-6 bg-success-bg border border-success/20 rounded-2xl">
            <h4 className="text-sm font-bold text-success-ink font-display">Plano {PLAN_LABELS[user.plan as PlanCode]}</h4>
            <p className="text-xs text-success-ink/80 mt-2">Acesso {PLAN_LABELS[user.plan as PlanCode]} liberado na sua conta. Nenhuma assinatura recorrente foi encontrada.</p>
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
                Plano {PLAN_LABELS[subscription.plan_code]}
              </h4>
              <p className="text-xs text-ink-secondary mt-1">
                R$ {subscription.amount.toFixed(2).replace(".", ",")}/{subscription.billing_cycle === "yearly" ? "ano" : "mês"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
              <Calendar className="w-4 h-4" />
              {subscription.cancel_at_period_end
                ? <>Cancelada. Acesso até <strong>{new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</strong></>
                : <>Próxima cobrança em <strong>{new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</strong></>
              }
            </div>
            {subscription.status === "past_due" && (
              <div className="p-3 bg-warning-bg border border-warning/20 rounded-lg text-xs text-warning-ink">
                Pagamento em atraso. Estamos tentando novamente automaticamente. Se não recuperar até {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}, seu acesso poderá ser suspenso.
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
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

      {!loading && (!subscription || subscription.cancel_at_period_end) && (
        <Disclosure title="Comparar planos" description="Consulte recursos e preços quando precisar.">
        <SettingsSection
          title="Compare os planos"
          description="Faça upgrade quando quiser. Sem fidelidade, cancela a qualquer momento."
          icon={Sparkles}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["starter", "pro", "enterprise"] as PlanCode[]).map((code) => {
              const isCurrent = user?.plan === code;
              return (
                <div
                  key={code}
                  className={`p-4 rounded-2xl border flex flex-col gap-3 ${
                    code === "pro" ? "border-mint-200 bg-ice" : "border-line bg-surface-1"
                  }`}
                >
                  <div>
                    <p className="text-sm font-bold text-ink font-display">{PLAN_LABELS[code]}</p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      <span className="text-lg font-bold text-ink font-display">
                        R$ {PLAN_CATALOG[code].monthly.price.toFixed(2).replace(".", ",")}
                      </span>
                      /mês
                    </p>
                  </div>
                  <ul className="space-y-1.5 flex-1">
                    {FEATURES_BY_PLAN[code].slice(0, 3).map((f) => (
                      <li key={f} className="text-[11px] text-ink-secondary flex items-start gap-1.5">
                        <Check className="w-3 h-3 text-mint-700 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={isCurrent ? "ghost" : code === "pro" ? "primary" : "secondary"}
                    size="sm"
                    disabled={isCurrent}
                    onClick={() => nav("/pricing")}
                  >
                    {isCurrent ? "Plano atual" : "Assinar"}
                  </Button>
                </div>
              );
            })}
          </div>
        </SettingsSection>
        </Disclosure>
      )}

      <Modal open={confirmCancel} onClose={() => { if (!canceling) setConfirmCancel(false); }} closeOnBackdrop={!canceling} closeOnEsc={!canceling} showCloseButton={!canceling} size="sm" title="Cancelar assinatura?"
        description={subscription ? `Você mantém o acesso até ${new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}.` : ""}
        footer={
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="ghost" disabled={canceling} onClick={() => setConfirmCancel(false)}>Voltar</Button>
            <Button onClick={handleCancel} disabled={canceling} isLoading={canceling}>Confirmar cancelamento</Button>
          </div>
        }
      >
        {cancelError && <p role="alert" className="mb-3 text-sm text-danger-ink">{cancelError}</p>}
        <p className="text-xs text-ink-secondary">A cobrança automática será desligada imediatamente. Reative a qualquer momento em Planos.</p>
      </Modal>
    </div>
  );
};
