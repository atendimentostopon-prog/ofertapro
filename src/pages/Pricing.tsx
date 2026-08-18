// src/pages/Pricing.tsx
import React, { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLAN_CATALOG, type PlanCode, type BillingCycle } from "../config/planCatalog";
import { CheckoutRedirectDialog } from "../components/billing/CheckoutRedirectDialog";
import { CheckoutWaitingDialog } from "../components/billing/CheckoutWaitingDialog";
import { ClaimSubscriptionDialog } from "../components/billing/ClaimSubscriptionDialog";
import { useSubscription } from "../hooks/useSubscription";

const PLAN_ORDER: PlanCode[] = ["starter", "pro", "enterprise"];

const FEATURES_BY_PLAN: Record<PlanCode, string[]> = {
  starter: ["Até 100 ofertas ativas", "2 WhatsApp + 1 Telegram", "10 grupos de origem", "Analytics básico"],
  pro: ["Ofertas ilimitadas", "5 WhatsApp + 3 Telegram", "30 grupos de origem", "Analytics avançado", "Agendamento futuro", "Templates custom", "Sem branding"],
  enterprise: ["Ofertas ilimitadas", "WhatsApp e Telegram sem limite", "Grupos ilimitados", "Prioridade no suporte", "Tudo do PRO"],
};

export default function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanCode | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const { data: currentSub } = useSubscription();

  const handleAssinar = (plan: PlanCode) => setSelectedPlan(plan);
  const closeRedirect = () => setSelectedPlan(null);
  const onRedirected = () => { closeRedirect(); setShowWaiting(true); };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <h1 className="text-display font-bold text-white text-center">Planos</h1>
      <p className="text-body text-slate-400 text-center mt-2">
        Escolha o plano ideal pro seu volume de ofertas e canais.
      </p>

      <div className="flex justify-center mt-8">
        <div className="inline-flex bg-surface-2 border border-white/5 rounded-xl p-1">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-4 py-2 rounded-lg text-caption font-semibold ${cycle === "monthly" ? "bg-brand-500 text-white" : "text-slate-400"}`}
          >Mensal</button>
          <button
            onClick={() => setCycle("yearly")}
            className={`px-4 py-2 rounded-lg text-caption font-semibold ${cycle === "yearly" ? "bg-brand-500 text-white" : "text-slate-400"}`}
          >Anual <span className="text-emerald-400 ml-1">−17%</span></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        {PLAN_ORDER.map(plan => {
          const sku = PLAN_CATALOG[plan][cycle];
          const isCurrent = currentSub?.plan_code === plan && currentSub?.billing_cycle === cycle;
          return (
            <div key={plan} className="bg-surface-2 border border-white/5 rounded-2xl p-6 flex flex-col">
              <h3 className="text-h2 font-bold text-white capitalize">{plan}</h3>
              <div className="mt-4">
                <span className="text-display font-bold text-white">R$ {sku.price.toFixed(2).replace(".", ",")}</span>
                <span className="text-caption text-slate-400 ml-1">/{cycle === "monthly" ? "mês" : "ano"}</span>
              </div>
              <ul className="mt-6 space-y-2 flex-1">
                {FEATURES_BY_PLAN[plan].map(f => (
                  <li key={f} className="flex items-start gap-2 text-caption text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                onClick={() => handleAssinar(plan)}
                disabled={isCurrent}
              >
                {isCurrent ? "Plano atual" : "Assinar"}
              </Button>
            </div>
          );
        })}
      </div>

      {selectedPlan && (
        <CheckoutRedirectDialog
          open
          plan={selectedPlan}
          cycle={cycle}
          onClose={closeRedirect}
          onOpened={onRedirected}
        />
      )}
      <CheckoutWaitingDialog
        open={showWaiting}
        onClose={() => setShowWaiting(false)}
        onNeedsClaim={() => { setShowWaiting(false); setShowClaim(true); }}
      />
      <ClaimSubscriptionDialog open={showClaim} onClose={() => setShowClaim(false)} />
    </div>
  );
}
