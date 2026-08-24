// src/pages/Pricing.tsx
import React, { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLAN_CATALOG, PLAN_LABELS, type PlanCode, type BillingCycle } from "../config/planCatalog";
import { CheckoutForm } from "../components/billing/CheckoutForm";
import { useSubscription } from "../hooks/useSubscription";
import { useUser } from "../context/UserContext";

const PLAN_ORDER: PlanCode[] = ["starter", "pro", "enterprise"];

const PLAN_HIGHLIGHT: PlanCode = "pro";

const FEATURES_BY_PLAN: Record<PlanCode, string[]> = {
  starter: [
    "Monitora até 5 grupos de origem",
    "Até 3 conexões WhatsApp",
    "Até 2 conexões Telegram",
    "Até 20.000 ofertas ativas",
    "Disparo em massa + agendamento",
    "Analytics avançado",
    "Shopee, Amazon, Mercado Livre",
  ],
  pro: [
    "Monitora até 30 grupos de origem",
    "Até 5 conexões WhatsApp",
    "Até 3 conexões Telegram",
    "Ofertas ilimitadas",
    "Templates de mensagem customizados",
    "Remove a marca Aflyo da vitrine",
    "Tudo do Starter",
  ],
  enterprise: [
    "Grupos de origem ilimitados",
    "WhatsApp e Telegram ilimitados",
    "Ofertas ilimitadas",
    "Templates de mensagem customizados",
    "Remove a marca Aflyo da vitrine",
    "Tudo do Profissional",
  ],
};

export default function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<PlanCode | null>(null);
  const { data: currentSub } = useSubscription();
  const { user } = useUser();

  const handleAssinar = (plan: PlanCode) => {
    setCheckoutPlan(plan);
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

      <div className="flex justify-center mt-8">
        <div className="inline-flex bg-surface-1 border border-line rounded-xl p-1">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${cycle === "monthly" ? "bg-graphite text-ink-inverse shadow-sm" : "text-ink-tertiary hover:text-ink-secondary"}`}
          >Mensal</button>
          <button
            onClick={() => setCycle("yearly")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${cycle === "yearly" ? "bg-graphite text-ink-inverse shadow-sm" : "text-ink-tertiary hover:text-ink-secondary"}`}
          >Anual <span className="text-mint-600 ml-1">−17%</span></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 items-stretch">
        {PLAN_ORDER.map(plan => {
          const sku = PLAN_CATALOG[plan][cycle];
          const isHighlighted = plan === PLAN_HIGHLIGHT;
          const isAvailable = true; // Todos os planos têm stripePriceId válido
          const isCurrent = currentSub?.plan_code === plan && currentSub?.billing_cycle === cycle;
          const isGrandfathered = plan === 'starter' && user?.plan === 'starter' && !currentSub;
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
                    <span className="text-xs text-ink-tertiary ml-1">/{cycle === "monthly" ? "mês" : "ano"}</span>
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
                onClick={() => handleAssinar(plan)}
                disabled={!isAvailable || isCurrent || isGrandfathered}
              >
                {!isAvailable ? "Em breve" : isCurrent ? "Plano atual" : isGrandfathered ? "Já ativo (cortesia)" : "Assinar"}
              </Button>
            </div>
          );
        })}
      </div>

      {checkoutPlan && (
        <CheckoutForm
          plan={checkoutPlan}
          cycle={cycle}
          open={!!checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => {
            setCheckoutPlan(null);
            // useSubscription via Realtime detecta a mudança quando o webhook confirmar
          }}
        />
      )}
    </div>
  );
}
