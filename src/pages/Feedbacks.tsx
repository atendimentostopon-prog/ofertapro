import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Calendar, Clock, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';

const typeEmojis: Record<string, string> = {
  Bug: '🐛',
  Sugestão: '💡',
  Dúvida: '❓',
  Elogio: '💖',
};

const typeColors: Record<string, string> = {
  Bug: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  Sugestão: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Dúvida: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  Elogio: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

const Feedbacks: React.FC = () => {
  const { user } = useUser();
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFeedbacks = async () => {
    try {
      if (!user) return;
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('beta_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setFeedbacks(data);
    } catch (err: any) {
      console.error('Erro ao carregar feedbacks:', err);
      setError(err.message || 'Erro ao carregar feedbacks do banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedbacks();
  }, [user]);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Meus Feedbacks</h1>
          <p className="text-[15px] font-medium text-[#94A3B8] mt-1">
            Histórico de feedbacks que você enviou durante a fase beta.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#101827] rounded-2xl border border-white/5 p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shadow-inner">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base tracking-tight">Falha ao buscar feedbacks</h3>
            <p className="text-xs text-[#94A3B8] max-w-xs mx-auto leading-relaxed mt-1">
              A tabela de feedbacks pode não estar criada no seu banco de dados Supabase. Execute o script SQL <code className="font-mono text-xs bg-[#0B1020] px-1.5 py-0.5 rounded border border-white/5 text-slate-300">supabase_beta_feedback.sql</code> no seu editor SQL do Supabase.
            </p>
            <p className="text-xs text-red-500 max-w-xs mx-auto font-mono mt-2 bg-red-950/20 p-2 rounded border border-red-900/40">
              {error}
            </p>
          </div>
          <button
            onClick={loadFeedbacks}
            className="btn-gradient text-xs px-4 py-2 rounded-xl text-white font-bold"
          >
            Tentar novamente
          </button>
        </div>
      ) : feedbacks.length > 0 ? (
        <div className="space-y-3.5">
          {feedbacks.map(fb => {
            const date = new Date(fb.created_at);
            const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

            return (
              <div key={fb.id} className="glass-card p-5 border-white/[0.06] bg-[#101827] hover:border-white/10 transition-all duration-300 relative overflow-hidden group">
                <div className="flex items-start gap-4">
                  {/* Rating Badge */}
                  <div className="w-11 h-11 rounded-xl bg-[#070A12] border border-white/5 flex flex-col items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-xs font-bold text-white leading-none">{fb.rating}</span>
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 mt-0.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${typeColors[fb.type] || 'bg-[#070A12] text-slate-205'}`}>
                        <span>{typeEmojis[fb.type] || '💬'}</span>
                        {fb.type}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-[#64748B] font-medium ml-auto">
                        <Clock className="w-3.5 h-3.5" />
                        {dateStr} às {timeStr}
                      </div>
                    </div>

                    <p className="text-sm text-[#F8FAFC] leading-relaxed font-medium mb-3 whitespace-pre-wrap">{fb.message}</p>

                    {fb.page && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <span>Página de envio:</span>
                        <code className="font-mono text-slate-350 bg-[#070A12] px-1.5 py-0.5 rounded border border-white/5">{fb.page}</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 bg-[#101827] rounded-2xl border border-white/5 p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-[#0B1020]/50 border border-white/5 flex items-center justify-center text-slate-400 shadow-inner">
            <MessageSquare className="w-6 h-6 text-slate-405" />
          </div>
          <div>
            <h3 className="text-slate-200 font-bold text-base tracking-tight">Nenhum feedback enviado</h3>
            <p className="text-xs text-[#94A3B8] max-w-xs mx-auto leading-relaxed mt-1">
              Caso encontre algum bug ou queira sugerir alguma melhoria, clique no botão flutuante no canto inferior direito!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Feedbacks;
