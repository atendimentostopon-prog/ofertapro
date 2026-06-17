import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Zap } from 'lucide-react';

const RedirectPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const handleRedirect = async () => {
      if (!id) {
        navigate('/');
        return;
      }

      try {
        const { data: offer, error } = await supabase
          .from('offers')
          .select('affiliate_link, user_id')
          .eq('id', id)
          .single();

        if (error || !offer) {
          console.error('Oferta não encontrada');
          navigate('/');
          return;
        }

        try {
          const urlParams = new URLSearchParams(window.location.search);
          const source = urlParams.get('src') || 'direct';

          const { error: clickError } = await supabase
            .from('clicks')
            .insert({
              offer_id: id,
              user_id: offer.user_id,
              source: source
            });

          if (clickError) {
            console.warn('Falha ao inserir clique no Supabase:', clickError.message);
          }
        } catch (clickErr) {
          console.error('Erro de rede ou permissão ao registrar clique:', clickErr);
        }

        window.location.href = offer.affiliate_link;
      } catch (err) {
        console.error('Erro grave no redirecionamento:', err);
        navigate('/');
      }

    };

    handleRedirect();
  }, [id, navigate]);

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
