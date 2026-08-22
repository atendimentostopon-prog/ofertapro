import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';

const typeEmojis: Record<string, string> = {
  Bug: '🐛',
  Sugestão: '💡',
  Dúvida: '❓',
  Elogio: '💖',
};

const typeColors: Record<string, string> = {
  Bug:      'bg-danger-bg text-danger-ink border-danger/20',
  Sugestão: 'bg-warning-bg text-warning-ink border-warning/20',
  Dúvida:   'bg-info-bg text-info-ink border-info/20',
  Elogio:   'bg-ice text-mint-800 border-mint-200',
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
          <h1 className="text-2xl font-bold text-ink tracking-tight font-display">Meus Feedbacks</h1>
          <p className="text-[15px] font-medium text-ink-secondary mt-1">
            Histórico de feedbacks que você enviou durante a fase beta.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-10 h-10 border-4 border-line border-t-mint-500 rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 bg-surface-0 rounded-2xl border border-line p-6 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-danger-bg border border-danger/20 flex items-center justify-center text-danger-ink">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-base tracking-tight font-display">Falha ao buscar feedbacks</h3>
            <p className="text-xs text-ink-secondary max-w-xs mx-auto leading-relaxed mt-1">
              A tabela de feedbacks pode não estar criada no seu banco de dados Supabase. Execute o script SQL <code className="font-mono text-xs bg-surface-1 px-1.5 py-0.5 rounded border border-line text-ink">supabase_beta_feedback.sql</code> no seu editor SQL do Supabase.
            </p>
            <p className="text-xs text-danger-ink max-w-xs mx-auto font-mono mt-2 bg-danger-bg p-2 rounded border border-danger/20">
              {error}
            </p>
          </div>
          <button
            onClick={loadFeedbacks}
            className="btn-gradient text-xs px-4 py-2 rounded-md font-bold"
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
              <div key={fb.id} className="bg-surface-0 rounded-2xl border border-line p-5 hover:border-line-strong hover:shadow-md transition-all duration-220 relative overflow-hidden group shadow-xs">
                <div className="flex items-start gap-4">
                  {/* Rating Badge */}
                  <div className="w-11 h-11 rounded-xl bg-surface-1 border border-line flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-ink leading-none tabular-nums">{fb.rating}</span>
                    <Star className="w-3.5 h-3.5 text-mint-500 fill-mint-500 mt-0.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 ${typeColors[fb.type] || 'bg-surface-1 text-ink border-line'}`}>
                        <span>{typeEmojis[fb.type] || '💬'}</span>
                        {fb.type}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-ink-tertiary font-medium ml-auto">
                        <Clock className="w-3.5 h-3.5" />
                        {dateStr} às {timeStr}
                      </div>
                    </div>

                    <p className="text-sm text-ink leading-relaxed font-medium mb-3 whitespace-pre-wrap">{fb.message}</p>

                    {fb.page && (
                      <div className="text-[11px] text-ink-tertiary flex items-center gap-1">
                        <span>Página de envio:</span>
                        <code className="font-mono text-ink-secondary bg-surface-1 px-1.5 py-0.5 rounded border border-line">{fb.page}</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 bg-surface-0 rounded-2xl border border-line p-6 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-surface-1 border border-line flex items-center justify-center text-ink-tertiary">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-base tracking-tight font-display">Nenhum feedback enviado</h3>
            <p className="text-xs text-ink-secondary max-w-xs mx-auto leading-relaxed mt-1">
              Caso encontre algum bug ou queira sugerir alguma melhoria, clique no botão flutuante no canto inferior direito!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Feedbacks;
