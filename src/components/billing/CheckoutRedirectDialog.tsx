// src/components/billing/CheckoutRedirectDialog.tsx
import React from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { ExternalLink } from "lucide-react";
import { getSku, type PlanCode, type BillingCycle } from "../../config/planCatalog";
import { useCheckoutIntent } from "../../hooks/useCheckoutIntent";
import { useUser } from "../../context/UserContext";

interface Props {
  open: boolean;
  plan: PlanCode;
  cycle: BillingCycle;
  onClose: () => void;
  onOpened: () => void;
}

export const CheckoutRedirectDialog: React.FC<Props> = ({ open, plan, cycle, onClose, onOpened }) => {
  const { user } = useUser();
  const { setIntent } = useCheckoutIntent();
  const sku = getSku(plan, cycle);

  const handleContinue = () => {
    setIntent({ planCode: plan, cycle, openedAt: Date.now() });
    const emailParam = user?.email ? `?email=${encodeURIComponent(user.email)}` : "";
    window.open(`${sku.checkoutUrl}${emailParam}`, "_blank", "noopener");
    onOpened();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Você será redirecionado pra Cakto"
      description="A finalização do pagamento acontece no site do nosso provedor. Volte pra cá quando terminar — vamos atualizar sua conta automaticamente."
      size="sm"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleContinue}>
            Continuar pagamento
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      }
    >
      <div className="text-sm text-slate-300">
        Plano <strong>{plan}</strong> — cobrança {cycle === "monthly" ? "mensal" : "anual"} de <strong>R$ {sku.price.toFixed(2).replace(".", ",")}</strong>.
      </div>
    </Modal>
  );
};
