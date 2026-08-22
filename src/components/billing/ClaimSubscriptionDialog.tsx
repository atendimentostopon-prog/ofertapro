// src/components/billing/ClaimSubscriptionDialog.tsx
import React, { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Mail, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ClaimSubscriptionDialog: React.FC<Props> = ({ open, onClose }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | "sent" | "not_found" | "error">(null);

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-claim-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email }),
        }
      );
      const body = await res.json();
      if (!res.ok) { setResult("error"); return; }
      setResult(body.found && body.sent ? "sent" : "not_found");
    } catch {
      setResult("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Reivindicar pagamento"
      description="Digite o email que você usou na Cakto. Vamos enviar um link de confirmação."
      footer={
        result === "sent" ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading || !email}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4 mr-2" />Enviar link</>}
            </Button>
          </div>
        )
      }
    >
      {result === "sent" ? (
        <p className="text-sm text-mint-700">Link enviado. Verifique sua caixa de entrada.</p>
      ) : (
        <>
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            disabled={loading}
          />
          {result === "not_found" && (
            <p className="text-sm text-warning-ink mt-2">Não encontramos pagamento com esse email.</p>
          )}
          {result === "error" && (
            <p className="text-sm text-danger-ink mt-2">Erro ao processar. Tente novamente.</p>
          )}
        </>
      )}
    </Modal>
  );
};
