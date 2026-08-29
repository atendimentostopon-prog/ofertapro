// src/pages/Pricing.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLAN_CATALOG, PLAN_LABELS, FEATURES_BY_PLAN, type PlanCode } from "../config/planCatalog";
import { useSubscription } from "../hooks/useSubscription";
import { useUser } from "../context/UserContext";

const PLAN_ORDER: PlanCode[] = ["starter", "pro", "enterprise"];

const PLAN_HIGHLIGHT: PlanCode = "pro";

export default function Pricing() {
  const { data: currentSub } = useSubscription();
  const { user } = useUser();
  const nav = useNavigate();

  const handleAssinar = (plan: PlanCode) => {
    nav(`/checkout?plan=${plan}`);
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      {user?.plan === 'starter' && !currentSub && (
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
          const isGrandfathered = plan === 'starter' && user?.plan === 'starter' && !currentSub;
          // Ainda não existe fluxo de troca de plano com proração -- enquanto isso,
          // qualquer assinatura ativa (em QUALQUER plano) bloqueia a criação de
          // uma segunda assinatura na Cakto. Sem isso, "Assinar" em outro plano
          // criava uma subscription paralela e cobrava o cliente duas vezes.
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
                className="mt-6 w-full"
                variant={isHighlighted ? "primary" : "secondary"}
                onClick={() => (blockedByActiveSub ? nav("/settings?tab=billing") : handleAssinar(plan))}
                disabled={!isAvailable || isCurrent || isGrandfathered}
              >
                {!isAvailable
                  ? "Em breve"
                  : isCurrent
                  ? "Plano atual"
                  : isGrandfathered
                  ? "Já ativo (cortesia)"
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
