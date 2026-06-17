import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2, X, Check,
  Image as ImageIcon, DollarSign, Tag, Link2, Upload,
  RefreshCw, Send, CheckCircle2, XCircle, ShieldCheck,
  AlertTriangle, Zap, Store, ChevronDown
} from 'lucide-react';
import { useOfferForm } from '../hooks/useOfferForm';
import { detectMarketplaceFromUrl } from '../lib/marketplace-detect';
import { ProductEnrichmentService } from '../services/ProductEnrichmentService';
import { CATEGORIES, MARKETPLACES, MARKETPLACE_LABELS } from '../lib/utils';
import ChannelLogo from '../components/ui/ChannelLogo';
import MarketplaceLogo from '../components/ui/MarketplaceLogo';
import { getMarketplaceLogoSrc } from '../lib/logos';
import { useToast } from '../context/ToastContext';
import {
  formatCurrencyInput,
  parseCurrencyInputToCents,
  formatCentsToBRL,
  databaseValueToCents
} from '../lib/currency';
import type { Marketplace } from '../types';

// Constantes locais removidas em favor das centralizadas no utils.ts

const CHIP_MARKETPLACES = [
  { label: 'Amazon',        value: 'amazon' },
  { label: 'Mercado Livre', value: 'mercadolivre' },
  { label: 'Shopee',        value: 'shopee' },
  { label: 'Magalu',        value: 'magalu' },
  { label: 'AliExpress',    value: 'aliexpress' },
  { label: 'Kabum',         value: 'kabum' },
];

