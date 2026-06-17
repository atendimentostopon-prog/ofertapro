import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Zap } from 'lucide-react';

const RedirectPage: React.FC = () => {
  const { id, shortCode } = useParams<{ id?: string; shortCode?: string }>();
  const [notFound, setNotFound] = useState(false);
  const [emptyLink, setEmptyLink] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleRedirect = async () => {
      const identifier = shortCode || id;
      if (!identifier) {
        navigate('/');
        return;
      }

      try {
        let query = supabase
          .from('offers')
          .select('id, affiliate_link, user_id');

        if (shortCode) {
          query = query.eq('short_code', shortCode);
        } else {
          query = query.eq('id', id);
        }

        const { data: offer, error } = await query.single();

        if (error || !offer) {
          console.error('Oferta não encontrada:', error?.message);
          setNotFound(true);
          return;
        }

        if (!offer.affiliate_link || offer.affiliate_link.trim() === '') {
          console.error('Link de afiliado vazio');
          setEmptyLink(true);
          return;
        }

        try {
          const urlParams = new URLSearchParams(window.location.search);
          const source = urlParams.get('src') || 'direct';

          const { error: clickError } = await supabase
            .from('clicks')
            .insert({
              offer_id: offer.id,
              user_id: offer.user_id,
              source: source
            });

          if (clickError) {
            console.warn('Falha ao registrar clique no Supabase:', clickError.message);
          }
        } catch (clickErr) {
          console.error('Erro de rede ou permissão ao registrar clique:', clickErr);
        }

        // Redireciona para o link de afiliado
        window.location.href = offer.affiliate_link;
      } catch (err) {
        console.error('Erro grave no redirecionamento:', err);
        setNotFound(true);
      }
    };

    handleRedirect();
  }, [id, shortCode, navigate]);

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#070A12] text-[#F8FAFC] p-6 text-center animate-fade-in">
        <div className="absolute top-1/2 left-1/2 w-[350px] h-[350px] bg-red-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-400 shadow-lg text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Oferta não encontrada</h2>
        <p className="text-sm text-[#94A3B8] mt-2 max-w-sm leading-relaxed">
          Esta oferta pode ter sido removida, pausada ou o link curto está incorreto.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-8 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all"
        >
          Voltar para o início
        </button>
      </div>
    );
  }

  if (emptyLink) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#070A12] text-[#F8FAFC] p-6 text-center animate-fade-in">
        <div className="absolute top-1/2 left-1/2 w-[350px] h-[350px] bg-amber-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 text-amber-400 shadow-lg text-2xl font-bold">
          🔗
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Link Indisponível</h2>
        <p className="text-sm text-[#94A3B8] mt-2 max-w-sm leading-relaxed">
          O link de destino para esta oferta não está configurado corretamente.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-8 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all"
        >
          Voltar para o início
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#070A12] text-[#F8FAFC]">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 w-[350px] h-[350px] bg-[#7C3AED]/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      <div className="relative mb-6">
        <div className="absolute inset-0 bg-[#7C3AED]/20 blur-xl rounded-full" />
        <div className="relative w-16 h-16 rounded-2xl bg-[#101827] border border-white/[0.08] flex items-center justify-center shadow-2xl">
          <Zap className="w-6 h-6 text-indigo-400" fill="currentColor" />
        </div>
      </div>
      
      <div className="flex items-center gap-2.5 z-10">
        <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-xs font-bold text-[#94A3B8] tracking-tight animate-pulse">Redirecionando para a oferta segura...</p>
      </div>
    </div>
  );
};

export default RedirectPage;
