// src/components/billing/CheckoutWaitingDialog.tsx
import React, { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useSubscription } from "../../hooks/useSubscription";
import { useCheckoutIntent } from "../../hooks/useCheckoutIntent";

interface Props {
  open: boolean;
  onClose: () => void;
  onNeedsClaim: () => void;
}

export const CheckoutWaitingDialog: React.FC<Props> = ({ open, onClose, onNeedsClaim }) => {
  const { data: subscription } = useSubscription();
  const { intent, clearIntent } = useCheckoutIntent();
  const [timedOut, setTimedOut] = useState(false);

  // detectar sucesso: subscription apareceu com plan igual ao intent, criada depois de intent.openedAt
  const success = !!(
    open && intent && subscription &&
    subscription.plan_code === intent.planCode &&
    new Date(subscription.current_period_start).getTime() > intent.openedAt - 60_000
  );

  useEffect(() => {
    if (!open || success) return;
    const t = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(t);
  }, [open, success]);

  useEffect(() => {
    if (success) clearIntent();
  }, [success, clearIntent]);

  return (
    <Modal open={open} onClose={onClose} size="sm" showCloseButton={success || timedOut}
      title={success ? "Assinatura ativa" : timedOut ? "Não conseguimos identificar seu pagamento" : "Aguardando confirmação"}
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <CheckCircle className="w-12 h-12 text-emerald-400" />
          <p className="text-sm text-slate-300 text-center">
            Seu plano <strong>{subscription?.plan_code}</strong> está ativo.
          </p>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      ) : timedOut ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <AlertCircle className="w-12 h-12 text-amber-400" />
          <p className="text-sm text-slate-300 text-center">
            Seu pagamento pode ter sido concluído com um email diferente do cadastrado. Clique abaixo pra reivindicar.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={onNeedsClaim}>Reivindicar pagamento</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-10 h-10 text-brand-400 animate-spin" />
          <p className="text-sm text-slate-300 text-center">
            Finalize o pagamento na aba que abrimos.<br />
            Você pode fechar esta janela — a atualização acontece automaticamente.
          </p>
        </div>
      )}
    </Modal>
  );
};
