// src/pages/Pricing.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLAN_CATALOG, PLAN_LABELS, FEATURES_BY_PLAN, type PlanCode } from "../config/planCatalog";
import { useSubscription } from "../hooks/useSubscription";
import { useUser } from "../context/UserContext";
import { useAccountAccess } from "../hooks/useAccountAccess";

const PLAN_ORDER: PlanCode[] = ["starter", "pro", "enterprise"];

const PLAN_HIGHLIGHT: PlanCode = "pro";

export default function Pricing() {
  const { data: currentSub } = useSubscription();
  const { user } = useUser();
  const access = useAccountAccess();
  const nav = useNavigate();

  const handleAssinar = (plan: PlanCode) => {
    nav(`/checkout?plan=${plan}`);
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      {/* Banner de Teste Grátis Ativo (7 dias) */}
      {access.isTrialing && (
        <div className="mb-8 mx-auto max-w-3xl p-5 rounded-2xl bg-ice border border-mint-200 text-mint-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-slide-up">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-mint-500 text-graphite rounded-full">
                Teste Grátis Ativo
              </span>
              <span className="text-sm font-bold text-ink">
                Você tem {access.daysLeft} {access.daysLeft === 1 ? 'dia restante' : 'dias restantes'} de teste no Plano Starter.
              </span>
            </div>
            <p className="text-xs text-mint-800 mt-1">
              Todos os recursos do Starter estão liberados para você. A conta só será bloqueada após os 7 dias.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => nav('/dashboard')} className="flex-shrink-0 cursor-pointer">
            Acessar Painel →
          </Button>
        </div>
      )}

      {/* Banner de Teste Expirado */}
      {access.isExpired && !currentSub && (
        <div className="mb-8 mx-auto max-w-3xl p-5 rounded-2xl bg-warning-bg border border-warning/30 text-warning-ink shadow-sm animate-slide-up">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-warning text-white rounded-full">
              Período de Teste Finalizado
            </span>
            <span className="text-sm font-bold">Seu teste de 7 dias encerrou.</span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Escolha um dos planos abaixo para reativar seu acesso e continuar enviando suas ofertas automaticamente.
          </p>
        </div>
      )}

      {/* Usuário Fundador / Cortesia Vitalícia */}
      {!access.isTrialing && !access.isExpired && user?.plan === 'starter' && !currentSub && (
        <div className="mb-6 mx-auto max-w-3xl p-4 rounded-2xl bg-ice border border-mint-200 text-mint-800">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Você já usa o Aflyo Starter por cortesia.</span>
          </div>
          <p className="text-xs text-mint-700 mt-1">Como usuário fundador, seu acesso é vitalício e não precisa de assinatura.</p>
        </div>
      )}

      <h1 className="text-3xl md:text-4xl font-bold text-ink text-center font-display">Planos</h1>
      <p className="text-base text-ink-secondary text-center mt-2">
        Escolha o plano ideal pro seu volume de ofertas e canais.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 items-stretch">
        {PLAN_ORDER.map(plan => {
          const sku = PLAN_CATALOG[plan].monthly;
          const isHighlighted = plan === PLAN_HIGHLIGHT;
          const isAvailable = Boolean(sku.caktoOfferId?.trim());
          const isCurrent = currentSub?.plan_code === plan;
          const isGrandfathered = !access.isTrialing && !access.isExpired && plan === 'starter' && user?.plan === 'starter' && !currentSub;
          
          // Se estiver em trial, o Starter é o plano do teste
          const isTrialCurrent = access.isTrialing && plan === 'starter';
          
          const blockedByActiveSub = Boolean(currentSub) && !isCurrent;
          return (
            <div
              key={plan}
              className={`relative rounded-2xl p-6 flex flex-col ${
                isHighlighted
                  ? "bg-surface-0 border-2 border-mint-400 shadow-lg"
                  : "bg-surface-0 border border-line shadow-card"
              }`}
            >
              {isHighlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-mint-500 text-graphite text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">
                  <Sparkles className="w-3 h-3" />
                  Mais popular
                </span>
              )}
              <h3 className="text-lg font-bold text-ink font-display">{PLAN_LABELS[plan]}</h3>
              <div className="mt-4">
                {isAvailable ? (
                  <>
                    <span className="text-3xl font-bold text-ink font-display">R$ {sku.price.toFixed(2).replace(".", ",")}</span>
                    <span className="text-xs text-ink-tertiary ml-1">/mês</span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-ink-tertiary">Em breve</span>
                )}
              </div>
              <ul className="mt-6 space-y-2 flex-1">
                {FEATURES_BY_PLAN[plan].map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs text-ink-secondary">
                    <Check className="w-4 h-4 text-mint-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full cursor-pointer"
                variant={isHighlighted ? "primary" : "secondary"}
                onClick={() => {
                  if (blockedByActiveSub) {
                    nav("/settings?tab=billing");
                    return;
                  }
                  if (isTrialCurrent) {
                    nav("/dashboard");
                    return;
                  }
                  handleAssinar(plan);
                }}
                disabled={!isAvailable || isCurrent || isGrandfathered}
              >
                {!isAvailable
                  ? "Em breve"
                  : isCurrent
                  ? "Plano atual"
                  : isGrandfathered
                  ? "Já ativo (cortesia)"
                  : isTrialCurrent
                  ? "Em teste (Ir ao Painel)"
                  : blockedByActiveSub
                  ? "Gerencie em Configurações"
                  : "Assinar"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
