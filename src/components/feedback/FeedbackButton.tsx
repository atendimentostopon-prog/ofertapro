import React, { useState } from 'react';
import { MessageSquare, X, Star, Bug, Lightbulb, HelpCircle, Heart, Loader2, CheckCircle2 } from 'lucide-react';
import { FeedbackService } from '../../services/FeedbackService';
import { FEATURES } from '../../config/features';
import { APP_NAME } from '../../config/app';

type FeedbackType = 'Bug' | 'Sugestão' | 'Dúvida' | 'Elogio';

const FeedbackButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('Sugestão');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!FEATURES.feedback) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Por favor, escreva uma mensagem detalhando o seu feedback.');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await FeedbackService.sendFeedback({
      type,
      rating,
      message: message.trim(),
      page: window.location.pathname,
      metadata: {
        userAgent: navigator.userAgent,
        resolution: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString()
      }
    });

    setLoading(false);

    if (result.success) {
      // Registrar log do evento de feedback enviado
      await FeedbackService.logEvent({
        event_type: 'feedback_enviado',
        page: window.location.pathname,
        message: `Feedback enviado: [${type}] Nota: ${rating}`,
        metadata: { type, rating }
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setMessage('');
        setType('Sugestão');
        setRating(5);
        setIsOpen(false);
      }, 2000);
    } else {
      setError(result.error || 'Não foi possível enviar o feedback. Tente novamente.');
    }
  };

  const typeConfig: Record<FeedbackType, { icon: React.ElementType; label: string; bg: string; text: string; activeBg: string }> = {
    Bug: { icon: Bug, label: 'Bug', bg: 'bg-rose-50 border-rose-100 hover:bg-rose-100/50', text: 'text-rose-700', activeBg: 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-200' },
    Sugestão: { icon: Lightbulb, label: 'Sugestão', bg: 'bg-amber-50 border-amber-100 hover:bg-amber-100/50', text: 'text-amber-700', activeBg: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-200' },
    Dúvida: { icon: HelpCircle, label: 'Dúvida', bg: 'bg-sky-50 border-sky-100 hover:bg-sky-100/50', text: 'text-sky-700', activeBg: 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-200' },
    Elogio: { icon: Heart, label: 'Elogio', bg: 'bg-pink-50 border-pink-100 hover:bg-pink-100/50', text: 'text-pink-700', activeBg: 'bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-200' },
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-graphite text-ink-inverse rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 hover:bg-graphite-800 transition-all cursor-pointer group"
        title="Enviar Feedback do Beta"
      >
        <MessageSquare className="w-5.5 h-5.5 group-hover:rotate-6 transition-transform" />
        <span className="absolute right-14 bg-graphite text-ink-inverse text-[11px] font-semibold px-2.5 py-1.5 rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none tracking-tight border border-graphite-700">
          Feedbacks & Bugs
        </span>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/48 backdrop-blur-xs p-4 animate-fade-in" onClick={() => !loading && setIsOpen(false)}>
          {/* Modal Card */}
          <div
            className="bg-surface-0 w-full max-w-md rounded-2xl shadow-lg border border-line overflow-hidden animate-scale-in my-auto max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-r from-graphite to-graphite-800 p-6 text-ink-inverse flex-shrink-0">
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Canal de Feedback Beta</h3>
                  <p className="text-xs text-graphite-200 mt-0.5">Ajude-nos a lapidar o {APP_NAME}</p>
                </div>
                <button
                  onClick={() => !loading && setIsOpen(false)}
                  disabled={loading}
                  className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/15 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4 text-ink-inverse" />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
              {success ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-success-bg flex items-center justify-center animate-bounce">
                    <CheckCircle2 className="w-8 h-8 text-success-ink" />
                  </div>
                  <div className="text-center">
                    <h4 className="text-sm font-bold text-ink">Obrigado pelo seu feedback!</h4>
                    <p className="text-[11px] text-ink-tertiary mt-1">Seu relatório foi registrado com sucesso.</p>
                  </div>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="p-3.5 bg-danger-bg border border-danger/20 rounded-xl text-xs text-danger-ink font-medium">
                      {error}
                    </div>
                  )}

                  {/* Feedback Type Chips */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-ink">O que você deseja reportar? *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(typeConfig) as FeedbackType[]).map(t => {
                        const IconComponent = typeConfig[t].icon;
                        const isSelected = type === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setType(t)}
                            className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                              isSelected
                                ? typeConfig[t].activeBg
                                : `${typeConfig[t].bg} ${typeConfig[t].text} border-transparent`
                            }`}
                          >
                            <IconComponent className="w-4 h-4" />
                            {typeConfig[t].label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rating Stars */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-ink">Sua avaliação para este fluxo (1 a 5) *</label>
                    <div className="flex items-center gap-1.5 justify-center py-2 bg-surface-1 rounded-xl border border-line">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          className="p-1 hover:scale-125 transition-transform"
                        >
                          <Star
                            className={`w-8 h-8 ${
                              star <= (hoverRating ?? rating)
                                ? 'text-mint-500 fill-mint-500'
                                : 'text-ink-disabled'
                            } transition-colors`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-ink">Mensagem detalhada *</label>
                    <textarea
                      placeholder="Descreva o problema, dê sua sugestão de melhoria ou envie sua dúvida..."
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={4}
                      maxLength={1000}
                      className="input-modern text-sm resize-none"
                      required
                    />
                    <div className="flex justify-between items-center text-[10px] text-ink-tertiary">
                      <span>Página atual: <code className="font-mono text-ink-secondary bg-surface-1 px-1.5 py-0.5 rounded">{window.location.pathname}</code></span>
                      <span>{message.length}/1000</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn-gradient py-3 flex items-center justify-center gap-2 font-bold text-sm tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Registrando feedback...
                      </>
                    ) : (
                      'Enviar Relatório de Feedback'
                    )}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackButton;
