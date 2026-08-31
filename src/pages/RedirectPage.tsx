import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Zap } from 'lucide-react';

// SEC-3: só http(s). Barra javascript:, data:, vbscript:, etc. antes de
// jogar no window.location.
function toSafeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : null;
  } catch {
    return null;
  }
}

const RedirectPage: React.FC = () => {
  const { id, shortCode } = useParams<{ id?: string; shortCode?: string }>();
  const [notFound, setNotFound] = useState(false);
  const [emptyLink, setEmptyLink] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleRedirect = async () => {
      const identifier = shortCode || id;
      if (!identifier) {
        navigate('/');
        return;
      }

      try {
        // SEC-1: a tabela `offers` não é mais legível por anon. O destino do
        // redirect vem de uma RPC SECURITY DEFINER que devolve só
        // { id, affiliate_link } de UMA oferta ativa.
        const { data, error } = await supabase.rpc('resolve_offer_redirect', {
          p_identifier: identifier,
        });

        const offer = Array.isArray(data) ? data[0] : data;

        if (error || !offer) {
          console.error('Oferta não encontrada:', error?.message);
          setNotFound(true);
          return;
        }

        if (!offer.affiliate_link || String(offer.affiliate_link).trim() === '') {
          console.error('Link de afiliado vazio');
          setEmptyLink(true);
          return;
        }

        const safeUrl = toSafeHttpUrl(offer.affiliate_link);
        if (!safeUrl) {
          console.error('Link de afiliado com protocolo não permitido');
          setInvalidLink(true);
          return;
        }

        try {
          const urlParams = new URLSearchParams(window.location.search);
          const source = urlParams.get('src') || 'direct';

          // SEC-10: clique é registrado anonimamente. O dono da oferta é
          // resolvido por trigger no banco (clicks_set_offer_owner).
          const { error: clickError } = await supabase
            .from('clicks')
            .insert({
              offer_id: offer.id,
              source: source,
            });

          if (clickError) {
            console.warn('Falha ao registrar clique no Supabase:', clickError.message);
          }
        } catch (clickErr) {
          console.error('Erro de rede ou permissão ao registrar clique:', clickErr);
        }

        // Redireciona para o link de afiliado (já validado como http/https)
        window.location.href = safeUrl;
      } catch (err) {
        console.error('Erro grave no redirecionamento:', err);
        setNotFound(true);
      }
    };

    handleRedirect();
  }, [id, shortCode, navigate]);

  if (notFound) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center bg-surface-1 text-ink p-6 text-center animate-fade-in">
        <div className="absolute top-1/2 left-1/2 w-[350px] h-[350px] bg-danger-bg rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="w-16 h-16 rounded-2xl bg-danger-bg border border-danger/20 flex items-center justify-center mb-6 text-danger-ink shadow-lg text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-ink tracking-tight font-display">Oferta não encontrada</h2>
        <p className="text-sm text-ink-secondary mt-2 max-w-sm leading-relaxed">
          Esta oferta pode ter sido removida, pausada ou o link curto está incorreto.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-8 px-6 py-2.5 bg-graphite hover:bg-graphite-800 text-ink-inverse rounded-xl font-bold text-sm transition-all"
        >
          Voltar para o início
        </button>
      </div>
    );
  }

  if (emptyLink || invalidLink) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center bg-surface-1 text-ink p-6 text-center animate-fade-in">
        <div className="absolute top-1/2 left-1/2 w-[350px] h-[350px] bg-warning/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="w-16 h-16 rounded-2xl bg-warning-bg border border-warning/20 flex items-center justify-center mb-6 text-warning-ink shadow-lg text-2xl font-bold">
          🔗
        </div>
        <h2 className="text-xl font-bold text-ink tracking-tight font-display">Link Indisponível</h2>
        <p className="text-sm text-ink-secondary mt-2 max-w-sm leading-relaxed">
          {invalidLink
            ? 'O link de destino desta oferta é inválido e não pode ser aberto com segurança.'
            : 'O link de destino para esta oferta não está configurado corretamente.'}
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-8 px-6 py-2.5 bg-graphite hover:bg-graphite-800 text-ink-inverse rounded-xl font-bold text-sm transition-all"
        >
          Voltar para o início
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-surface-1 text-ink">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 w-[350px] h-[350px] bg-mint-400/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      <div className="relative mb-6">
        <div className="absolute inset-0 bg-mint-400/20 blur-xl rounded-full" />
        <div className="relative w-16 h-16 rounded-2xl bg-surface-0 border border-line flex items-center justify-center shadow-2xl">
          <Zap className="w-6 h-6 text-mint-700" fill="currentColor" />
        </div>
      </div>

      <div className="flex items-center gap-2.5 z-10">
        <div className="w-4 h-4 border-2 border-mint-200 border-t-mint-500 rounded-full animate-spin" />
        <p className="text-xs font-bold text-ink-secondary tracking-tight animate-pulse">Redirecionando para a oferta segura...</p>
      </div>
    </div>
  );
};

export default RedirectPage;
