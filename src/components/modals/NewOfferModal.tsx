import React, { useRef, useState } from 'react';
import {
  X, Image as ImageIcon, DollarSign, Tag, Link2,
  Send, Check, Eye, Upload, Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, RefreshCw
} from 'lucide-react';
import { MARKETPLACE_LABELS, CATEGORIES, MARKETPLACES } from '../../lib/utils';
import { Marketplace } from '../../types';
import { useOfferForm } from '../../hooks/useOfferForm';
import { useNavigate } from 'react-router-dom';
import { formatCurrencyInput, parseCurrencyInputToCents, formatCentsToBRL } from '../../lib/currency';
import { detectMarketplaceFromUrl } from '../../lib/marketplace-detect';
import { useToast } from '../../context/ToastContext';
import ChannelLogo from '../ui/ChannelLogo';
import { getMarketplaceLogoSrc } from '../../lib/logos';
import { FEATURES } from '../../config/features';

interface NewOfferModalProps {
  onClose: () => void;
  offerToEdit?: any;
  onSuccess?: () => void;
}

const NewOfferModal: React.FC<NewOfferModalProps> = ({ onClose, offerToEdit, onSuccess }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (section: 'form' | 'preview') => {
    if (section === 'preview') {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const {
    form,
    setForm,
    selectedChannels,
    setSelectedChannels,
    toggleChannel,
    loading,
    uploading,
    error,
    setError,
    showUpgradeModal,
    setShowUpgradeModal,
    upgradeReason,
    discount,
    progressStep,
    progressText,
    currentChannelSending,
    dispatchResults,
    showSummary,
    connectedChannels,
    channelsLoading,
    channelsError,
    loadChannels,
    handleImageUpload,
    handleSubmit,
    user,
    enriching,
    enrichWarnings,
    enrichSuccess,
    setEnrichSuccess,
    setEnrichWarnings,
    handleFetchProductDetails,
    imagePreviewUrl,
    imageUploading,
    imageError,
    handleRemoveImage
  } = useOfferForm({
    offerToEdit,
    onClose,
    onSuccess: () => {
      if (onSuccess) onSuccess();
    }
  });

  const { toast } = useToast();

  const allSelected = connectedChannels.length > 0 &&
    connectedChannels.filter(ch => ch.type === 'telegram' || ch.type === 'discord')
      .every(ch => selectedChannels.includes(ch.id));

  const handleSelectAllChannels = () => {
    if (allSelected) {
      setSelectedChannels([]);
      toast('Canais desmarcados!', 'info');
    } else {
      const allActiveIds = connectedChannels
        .filter(ch => ch.type === 'telegram' || ch.type === 'discord')
        .map(ch => ch.id);
      setSelectedChannels(allActiveIds);
      toast('Todos os canais marcados!', 'success');
    }
  };

  const [step, setStep] = React.useState<'form' | 'preview'>('form');
  const [dragActive, setDragActive] = React.useState(false);
  const [imageLoadError, setImageLoadError] = React.useState(false);

  const handleSaveClick = (isDraft: boolean) => {
    handleSubmit(isDraft);
  };

  const handleCloseClick = () => {
    if (progressStep === 'saving' || progressStep === 'sending') {
      alert('O disparo de ofertas está em andamento. Aguarde a conclusão do processo para fechar.');
      return;
    }
    onClose();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  // Channel icons agora usam o componente ChannelLogo

  // Renderizar o conteúdo do progresso do disparo com feedback em tempo real
  const renderProgressIndicator = () => {
    if (progressStep === 'idle' || progressStep === 'done') return null;

    const isFinished = progressText.toLowerCase().includes('finalizado') || progressText.toLowerCase().includes('concluído');

    return (
      <div className="absolute inset-0 bg-[#070A12]/80 backdrop-blur-[4px] z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in rounded-2xl">
        <div className="bg-[#101827] rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-white/5 flex flex-col items-center gap-4">
          <div className="relative">
            {!isFinished ? (
              <>
                <div className="w-14 h-14 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-indigo-400 animate-pulse" />
              </>
            ) : (
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-7 h-7" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              {isFinished ? 'Operação Concluída' : 'Processando Operação'}
            </h3>
            <p className="text-xs text-slate-400 font-semibold">{progressText || 'Processando...'}</p>
          </div>
          {isFinished && (
            <button
              onClick={() => {
                onClose();
                if (onSuccess) onSuccess();
              }}
              className="mt-2 btn-secondary text-xs px-4 py-1.5 rounded-lg"
            >
              Fechar Janela
            </button>
          )}
        </div>
      </div>
    );
  };

  // Modal de Upgrade SaaS Premium
  const renderUpgradeModal = () => {
    if (!showUpgradeModal) return null;

    const limitsText = upgradeReason === 'offers' 
      ? 'Você atingiu o limite de ofertas ativas do seu plano Free.' 
      : 'Você atingiu o limite de canais conectados do seu plano Free.';

    return (
      <div className="absolute inset-0 bg-[#070A12]/80 backdrop-blur-[4px] z-50 flex items-center justify-center p-6 animate-fade-in rounded-2xl">
        <div className="bg-[#101827] rounded-2xl shadow-2xl p-6 max-w-md w-full border border-white/5 flex flex-col items-center text-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
            <AlertTriangle className="w-6 h-6 animate-bounce" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white">Upgrade Necessário 🚀</h3>
            <p className="text-xs text-[#94A3B8] font-medium leading-relaxed">
              {limitsText} Faça o upgrade para o plano **Starter** ou **PRO** para desfrutar de ofertas e canais ilimitados, agendamentos futuros e templates avançados.
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => {
                setShowUpgradeModal(false);
                onClose();
                navigate('/settings'); // Ir para as configurações / faturamento
              }}
              className="flex-1 btn-gradient text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-indigo-950/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              Fazer Upgrade
            </button>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="flex-1 bg-[#0B1020] hover:bg-[#101827] text-slate-350 border border-white/5 font-bold py-2.5 rounded-xl text-xs transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Tela de resumo final de envios (exibe status success, partial ou error)
  const renderSummaryScreen = () => {
    if (!showSummary) return null;

    const totalSuccess = dispatchResults.filter(r => r.success).length;
    const totalFailed = dispatchResults.filter(r => !r.success).length;
    const totalChannels = dispatchResults.length;

    let statusTitle: string;
    let statusSubtitle: string;
    let statusColorClass: string;

    if (totalFailed === 0) {
      statusTitle = 'Oferta enviada com sucesso.';
      statusSubtitle = `Enviada para todos os ${totalSuccess} canal(is) selecionados.`;
      statusColorClass = 'bg-emerald-950/20 border border-emerald-900/40 text-emerald-400';
    } else if (totalSuccess > 0) {
      statusTitle = 'Oferta enviada parcialmente.';
      statusSubtitle = `Enviada com sucesso para ${totalSuccess} de ${totalChannels} canal(is).`;
      statusColorClass = 'bg-amber-950/20 border border-amber-900/40 text-amber-400';
    } else {
      statusTitle = 'Oferta salva, mas o envio falhou.';
      statusSubtitle = `Ocorreu um erro no disparo para todos os ${totalChannels} canal(is).`;
      statusColorClass = 'bg-red-950/20 border border-red-900/40 text-red-400';
    }

    return (
      <div className="absolute inset-0 bg-[#101827] z-40 rounded-2xl flex flex-col p-6 border border-white/5 animate-fade-in">
        <div className={`p-4 rounded-xl border mb-4 ${statusColorClass}`}>
          <h3 className="text-sm font-bold tracking-tight">{statusTitle}</h3>
          <p className="text-[11px] font-medium mt-1 leading-relaxed">{statusSubtitle}</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-2">
          {dispatchResults.map((res) => (
            <div
              key={res.channelId}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                res.success ? 'bg-emerald-950/10 border border-emerald-900/20' : 'bg-red-950/10 border border-red-900/20'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#070A12] border border-white/5 flex items-center justify-center shadow-sm text-sm">
                <ChannelLogo type={res.channelType} size="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold text-slate-200 truncate">{res.channelName}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${res.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {res.success ? 'Sucesso' : 'Falhou'}
                  </span>
                </div>
                <p className={`text-[11px] mt-1 font-medium leading-relaxed ${res.success ? 'text-slate-450' : 'text-red-405'}`}>
                  {res.message || res.errorMessage || 'Erro de conexão ou envio.'}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-white/5 flex gap-3">
          <button
            onClick={() => {
              onClose();
              if (onSuccess) onSuccess();
              navigate('/history');
            }}
            className="flex-1 btn-gradient text-white font-bold py-2.5 rounded-xl text-xs shadow-md shadow-indigo-950/40 transition-colors flex items-center justify-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            Ver no Histórico
          </button>
          <button
            onClick={() => {
              onClose();
              if (onSuccess) onSuccess();
            }}
            className="flex-1 btn-secondary text-xs transition-colors"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={handleCloseClick}>
      <div
        className="modal-content w-full max-w-4xl relative overflow-hidden flex flex-col h-[85vh] max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Camadas de Processamento */}
        {renderProgressIndicator()}
        {renderUpgradeModal()}
        {renderSummaryScreen()}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#101827]/40 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {offerToEdit ? 'Editar Oferta' : 'Nova Oferta'}
            </h2>
            <p className="text-[11px] font-medium text-[#94A3B8] mt-0.5">Configure, salve e envie em lote com um clique</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const nextSection = step === 'form' ? 'preview' : 'form';
                setStep(nextSection);
                scrollToSection(nextSection);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/5 text-xs font-semibold text-slate-350 hover:bg-[#101827] transition-all md:hidden"
            >
              <Eye className="w-3.5 h-3.5" />
              {step === 'form' ? 'Ver Prévia' : 'Preencher'}
            </button>
            <button
              onClick={handleCloseClick}
              className="w-8 h-8 rounded-lg border border-transparent flex items-center justify-center hover:bg-[#101827]/60 transition-all text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Formulário Principal */}
        <div className="flex flex-col md:flex-row flex-1 divide-y md:divide-y-0 md:divide-x divide-white/5 overflow-y-auto md:overflow-hidden min-h-0">
          {/* Lado Esquerdo: Formulário */}
          <div ref={formContainerRef} className="w-full md:flex-1 px-6 py-4 space-y-4 md:overflow-y-auto md:h-full">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-950/20 text-red-400 rounded-xl border border-red-900/40 text-xs font-semibold">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Upload de Imagem */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">1</span>
                Imagem do Produto
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
                disabled={loading || imageUploading || enriching}
              />
              
              {/* Preview Integrado */}
              {(() => {
                const previewImage = imagePreviewUrl || '';
                return (
                  <div
                    onClick={() => !loading && !imageUploading && !enriching && fileInputRef.current?.click()}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`relative group cursor-pointer border border-dashed rounded-xl transition-all duration-300 min-h-[140px] flex flex-col items-center justify-center overflow-hidden ${
                      dragActive ? 'border-indigo-500 bg-indigo-950/20' :
                      previewImage 
                        ? 'border-white/5 bg-[#0B1020]/50' 
                        : 'border-white/5 bg-[#0B1020]/50 hover:border-indigo-500/50 hover:bg-[#101827]/30'
                    }`}
                  >
                    {imageUploading && (
                      <div className="absolute inset-0 z-10 bg-[#101827]/85 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                        <p className="text-[10px] font-bold text-indigo-400 animate-pulse">Comprimindo e carregando...</p>
                      </div>
                    )}
                    {previewImage ? (
                      <div className="relative w-full h-full group flex flex-col items-center justify-center">
                        <img 
                          src={previewImage} 
                          alt="Preview da Imagem" 
                          onError={() => setImageLoadError(true)}
                          onLoad={() => setImageLoadError(false)}
                          className="w-full h-36 object-contain bg-[#070A12] p-2"
                        />
                        {/* Botões persistentes/hover para Trocar e Remover */}
                        <div className="absolute bottom-2 right-2 flex gap-2 z-20">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                            className="bg-[#101827]/90 hover:bg-[#101827] text-white border border-white/10 px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 shadow-md"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Trocar Imagem
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage();
                              setImageLoadError(false);
                            }}
                            className="bg-red-900/90 hover:bg-red-855 text-white border border-red-500/20 px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 shadow-md"
                          >
                            <X className="w-3 h-3" />
                            Remover Imagem
                          </button>
                        </div>
                        
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="bg-[#101827] px-3 py-1.5 rounded-full shadow-lg text-white border border-white/5 text-[10px] font-bold flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5" />
                            Trocar por Arquivo Local
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center space-y-2">
                        <div className="w-10 h-10 rounded-xl bg-[#101827] border border-white/5 flex items-center justify-center mx-auto text-slate-500 group-hover:text-indigo-400 transition-transform">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-300">Solte ou clique para carregar imagem</p>
                          <p className="text-[10px] text-slate-500">JPG, PNG ou WEBP otimizados de até 5MB</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {(imageError || imageLoadError) && (
                <div className="flex flex-col gap-1 mt-1 text-center">
                  <p className="text-[10px] text-amber-500 font-bold">
                    ⚠️ {imageError || 'Não foi possível carregar essa imagem. Tente outra URL ou faça upload manual.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-[9px] text-slate-400 hover:text-white underline font-bold mt-0.5 mx-auto"
                  >
                    Remover imagem e continuar
                  </button>
                </div>
              )}
            </div>

            {/* URL da Imagem do Produto (Campo Opcional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-350 tracking-wider">
                OU URL da Imagem Externa (Opcional)
              </label>
              <input
                type="url"
                placeholder="https://exemplo.com/imagem-do-produto.jpg"
                value={form.imageUrl}
                onChange={e => {
                  setForm({ ...form, imageUrl: e.target.value });
                  setImageLoadError(false);
                }}
                className="input-modern text-xs"
                disabled={loading || uploading || enriching}
              />
            </div>

            {/* Informações da Oferta */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">2</span>
                Título do Produto *
              </label>
              <input
                type="text"
                placeholder="Ex: Teclado Mecânico Gamer Redragon K552"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="input-modern text-xs"
                disabled={loading || uploading}
              />
            </div>

            {/* Valores */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">3</span>
                  Preço Original
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={form.originalPrice}
                    onChange={e => setForm({ ...form, originalPrice: formatCurrencyInput(e.target.value) })}
                    className="input-modern pl-9 text-xs"
                    disabled={loading || uploading}
                  />
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">↓</span>
                  Preço Promocional *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={form.salePrice}
                    onChange={e => setForm({ ...form, salePrice: formatCurrencyInput(e.target.value) })}
                    className="input-modern pl-9 text-xs"
                    disabled={loading || uploading}
                  />
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Cupom */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">4</span>
                  Cupom
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="TECLADO10"
                    value={form.coupon}
                    onChange={e => setForm({ ...form, coupon: e.target.value.toUpperCase() })}
                    className="input-modern pl-9 text-xs font-mono font-bold"
                    disabled={loading || uploading}
                  />
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                </div>
              </div>
              {/* Categoria */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">5</span>
                  Categoria
                </label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="input-modern text-xs"
                  disabled={loading || uploading}
                >
                  <option value="" className="bg-[#101827] text-white">Selecione...</option>
                  {CATEGORIES.filter(cat => cat !== 'Todos').map(cat => (
                    <option key={cat} value={cat} className="bg-[#101827] text-white">{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Link de Afiliado */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between w-full">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">6</span>
                  Link de Afiliado *
                </label>
                {form.link && form.link.trim().startsWith('http') && (
                  <button
                    type="button"
                    onClick={handleFetchProductDetails}
                    disabled={loading || uploading || enriching}
                    className="text-[10px] font-extrabold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1 transition-colors"
                  >
                    {enriching ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                        Buscar dados do produto
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://amzn.to/..."
                  value={form.link}
                  onChange={e => {
                    setForm({ ...form, link: e.target.value });
                    setEnrichSuccess(false);
                    setEnrichWarnings([]);
                  }}
                  className="input-modern pl-9 text-xs"
                  disabled={loading || uploading || enriching}
                />
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
              
              {/* Aviso discreto de Marketplace detectado */}
              {form.link && form.link.trim().startsWith('http') && (
                <div className="text-[10px] font-semibold mt-1">
                  {(() => {
                    const detected = detectMarketplaceFromUrl(form.link);
                    if (detected) {
                      const labels: Record<string, string> = {
                        amazon: 'Amazon',
                        mercadolivre: 'Mercado Livre',
                        shopee: 'Shopee',
                        magalu: 'Magalu',
                        aliexpress: 'AliExpress'
                      };
                      return (
                        <span className="text-indigo-400">
                          ✨ Marketplace detectado: <strong>{labels[detected] || detected}</strong>
                        </span>
                      );
                    } else {
                      return (
                        <span className="text-slate-400">
                          ℹ️ Não foi possível detectar automaticamente. Selecione manualmente.
                        </span>
                      );
                    }
                  })()}
                </div>
              )}
              
              {enrichSuccess && (
                <div className="text-[10px] text-emerald-400 font-extrabold flex items-center gap-1 animate-fade-in">
                  <Check className="w-3.5 h-3.5" />
                  Dados importados automaticamente! Revise os dados antes de disparar. Preços e cupons podem mudar.
                </div>
              )}

              {enrichWarnings.length > 0 && (
                <div className="space-y-0.5 mt-1 bg-amber-950/20 p-2 rounded-lg border border-amber-900/30 text-[10px] font-semibold text-amber-400 animate-fade-in">
                  {enrichWarnings.map((w, idx) => (
                    <div key={idx} className="flex items-start gap-1">
                      <span>•</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Marketplace */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-extrabold flex items-center justify-center">7</span>
                Marketplace *
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {MARKETPLACES.map(mp => (
                  <button
                    key={mp.value}
                    type="button"
                    onClick={() => setForm({ ...form, marketplace: mp.value })}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                      form.marketplace === mp.value
                        ? 'border-indigo-500 bg-indigo-650/20 text-indigo-350 shadow-sm'
                        : 'border-white/5 bg-[#0B1020]/50 text-slate-350 hover:bg-[#101827]/50'
                    }`}
                    disabled={loading || uploading}
                  >
                    <div className="w-5 h-5 flex items-center justify-center mb-1 overflow-hidden">
                      <img
                        src={getMarketplaceLogoSrc(mp.value)}
                        alt={mp.label}
                        className="w-full h-full object-contain"
                        onError={(e: any) => {
                          e.target.outerHTML = `<span class="text-base">${mp.emoji}</span>`;
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold truncate max-w-full">{mp.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Canais */}
            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Canais para Disparar</p>
                <div className="flex items-center gap-3">
                  {connectedChannels.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllChannels}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={loadChannels}
                    disabled={loading || uploading || channelsLoading}
                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1 transition-colors"
                    title="Atualizar canais"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${channelsLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
                </div>
              </div>

              {channelsError && (
                <p className="text-[10px] text-red-400 font-semibold">{channelsError}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {channelsLoading ? (
                  <div className="col-span-full flex items-center gap-2 py-3 text-xs text-slate-500 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    Carregando canais...
                  </div>
                ) : connectedChannels.length === 0 ? (
                  <div className="col-span-full bg-[#0B1020]/50 border border-white/5 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-350 font-medium">
                      Conecte um canal Telegram ou Discord antes de disparar.
                    </p>
                    <a
                      href="/channels"
                      onClick={(e) => {
                        e.preventDefault();
                        onClose();
                        navigate('/channels');
                      }}
                      className="inline-block mt-2 text-xs font-bold text-indigo-400 hover:text-indigo-350 hover:underline"
                    >
                      Ir para Canais →
                    </a>
                  </div>
                ) : connectedChannels.map(ch => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChannel(ch.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      selectedChannels.includes(ch.id)
                        ? 'border-indigo-500 bg-indigo-650/20 text-indigo-305 shadow-sm'
                        : 'border-white/5 bg-[#0B1020]/50 hover:bg-[#101827]/50'
                    }`}
                    disabled={loading || uploading}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                      selectedChannels.includes(ch.id) ? 'bg-indigo-600 border-indigo-600' : 'border-white/10'
                    }`}>
                      {selectedChannels.includes(ch.id) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div className="w-5 h-5 rounded bg-[#070A12]/40 border border-white/5 flex items-center justify-center text-xs overflow-hidden p-0.5 flex-shrink-0">
                      <ChannelLogo type={ch.type} size="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate">{ch.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Lado Direito: Preview (Mockup de Canal de Transmissão Geral) */}
          <div ref={previewRef} className="w-full md:w-80 px-6 py-4 bg-[#0B1020]/30 flex flex-col gap-4 md:overflow-y-auto md:h-full">
            <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">PRÉVIA DO DISPARO</p>
            
            {/* Celular Mockup */}
            <div className="bg-[#0b0c10] rounded-2xl p-3 border border-slate-800 shadow-xl flex flex-col flex-1 min-h-[350px]">
              <div className="bg-[#101827] rounded-t-xl px-3 py-2 flex items-center gap-2 mb-1.5 flex-shrink-0 border-b border-white/5">
                <div className="w-7 h-7 rounded-full bg-[#070A12] flex items-center justify-center text-xs shadow-sm border border-white/5">📢</div>
                <div className="min-w-0">
                  <p className="text-slate-100 text-xs font-bold truncate">
                    {selectedChannels.length > 0 
                      ? connectedChannels.find(c => selectedChannels.includes(c.id))?.name || 'Canal Selecionado' 
                      : 'Canal de Transmissão'}
                  </p>
                  <p className="text-[#94A3B8] text-[9px] font-medium">{selectedChannels.length} canal(is) selecionado(s)</p>
                </div>
              </div>
              
              <div className="bg-[#070A12] rounded-b-xl p-3 flex-1 flex flex-col justify-end overflow-hidden">
                <div className="bg-[#101827] rounded-xl p-2.5 shadow-sm border border-white/5 max-w-full text-xs text-slate-100">
                  {imagePreviewUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-white/5 bg-[#0B1020]/50">
                      <img src={imagePreviewUrl} alt="Preview" className="w-full h-28 object-contain" />
                    </div>
                  )}
                  <p className="font-bold text-indigo-400 text-[11px] mb-1">🔥 OFERTA ENCONTRADA</p>
                  <p className="font-bold text-white text-[11.5px] line-clamp-2 leading-tight mb-1.5">
                    {form.name || 'Nome do produto aparecerá aqui'}
                  </p>
                  
                  {parseCurrencyInputToCents(form.originalPrice) > 0 && (
                    <p className="text-slate-500 line-through text-[10px]">
                      De: {formatCentsToBRL(parseCurrencyInputToCents(form.originalPrice))}
                    </p>
                  )}
                  {parseCurrencyInputToCents(form.salePrice) > 0 && (
                    <p className="text-emerald-450 font-extrabold text-[13px] mt-0.5">
                      Por apenas: {formatCentsToBRL(parseCurrencyInputToCents(form.salePrice))}
                    </p>
                  )}
                  {discount > 0 && (
                    <span className="inline-block bg-orange-500/10 text-orange-400 text-[9px] font-bold px-1.5 py-0.5 rounded mt-1">
                      💸 {discount}% OFF
                    </span>
                  )}
  
                  {form.coupon && form.coupon.trim() !== '' && (
                    <div className="mt-2 bg-[#0B1020]/50 border border-white/5 rounded-md p-1.5 font-mono text-[9.5px] text-slate-350 font-bold flex items-center justify-between">
                      <span>🎟️ Cupom: {form.coupon}</span>
                    </div>
                  )}
  
                  <p className="text-indigo-450 text-[9.5px] mt-2 underline truncate">
                    {FEATURES.useDirectAffiliateLinkInChannels 
                      ? `🔗 ${form.link || 'https://link-de-afiliado-real...'}` 
                      : '🔗 linkoferta.vercel.app/o/...'}
                  </p>
                </div>
              </div>
            </div>
            
            <p className="text-[10px] text-slate-500 text-center font-medium leading-relaxed">
              {FEATURES.useDirectAffiliateLinkInChannels
                ? 'O link de afiliado direto configurado será enviado nas mensagens dos canais.'
                : 'O link acima é gerado automaticamente para rastrear cliques e creditar suas comissões.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-[#101827]/40 rounded-b-2xl">
          <div className="text-xs font-semibold text-[#94A3B8]">
            {selectedChannels.length > 0
              ? `${selectedChannels.length} canal(is) selecionado(s)`
              : 'Nenhum canal selecionado'}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSaveClick(true)}
              disabled={loading || uploading}
              className="btn-secondary text-xs font-bold py-2 px-4 rounded-xl disabled:opacity-50"
            >
              Salvar Rascunho
            </button>
            <button
              onClick={() => handleSaveClick(false)}
              disabled={loading || uploading}
              className="btn-gradient text-xs font-bold py-2.5 px-5 rounded-xl disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-indigo-950/40"
            >
              <Send className="w-3.5 h-3.5" />
              Salvar e Disparar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewOfferModal;