// ─── NewOfferPage ─────────────────────────────────────────────────────────────
const NewOfferPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Etapa 1: estado do link ───────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState('');
  const [fetchingData, setFetchingData] = useState(false);
  const [enrichWarningsStep1, setEnrichWarningsStep1] = useState<string[]>([]);
  const [detectedMarketplace, setDetectedMarketplace] = useState<Marketplace | null>(null);

  // ── useOfferForm reutilizado na etapa 2 ──────────────────────────────────
  const {
    form, setForm,
    selectedChannels, setSelectedChannels, toggleChannel,
    loading, uploading, error, setError,
    discount,
    progressStep, progressText,
    dispatchResults, showSummary, setShowSummary,
    connectedChannels, channelsLoading, channelsError, loadChannels,
    handleImageUpload, handleSubmit, user,
    enriching, enrichWarnings, enrichSuccess, setEnrichSuccess, setEnrichWarnings,
    handleFetchProductDetails,
    imagePreviewUrl, imageUploading, imageError,
    handleRemoveImage,
  } = useOfferForm({ onSuccess: () => navigate('/offers') });

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

  const [imageLoadError, setImageLoadError] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // ─── Handlers Etapa 1 ────────────────────────────────────────────────────
  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLinkInput(val);
    setLinkError('');
    const mp = detectMarketplaceFromUrl(val);
    setDetectedMarketplace(mp);
  };

  const handleContinue = async () => {
    const trimmed = linkInput.trim();
    if (!trimmed || !trimmed.startsWith('http')) {
      setLinkError('Cole um link válido começando com http:// ou https://');
      return;
    }

    setLinkError('');
    setFetchingData(true);
    setEnrichWarningsStep1([]);

    // Pré-preenche o form com o link e marketplace detectado
    const mp = detectMarketplaceFromUrl(trimmed);
    setForm(prev => ({
      ...prev,
      link: trimmed,
      marketplace: mp || prev.marketplace,
    }));

    try {
      const result = await ProductEnrichmentService.enrichProductFromAffiliateUrl(trimmed);

      if (result.success) {
        setForm(prev => ({
          ...prev,
          name: result.title || prev.name,
          marketplace: result.marketplace || mp || prev.marketplace,
          imageUrl: result.imageUrl || prev.imageUrl,
          salePrice: result.currentPrice
            ? formatCentsToBRL(Math.round(result.currentPrice * 100))
            : prev.salePrice,
          originalPrice: result.originalPrice
            ? formatCentsToBRL(Math.round(result.originalPrice * 100))
            : prev.originalPrice,
          coupon: result.coupon || prev.coupon,
        }));

        if (result.imageUrl) {
          // Atualiza preview via form.imageUrl (o hook trata isso)
        }

        setEnrichSuccess(true);
        if (result.warnings?.length) setEnrichWarnings(result.warnings);
      } else {
        // Avança mesmo com erro, mas mostra warnings
        setEnrichWarningsStep1(['Não foi possível buscar dados automaticamente. Preencha os campos manualmente.']);
      }
    } catch {
      setEnrichWarningsStep1(['Serviço temporariamente indisponível. Preencha os campos manualmente.']);
    } finally {
      setFetchingData(false);
      setStep(2);
    }
  };

  // ─── Handlers Etapa 2 ────────────────────────────────────────────────────
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  // ─── Channel icons ────────────────────────────────────────────────────────
  // Channel icons agora usam o componente ChannelLogo

  // ─── Progress overlay ─────────────────────────────────────────────────────
  const renderProgressOverlay = () => {
    if (progressStep === 'idle' || progressStep === 'done') return null;
    const isFinished = progressText.toLowerCase().includes('finalizado') || progressText.toLowerCase().includes('concluído');
    return (
      <div className="fixed inset-0 bg-[#070A12]/85 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-[#101827] rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-white/5 flex flex-col items-center gap-4 animate-fade-in">
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
          <div className="space-y-1 text-center">
            <h3 className="text-base font-bold text-white">{isFinished ? 'Concluído!' : 'Processando...'}</h3>
            <p className="text-xs text-slate-400 font-semibold">{progressText || 'Aguarde...'}</p>
          </div>
          {isFinished && (
            <button
              onClick={() => navigate('/offers')}
              className="mt-2 btn-secondary text-xs px-4 py-1.5 rounded-lg"
            >
              Ir para Ofertas
            </button>
          )}
        </div>
      </div>
    );
  };

  // ─── Summary screen (pós-disparo) ─────────────────────────────────────────
  const renderSummary = () => {
    if (!showSummary) return null;
    const totalSuccess = dispatchResults.filter(r => r.success).length;
    const totalFailed = dispatchResults.filter(r => !r.success).length;
    const totalChannels = dispatchResults.length;

    let statusTitle: string, statusSubtitle: string, statusColorClass: string;
    if (totalFailed === 0) {
      statusTitle = 'Oferta enviada com sucesso!';
      statusSubtitle = `Enviada para todos os ${totalSuccess} canal(is) selecionados.`;
      statusColorClass = 'bg-emerald-950/20 border-emerald-900/40 text-emerald-400';
    } else if (totalSuccess > 0) {
      statusTitle = 'Oferta enviada parcialmente.';
      statusSubtitle = `Enviada para ${totalSuccess} de ${totalChannels} canal(is).`;
      statusColorClass = 'bg-amber-950/20 border-amber-900/40 text-amber-400';
    } else {
      statusTitle = 'Oferta salva, mas o envio falhou.';
      statusSubtitle = `Erro no disparo para todos os ${totalChannels} canal(is).`;
      statusColorClass = 'bg-red-950/20 border-red-900/40 text-red-400';
    }

    return (
      <div className="fixed inset-0 bg-[#070A12] z-50 flex items-center justify-center p-6">
        <div className="bg-[#101827] rounded-2xl shadow-2xl p-6 max-w-md w-full border border-white/5 flex flex-col gap-4 animate-fade-in">
          <div className={`p-4 rounded-xl border ${statusColorClass}`}>
            <h3 className="text-sm font-bold tracking-tight">{statusTitle}</h3>
            <p className="text-[11px] font-medium mt-1 leading-relaxed">{statusSubtitle}</p>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {dispatchResults.map((res) => (
              <div key={res.channelId} className={`flex items-start gap-3 p-3 rounded-xl border ${res.success ? 'bg-emerald-950/10 border-emerald-900/20' : 'bg-red-950/10 border-red-900/20'}`}>
                <div className="w-8 h-8 rounded-lg bg-[#070A12] border border-white/5 flex items-center justify-center text-sm">
                  <ChannelLogo type={res.channelType} size="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-bold text-slate-200 truncate">{res.channelName}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${res.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {res.success ? 'Sucesso' : 'Falhou'}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1 font-medium text-slate-400">
                    {res.message || res.errorMessage || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2 border-t border-white/5">
            <button
              onClick={() => { setShowSummary(false); navigate('/history'); }}
              className="flex-1 btn-gradient text-white font-bold py-2.5 rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" /> Ver no Histórico
            </button>
            <button
              onClick={() => { setShowSummary(false); navigate('/offers'); }}
              className="flex-1 btn-secondary text-xs"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Etapa 1 UI ───────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="min-h-screen bg-[#070A12] flex flex-col relative overflow-hidden">
      {/* Glows de fundo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-indigo-600/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-600/6 rounded-full blur-[100px] pointer-events-none" />

      {/* Nav */}
      <div className="relative z-10 flex items-center px-6 py-5 border-b border-white/5">
        <button
          onClick={() => navigate('/offers')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar para Ofertas
        </button>
        <div className="mx-auto flex items-center gap-2 text-xs font-bold text-slate-500">
          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">1</span>
          <span className="text-slate-300">Link</span>
          <div className="w-8 h-px bg-white/10" />
          <span className="w-5 h-5 rounded-full bg-white/10 text-slate-500 flex items-center justify-center text-[10px]">2</span>
          <span>Dados</span>
        </div>
        <div className="w-[140px]" />
      </div>

      {/* Conteúdo central */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold mb-3">
              <Zap className="w-3.5 h-3.5" fill="currentColor" />
              Publicação Inteligente
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Publicar nova oferta
            </h1>
            <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
              Cole o link da promoção. O sistema tentará extrair os dados automaticamente.
            </p>
          </div>

          {/* Campo de Link */}
          <div className="space-y-3">
            <div className={`relative flex items-center rounded-2xl border transition-all duration-300 ${
              linkError
                ? 'border-red-500/60 shadow-[0_0_0_3px_rgba(239,68,68,0.1)]'
                : linkInput
                ? 'border-indigo-500/60 shadow-[0_0_0_3px_rgba(124,58,237,0.12)]'
                : 'border-white/10 hover:border-white/20'
            } bg-[#101827]`}>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Link2 className="w-5 h-5 text-slate-500" />
              </div>
              <input
                type="url"
                autoFocus
                value={linkInput}
                onChange={handleLinkChange}
                onKeyDown={e => e.key === 'Enter' && !fetchingData && handleContinue()}
                placeholder="https://amzn.to/... ou outro link de promoção"
                className="flex-1 bg-transparent pl-12 pr-4 py-4 text-[15px] font-medium text-white placeholder-slate-600 outline-none"
                disabled={fetchingData}
              />
              {linkInput && (
                <button
                  onClick={() => { setLinkInput(''); setLinkError(''); setDetectedMarketplace(null); }}
                  className="absolute right-16 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={handleContinue}
                disabled={fetchingData || !linkInput.trim()}
                className="m-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 min-w-[120px] justify-center"
              >
                {fetchingData ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>
                ) : (
                  <>Continuar <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>

            {/* Marketplace detectado */}
            {detectedMarketplace && (
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 animate-fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                Marketplace detectado: <strong>{MARKETPLACE_LABELS[detectedMarketplace] || detectedMarketplace}</strong>
              </div>
            )}

            {/* Erro */}
            {linkError && (
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400 animate-fade-in">
                <XCircle className="w-3.5 h-3.5" />
                {linkError}
              </div>
            )}

            {/* Warnings etapa 1 */}
            {enrichWarningsStep1.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-3 space-y-1 animate-fade-in">
                {enrichWarningsStep1.map((w, i) => (
                  <p key={i} className="text-[11px] font-medium text-amber-400">⚠️ {w}</p>
                ))}
              </div>
            )}
          </div>

          {/* Chips de marketplaces */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest text-center">
              Marketplaces suportados
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {CHIP_MARKETPLACES.map(mp => (
                <span
                  key={mp.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:border-white/20 transition-colors"
                >
                  <MarketplaceLogo value={mp.value} size="w-3.5 h-3.5" /> {mp.label}
                </span>
              ))}
              <span className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-white/10 text-[11px] font-medium text-slate-500">
                + mais lojas em breve
              </span>
            </div>
          </div>

          {/* Info */}
          <p className="text-center text-[11px] text-slate-600 font-medium leading-relaxed">
            O sistema tenta extrair dados via Open Graph sem fazer scraping agressivo.
            Se não encontrar, você preenche manualmente na próxima etapa.
          </p>
        </div>
      </div>
    </div>
  );

  // ─── Etapa 2 UI ───────────────────────────────────────────────────────────
  const previewImage = imagePreviewUrl || (form.imageUrl?.startsWith('http') ? form.imageUrl : '');
  const salePriceCents = parseCurrencyInputToCents(form.salePrice);
  const originalPriceCents = parseCurrencyInputToCents(form.originalPrice);

  const renderStep2 = () => (
    <div className="min-h-screen bg-[#070A12] flex flex-col relative">
      {/* Glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[130px] pointer-events-none" />

      {/* Nav */}
      <div className="relative z-10 flex items-center px-6 py-5 border-b border-white/5 bg-[#070A12]/80 backdrop-blur-xl sticky top-0">
        <button
          onClick={() => setStep(1)}
          disabled={loading || imageUploading}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold group disabled:opacity-40"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar
        </button>
        <div className="mx-auto flex items-center gap-2 text-xs font-bold text-slate-500">
          <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-[10px]">✓</span>
          <span className="text-slate-500">Link</span>
          <div className="w-8 h-px bg-indigo-500/40" />
          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
          <span className="text-slate-300">Dados</span>
        </div>
        <div className="w-[140px]" />
      </div>

      {/* Aviso se enrich parcial */}
      {(enrichWarnings.length > 0 || enrichWarningsStep1.length > 0) && (
        <div className="relative z-10 bg-amber-950/20 border-b border-amber-900/30 px-6 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs font-semibold text-amber-400">
            {enrichWarnings[0] || enrichWarningsStep1[0]} — Verifique e ajuste os dados abaixo.
          </p>
        </div>
      )}

      {/* Título da etapa */}
      <div className="relative z-10 px-6 py-6 border-b border-white/5">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Confira os dados</h1>
          <p className="text-sm text-slate-400 font-medium mt-0.5">Revise e edite os campos antes de publicar.</p>
        </div>
      </div>

      {/* Corpo: duas colunas */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row max-w-6xl mx-auto w-full px-4 lg:px-6 py-6 gap-6">
        
        {/* ── Coluna Esquerda: Formulário ── */}
        <div className="flex-1 space-y-5 min-w-0">

          {/* Erro global */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-950/20 text-red-400 rounded-xl border border-red-900/40 text-xs font-semibold">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Enrich success */}
          {enrichSuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-950/20 text-emerald-400 rounded-xl border border-emerald-900/30 text-xs font-semibold animate-fade-in">
              <Check className="w-4 h-4 flex-shrink-0" />
              Dados importados automaticamente! Revise antes de publicar.
            </div>
          )}

          {/* Seção: Imagem */}
          <div className="bg-[#0D1525] rounded-2xl border border-white/5 p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" /> Imagem do Produto
            </h3>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
              disabled={loading || imageUploading}
            />

            {/* Drop zone / preview */}
            <div
              onClick={() => !loading && !imageUploading && fileInputRef.current?.click()}
              onDragEnter={handleDrag} onDragLeave={handleDrag}
              onDragOver={handleDrag} onDrop={handleDrop}
              className={`relative group cursor-pointer border border-dashed rounded-xl transition-all duration-300 min-h-[140px] flex flex-col items-center justify-center overflow-hidden ${
                dragActive ? 'border-indigo-500 bg-indigo-950/20'
                : previewImage ? 'border-white/5 bg-[#0B1020]/50'
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
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  <img
                    src={previewImage} alt="Preview"
                    onError={() => setImageLoadError(true)}
                    onLoad={() => setImageLoadError(false)}
                    className="w-full h-36 object-contain bg-[#070A12] p-2"
                  />
                  <div className="absolute bottom-2 right-2 flex gap-2 z-20">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="bg-[#101827]/90 hover:bg-[#101827] text-white border border-white/10 px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Trocar
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handleRemoveImage(); setImageLoadError(false); }}
                      className="bg-red-900/90 hover:bg-red-800 text-white border border-red-500/20 px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Remover
                    </button>
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <span className="bg-[#101827] px-3 py-1.5 rounded-full text-white border border-white/5 text-[10px] font-bold flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" /> Trocar por arquivo local
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-[#101827] border border-white/5 flex items-center justify-center mx-auto text-slate-500 group-hover:text-indigo-400 transition-colors">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-300">Solte ou clique para fazer upload</p>
                    <p className="text-[10px] text-slate-500">JPG, PNG ou WEBP até 5MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* URL externa */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ou use URL externa</label>
              <input
                type="url"
                placeholder="https://imagem-do-produto.jpg"
                value={form.imageUrl}
                onChange={e => { setForm({ ...form, imageUrl: e.target.value }); setImageLoadError(false); }}
                className="input-modern text-xs mt-1"
                disabled={loading || uploading}
              />
            </div>

            {(imageError || imageLoadError) && (
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-amber-500 font-bold">
                  ⚠️ {imageError || 'Não foi possível carregar essa imagem. Tente outra URL.'}
                </p>
                <button type="button" onClick={() => { handleRemoveImage(); setImageLoadError(false); }}
                  className="text-[9px] text-slate-400 hover:text-white underline font-bold">
                  Remover
                </button>
              </div>
            )}
          </div>

          {/* Seção: Informações */}
          <div className="bg-[#0D1525] rounded-2xl border border-white/5 p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-indigo-400" /> Informações do Produto
            </h3>

            {/* Título */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Título *</label>
              <input
                type="text"
                placeholder="Ex: Fone Bluetooth JBL Tune 510BT"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="input-modern text-xs mt-1"
                disabled={loading}
              />
            </div>

            {/* Preços */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Preço Original</label>
                <div className="relative mt-1">
                  <input
                    type="text" inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={form.originalPrice}
                    onChange={e => setForm({ ...form, originalPrice: formatCurrencyInput(e.target.value) })}
                    className="input-modern pl-9 text-xs"
                    disabled={loading}
                  />
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Preço Promocional *</label>
                <div className="relative mt-1">
                  <input
                    type="text" inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={form.salePrice}
                    onChange={e => setForm({ ...form, salePrice: formatCurrencyInput(e.target.value) })}
                    className="input-modern pl-9 text-xs"
                    disabled={loading}
                  />
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Desconto calculado */}
            {discount > 0 && (
              <div className="flex items-center gap-2">
                <span className="bg-orange-500/10 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-lg border border-orange-500/20">
                  💸 {discount}% OFF calculado automaticamente
                </span>
              </div>
            )}

            {/* Cupom e Categoria */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cupom</label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    placeholder="CUPOM10"
                    value={form.coupon}
                    onChange={e => setForm({ ...form, coupon: e.target.value.toUpperCase() })}
                    className="input-modern pl-9 text-xs font-mono font-bold"
                    disabled={loading}
                  />
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Categoria</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="input-modern text-xs mt-1"
                  disabled={loading}
                >
                  <option value="">Selecione...</option>
                  {CATEGORIES.filter(cat => cat !== 'Todos').map(cat => <option key={cat} value={cat} className="bg-[#101827]">{cat}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Seção: Link e Marketplace */}
          <div className="bg-[#0D1525] rounded-2xl border border-white/5 p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-indigo-400" /> Link e Marketplace
            </h3>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Link de Afiliado *</label>
              <div className="relative mt-1">
                <input
                  type="url"
                  placeholder="https://amzn.to/..."
                  value={form.link}
                  onChange={e => setForm({ ...form, link: e.target.value })}
                  className="input-modern pl-9 text-xs"
                  disabled={loading}
                />
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* Marketplace selector */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Marketplace *</label>
              <div className="grid grid-cols-6 gap-2">
                {MARKETPLACES.map(mp => (
                  <button
                    key={mp.value}
                    type="button"
                    onClick={() => setForm({ ...form, marketplace: mp.value })}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                      form.marketplace === mp.value
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-sm'
                        : 'border-white/5 bg-[#0B1020]/50 text-slate-400 hover:bg-[#101827]/50'
                    }`}
                    disabled={loading}
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
                    <span className="text-[9px] font-bold truncate max-w-full">{mp.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Seção: Canais */}
          <div className="bg-[#0D1525] rounded-2xl border border-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Send className="w-3.5 h-3.5 text-indigo-400" /> Canais de Disparo
              </h3>
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
                  disabled={loading || channelsLoading}
                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${channelsLoading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
              </div>
            </div>

            {channelsError && <p className="text-[10px] text-red-400 font-semibold">{channelsError}</p>}

            {channelsLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-slate-500 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> Carregando canais...
              </div>
            ) : connectedChannels.length === 0 ? (
              <div className="bg-[#0B1020]/50 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400 font-medium">
                  Você pode salvar rascunho sem canal ou{' '}
                  <button onClick={() => navigate('/channels')} className="text-indigo-400 hover:underline font-bold">
                    conectar um canal aqui
                  </button>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {connectedChannels.map(ch => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChannel(ch.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedChannels.includes(ch.id)
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-sm'
                        : 'border-white/5 bg-[#0B1020]/50 hover:bg-[#101827]/50'
                    }`}
                    disabled={loading}
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
            )}
          </div>
        </div>

        {/* ── Coluna Direita: Preview ── */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
          <div className="sticky top-[88px] space-y-4">
            <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Prévia do Disparo</p>

            {/* Mockup de mensagem */}
            <div className="bg-[#0b0c10] rounded-2xl p-3 border border-slate-800 shadow-xl">
              <div className="bg-[#101827] rounded-t-xl px-3 py-2 flex items-center gap-2 mb-1.5 border-b border-white/5">
                <div className="w-7 h-7 rounded-full bg-[#070A12] flex items-center justify-center text-xs border border-white/5">📢</div>
                <div className="min-w-0">
                  <p className="text-slate-100 text-xs font-bold truncate">
                    {selectedChannels.length > 0
                      ? connectedChannels.find(c => selectedChannels.includes(c.id))?.name || 'Canal'
                      : 'Canal de Transmissão'}
                  </p>
                  <p className="text-slate-500 text-[9px] font-medium">{selectedChannels.length} canal(is) selecionado(s)</p>
                </div>
              </div>

              <div className="bg-[#070A12] rounded-b-xl p-3">
                <div className="bg-[#101827] rounded-xl p-2.5 shadow-sm border border-white/5 text-xs text-slate-100">
                  {previewImage && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-white/5 bg-[#0B1020]/50">
                      <img src={previewImage} alt="Preview" className="w-full h-28 object-contain" />
                    </div>
                  )}
                  <p className="font-bold text-indigo-400 text-[11px] mb-1">🔥 OFERTA ENCONTRADA</p>
                  <p className="font-bold text-white text-[11.5px] line-clamp-2 leading-tight mb-1.5">
                    {form.name || 'Nome do produto aparecerá aqui'}
                  </p>
                  {originalPriceCents > 0 && (
                    <p className="text-slate-500 line-through text-[10px]">
                      De: {formatCentsToBRL(originalPriceCents)}
                    </p>
                  )}
                  {salePriceCents > 0 && (
                    <p className="text-emerald-400 font-extrabold text-[13px] mt-0.5">
                      Por apenas: {formatCentsToBRL(salePriceCents)}
                    </p>
                  )}
                  {discount > 0 && (
                    <span className="inline-block bg-orange-500/10 text-orange-400 text-[9px] font-bold px-1.5 py-0.5 rounded mt-1">
                      💸 {discount}% OFF
                    </span>
                  )}
                  {form.coupon?.trim() && (
                    <div className="mt-2 bg-[#0B1020]/50 border border-white/5 rounded-md p-1.5 font-mono text-[9.5px] text-slate-300 font-bold">
                      🎟️ Cupom: {form.coupon}
                    </div>
                  )}
                  <p className="text-indigo-400 text-[9.5px] mt-2 underline truncate">
                    🔗 ofertapro.com/r/...
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-600 text-center font-medium leading-relaxed">
              O link gerado automaticamente rastreia cliques e credita suas comissões.
            </p>

            {/* Marketplace preview */}
            {form.marketplace && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#0D1525] rounded-xl border border-white/5">
                <Store className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  {(() => {
                    const mp = MARKETPLACES.find(m => m.value === form.marketplace);
                    return (
                      <>
                        <img
                          src={mp?.logo}
                          alt={form.marketplace}
                          className="w-3.5 h-3.5 object-contain"
                          onError={(e: any) => {
                            e.target.outerHTML = `<span>${mp?.emoji || '🛒'}</span>`;
                          }}
                        />
                        {MARKETPLACE_LABELS[form.marketplace] || form.marketplace}
                      </>
                    );
                  })()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer sticky com botões */}
      <div className="sticky bottom-0 z-20 border-t border-white/5 bg-[#070A12]/95 backdrop-blur-xl px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="text-xs font-semibold text-slate-500">
            {selectedChannels.length > 0
              ? `${selectedChannels.length} canal(is) selecionado(s)`
              : 'Nenhum canal selecionado — rascunho apenas'}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSubmit(true)}
              disabled={loading || uploading || imageUploading}
              className="btn-secondary text-xs font-bold py-2.5 px-5 rounded-xl disabled:opacity-50"
            >
              Salvar Rascunho
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={loading || uploading || imageUploading}
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

  // ─── Render principal ──────────────────────────────────────────────────────
  return (
    <>
      {renderProgressOverlay()}
      {renderSummary()}
      {step === 1 ? renderStep1() : renderStep2()}
    </>
  );
};

export default NewOfferPage;
