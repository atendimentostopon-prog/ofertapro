// src/pages/Instagram.tsx
import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Plus } from 'lucide-react';
import { AutomationList } from '../components/instagram/AutomationList';
import { ConnectCard } from '../components/instagram/ConnectCard';
import { GuideCard } from '../components/instagram/GuideCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { getPlanLimits } from '../config/plans';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import { useInstagram } from '../hooks/useInstagram';
import type { IgAutomation } from '../types/instagram';

const CONNECT_ERRORS: Record<string, string> = {
  denied: 'Você cancelou a conexão com o Instagram.',
  invalid_state: 'A conexão expirou. Tente conectar de novo.',
  exchange_failed: 'O Instagram recusou a conexão. Tente de novo.',
  profile_failed: 'Não conseguimos ler o perfil do Instagram. Tente de novo.',
  plan_not_allowed: 'Seu plano não inclui automações de Instagram.',
  account_in_use: 'Essa conta do Instagram já está conectada a outro usuário.',
  account_limit: 'Você atingiu o limite de contas do seu plano.',
  invalid_pending: 'A conexão não pertence a esta sessão. Tente conectar de novo.',
  expired: 'A conexão expirou. Tente conectar de novo.',
  webhook_failed: 'Conectamos, mas não conseguimos ativar o recebimento de comentários. Tente reconectar.',
  save_failed: 'Não conseguimos salvar a conexão. Tente de novo.',
  invalid_request: 'Resposta inesperada do Instagram. Tente de novo.',
};

const errorMessage = (e: unknown, fallback: string): string => {
  const msg = (e as { message?: string } | null)?.message;
  return msg || fallback;
};

const Instagram: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();
  const [params, setParams] = useSearchParams();
  const {
    accounts, automations, loading, error, refresh,
    startConnect, completeConnect, disconnect, setStatus, remove,
  } = useInstagram();
  const handledRedirect = useRef(false);

  const limits = getPlanLimits(user?.plan ?? 'free');

  useEffect(() => {
    // Roda uma única vez por carga de página (StrictMode monta o efeito duas vezes).
    if (handledRedirect.current) return;
    handledRedirect.current = true;

    const pendingId = params.get('ig_pending');
    const connected = params.get('connected');
    const err = params.get('ig_error');

    // Remove os parâmetros da URL antes de qualquer await: o id pendente não fica no histórico.
    if (pendingId || connected || err) setParams({}, { replace: true });

    if (connected) {
      toast('Instagram conectado.', 'success');
      void refresh();
    }
    if (err) toast(CONNECT_ERRORS[err] ?? 'Não foi possível conectar o Instagram.', 'error');

    if (pendingId) {
      void (async () => {
        try {
          await completeConnect(pendingId);
          toast('Instagram conectado.', 'success');
        } catch (e) {
          const code = (e as { code?: string } | null)?.code;
          toast((code && CONNECT_ERRORS[code]) || 'Não foi possível concluir a conexão com o Instagram.', 'error');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!limits.allowInstagram) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 animate-slide-up">
        <PageHeader title="Instagram" description="Responda comentários com DM automática." />
        <EmptyState
          icon={MessageCircle}
          title="Automações de Instagram"
          description="Seu plano atual não inclui este recurso. Faça upgrade para responder comentários por DM automaticamente."
          actionText="Ver planos"
          onAction={() => navigate('/pricing')}
        />
      </div>
    );
  }

  const handleConnect = async () => {
    try {
      window.location.href = await startConnect();
    } catch {
      toast('Não foi possível iniciar a conexão. Tente de novo.', 'error');
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!window.confirm('Desconectar o Instagram? As automações dessa conta serão pausadas.')) return;
    try {
      await disconnect(accountId);
      toast('Instagram desconectado.', 'success');
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível desconectar.'), 'error');
    }
  };

  const handleToggle = async (a: IgAutomation, active: boolean) => {
    try {
      await setStatus(a.id, active ? 'active' : 'paused');
    } catch (e) {
      // Mensagens dos triggers do banco (limite de plano, sem acesso) chegam em .message
      toast(errorMessage(e, 'Não foi possível alterar o status.'), 'error');
      await refresh();
    }
  };

  const handleDelete = async (a: IgAutomation) => {
    if (!window.confirm(`Excluir a automação "${a.name}"?`)) return;
    try {
      await remove(a.id);
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível excluir.'), 'error');
    }
  };

  const canConnectMore = accounts.length < limits.maxIgAccounts;
  const canCreate = accounts.some((a) => a.status === 'connected');

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 animate-slide-up">
      <PageHeader title="Instagram" description="Quem comenta a palavra-chave recebe sua mensagem por DM.">
        {canCreate && (
          <Button icon={Plus} onClick={() => navigate('/instagram/automacoes/nova')}>
            Nova automação
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : (
        <>
          <GuideCard
            defaultOpen={accounts.length === 0}
            limits={{ maxIgAccounts: limits.maxIgAccounts, maxIgAutomations: limits.maxIgAutomations, maxIgDmsMonth: limits.maxIgDmsMonth }}
          />
          <ConnectCard
            accounts={accounts}
            canConnectMore={canConnectMore}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
          {automations.length === 0 ? (
            canCreate && (
              <EmptyState
                icon={MessageCircle}
                compact
                title="Nenhuma automação ainda"
                description="Crie a primeira: escolha um post, defina a palavra-chave e escreva a DM."
                actionText="Criar automação"
                onAction={() => navigate('/instagram/automacoes/nova')}
              />
            )
          ) : (
            <AutomationList automations={automations} onToggle={handleToggle} onDelete={handleDelete} />
          )}
        </>
      )}
    </div>
  );
};

export default Instagram;
