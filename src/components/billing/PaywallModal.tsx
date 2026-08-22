// src/components/billing/PaywallModal.tsx
import React from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  featureName: string;   // ex: "criar mais ofertas", "conectar outro WhatsApp"
  planSuggestion?: 'starter' | 'pro' | 'enterprise';
}

export const PaywallModal: React.FC<Props> = ({ open, onClose, featureName, planSuggestion = 'starter' }) => {
  const nav = useNavigate();
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Limite do plano atingido"
      description={`Pra ${featureName}, faça upgrade pro plano ${planSuggestion}.`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Agora não</Button>
          <Button onClick={() => nav("/pricing")}>
            <Sparkles className="w-4 h-4 mr-2" />
            Ver planos
          </Button>
        </div>
      }
    >
      <div className="text-sm text-ink-secondary">
        Você atingiu o limite do seu plano atual pra esta ação.
      </div>
    </Modal>
  );
};
