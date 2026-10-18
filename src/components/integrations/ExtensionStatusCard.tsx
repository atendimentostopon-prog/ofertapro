import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2, PlugZap, RefreshCw, Puzzle } from 'lucide-react';
import { useAflyoExtension, ExtensionHealth } from '../../hooks/useAflyoExtension';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { ApiKeyService } from '../../services/ApiKeyService';
import { Button } from '../ui/Button';

const EXTENSION_DOWNLOAD_URL = '/extensions/aflyo-mercadolivre-extension.zip';

const PILL: Record<ExtensionHealth, { label: string; cls: string }> = {
  ok: { label: 'Extensão conectada', cls: 'bg-success-bg text-success-ink border-success/20' },
  warn: { label: 'Extensão com aviso', cls: 'bg-warning-bg text-warning-ink border-warning/20' },
  bad: { label: 'Extensão precisa de atenção', cls: 'bg-danger-bg text-danger-ink border-danger/20' },
  off: { label: 'Extensão não conectada', cls: 'bg-surface-1 text-ink-secondary border-line' },
};

function minutesAgo(iso?: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'nunca';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'agora mesmo';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
}

export const ExtensionStatusCard: React.FC = () => {
  const { authUser } = useUser();
  const { toast } = useToast();
  const ext = useAflyoExtension();
  const [busy, setBusy] = useState<'sync' | 'connect' | null>(null);
  const [needsRegenerate, setNeedsRegenerate] = useState(false);
  const wantsConnect = new URLSearchParams(window.location.search).get('conectar') === '1';

  // Chegou pelo botão "Conectar com minha conta" do popup: se já está tudo pronto, avisa.
  useEffect(() => {
    if (wantsConnect && ext.connected && ext.status !== 'off') toast('Extensão conectada à sua conta.', 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext.connected]);

  const finishConnect = async (apiKey: string) => {
    const res = await ext.connect(apiKey);
    if (res?.connected) toast('Extensão conectada à sua conta.', 'success');
    else toast('A extensão não aceitou a chave. Tente de novo ou cole a chave no popup.', 'error');
  };

  const handleConnect = async () => {
    setBusy('connect');
    try {
      const revealed = await ApiKeyService.revealApiKey();
      if (revealed.apiKey) return await finishConnect(revealed.apiKey);
      if (revealed.reason === 'no_active_key') {
        // Sem chave nenhuma: gerar não derruba nenhuma integração existente.
        const generated = await ApiKeyService.generateApiKey();
        return await finishConnect(generated.apiKey);
      }
      // Existe uma chave antiga que não dá para revelar: só gera outra com a confirmação do usuário.
      setNeedsRegenerate(true);
    } catch {
      toast('Não foi possível obter sua chave agora. Tente de novo em instantes.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerate = async () => {
    setBusy('connect');
    try {
      const generated = await ApiKeyService.generateApiKey();
      setNeedsRegenerate(false);
      await finishConnect(generated.apiKey);
    } catch {
      toast('Não foi possível gerar a nova chave.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy('sync');
    const res = await ext.sync();
    setBusy(null);
    toast(res?.status === 'ok' ? 'Sincronizado.' : 'Sincronizado, mas há itens para revisar no popup da extensão.', res?.status === 'ok' ? 'success' : 'warning');
  };

  const shell = 'rounded-2xl border border-line bg-surface-0 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4';

  if (!ext.checked) {
    return (
      <section className={shell} aria-live="polite">
        <Loader2 className="w-4 h-4 animate-spin text-ink-secondary" />
        <span className="text-xs font-medium text-ink-secondary">Procurando a extensão neste navegador…</span>
      </section>
    );
  }

  if (!ext.installed) {
    return (
      <section className={`${shell} border-warning/30`}>
        <div className="flex-1 space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-surface-1 text-ink-secondary border-line">
            <Puzzle className="w-3.5 h-3.5" /> Extensão não detectada
          </span>
          <p className="text-sm font-bold text-ink">Instale a extensão para automatizar</p>
          <p className="text-xs text-ink-secondary font-medium">Já instalou? Recarregue esta página (F5). Se ainda não aparecer, confira se a extensão está ativada em chrome://extensions.</p>
        </div>
        <a href={EXTENSION_DOWNLOAD_URL} download className="inline-flex items-center gap-2 btn-gradient text-xs font-bold px-5 py-2.5 rounded-lg shadow-md self-start sm:self-center">
          <Download className="w-4 h-4" /> Baixar extensão
        </a>
      </section>
    );
  }

  if (!authUser) {
    return (
      <section className={shell}>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-bold text-ink">Extensão detectada</p>
          <p className="text-xs text-ink-secondary font-medium">Entre na sua conta do Aflyo para conectar a extensão.</p>
        </div>
        <Link to="/login" className="inline-flex items-center gap-2 btn-gradient text-xs font-bold px-5 py-2.5 rounded-lg shadow-md">Entrar</Link>
      </section>
    );
  }

  if (!ext.connected) {
    return (
      <section className={`${shell} ${wantsConnect ? 'ring-2 ring-mint-400/50' : ''}`}>
        <div className="flex-1 space-y-1">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${PILL.off.cls}`}>{PILL.off.label}</span>
          <p className="text-sm font-bold text-ink">Conectar a extensão a esta conta</p>
          <p className="text-xs text-ink-secondary font-medium">Um clique envia sua chave para a extensão, sem copiar e colar.</p>
          {needsRegenerate && (
            <div className="mt-2 rounded-lg border border-warning/30 bg-warning-bg p-3 text-xs text-warning-ink font-medium space-y-2">
              <p>Sua chave atual não pode ser exibida de novo. Para conectar, é preciso gerar outra, e a atual deixa de funcionar (inclusive em outras integrações que a usem).</p>
              <Button size="sm" variant="secondary" onClick={handleRegenerate} isLoading={busy === 'connect'}>Gerar nova chave e conectar</Button>
            </div>
          )}
        </div>
        <Button icon={PlugZap} onClick={handleConnect} isLoading={busy === 'connect'} disabled={needsRegenerate}>Conectar extensão</Button>
      </section>
    );
  }

  const pill = PILL[ext.status];
  return (
    <section className={shell}>
      <div className="flex-1 space-y-1 min-w-0">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${pill.cls}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" /> {pill.label}
        </span>
        <p className="text-sm font-bold text-ink truncate">
          {ext.nick ? `${ext.nick} · ` : ''}sincronizou {minutesAgo(ext.lastSync)}
        </p>
        <p className="text-xs text-ink-secondary font-medium">
          {ext.status === 'ok' ? 'Tudo certo: as ofertas do Mercado Livre saem com link automático.' : 'Abra o ícone da extensão no Chrome para ver o que precisa de ajuste.'}
          {ext.version ? ` Versão ${ext.version}.` : ''}
        </p>
      </div>
      <Button variant="secondary" icon={RefreshCw} onClick={handleSync} isLoading={busy === 'sync'}>Sincronizar agora</Button>
    </section>
  );
};
