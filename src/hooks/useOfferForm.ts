import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { OfferService } from '../services/OfferService';
import { compressImage, uploadOfferImage, validateImage } from '../lib/image-utils';
import { dispatchOffer } from '../lib/dispatch-service';
import { canCreateOffer, getPlanLimits } from '../config/plans';
import { FEATURES } from '../config/features';
import { Marketplace, DispatchResult } from '../types';
import { withTimeout } from '../lib/utils';
import { detectMarketplaceFromUrl } from '../lib/marketplace-detect';
import { ProductEnrichmentService } from '../services/ProductEnrichmentService';
import { 
  parseCurrencyInputToCents, 
  formatCentsToBRL, 
  centsToDatabaseValue, 
  databaseValueToCents 
} from '../lib/currency';


interface UseOfferFormParams {
  offerToEdit?: any;
  onClose?: () => void;
  onSuccess?: () => void;
}

export function useOfferForm({ offerToEdit, onClose, onSuccess }: UseOfferFormParams = {}) {
  const { user } = useUser();
  
  const initialImage = offerToEdit?.image || offerToEdit?.image_url || '';
  const isSupabaseStorage = initialImage.includes('supabase.co/storage') || initialImage.includes('/storage/v1/object/public/');

  // 1. Estados de Imagem Separados
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(
    offerToEdit && isSupabaseStorage ? initialImage : null
  );
  const [externalImageUrl, setExternalImageUrl] = useState<string | null>(
    offerToEdit && !isSupabaseStorage ? initialImage : null
  );
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(
    initialImage || null
  );
  const [imageSource, setImageSource] = useState<'upload' | 'external' | 'auto' | null>(
    initialImage ? (isSupabaseStorage ? 'upload' : 'external') : null
  );
  const [imageUploading, setImageUploading] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // 1.1. Estado do Formulário (image e imageUrl mantidos para compatibilidade inicial do form)
  const [form, setForm] = useState({
    name: offerToEdit?.name || '',
    image: initialImage,
    imageUrl: offerToEdit && !isSupabaseStorage ? initialImage : '',
    originalPrice: offerToEdit ? formatCentsToBRL(databaseValueToCents(offerToEdit.originalPrice ?? offerToEdit.original_price)) : '',
    salePrice: offerToEdit ? formatCentsToBRL(databaseValueToCents(offerToEdit.salePrice ?? offerToEdit.sale_price)) : '',
    coupon: offerToEdit?.coupon || '',
    link: offerToEdit?.affiliateLink || offerToEdit?.affiliate_link || '',
    marketplace: offerToEdit?.marketplace || '' as Marketplace | '',
    category: offerToEdit?.category || '',
  });

  // Sincroniza o form.imageUrl quando for editado manualmente
  useEffect(() => {
    // Só sincroniza se for uma URL válida digitada no campo e não veio de upload
    if (form.imageUrl && form.imageUrl.trim().startsWith('http') && imageSource !== 'upload') {
      setExternalImageUrl(form.imageUrl.trim());
      setImagePreviewUrl(form.imageUrl.trim());
      setImageSource('external');
      setImageError(null);
    } else if (!form.imageUrl && imageSource === 'external') {
      setExternalImageUrl(null);
      setImagePreviewUrl(null);
      setImageSource(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.imageUrl]);

  // 1.2. Estados de Enriquecimento de Produto
  const [enriching, setEnriching] = useState(false);
  const [enrichWarnings, setEnrichWarnings] = useState<string[]>([]);
  const [enrichSuccess, setEnrichSuccess] = useState(false);

  // 2. Canais Selecionados
  const [selectedChannels, setSelectedChannels] = useState<string[]>(offerToEdit?.channels || []);

  // 3. Estados de Carregamento e Progresso
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false); // Mantido para compatibilidade
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'offers' | 'channels'>('offers');

  // 4. Estados do Fluxo de Envio e Relatório
  const [progressStep, setProgressStep] = useState<
    'idle' | 'saving' | 'sending' | 'done'
  >('idle');
  const [progressText, setProgressText] = useState('');
  const [currentChannelSending, setCurrentChannelSending] = useState<string>('');
  const [dispatchResults, setDispatchResults] = useState<DispatchResult[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  // 5. Canais conectados disponíveis (para a listagem na UI)
  const [channels, setChannels] = useState<any[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  const loadChannels = async () => {
    if (!user?.id) return;

    try {
      setChannelsLoading(true);
      setChannelsError(null);
      
      const { data, error } = await withTimeout(
        Promise.resolve(
          supabase
            .from('channels')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        ),
        5000,
        'Canais do banco'
      );
      
      if (error) throw error;
      if (data) setChannels(data);
    } catch (err: any) {
      console.error('Erro ao buscar canais no hook useOfferForm:', err);
      setChannelsError('Erro ao carregar canais do banco de dados. Tente novamente.');
    } finally {
      setChannelsLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadChannels();
  }, [user?.id]);

  // Auto-detecção de Marketplace pelo link de afiliado
  useEffect(() => {
    if (form.link) {
      const detected = detectMarketplaceFromUrl(form.link);
      if (detected) {
        setForm(prev => ({ ...prev, marketplace: detected }));
      }
    }
  }, [form.link]);

  // Busca detalhes do produto via Edge Function
  const handleFetchProductDetails = async () => {
    if (!form.link.trim() || !form.link.startsWith('http')) {
      setError('Insira um link de afiliado válido para buscar os dados.');
      return;
    }

    try {
      setEnriching(true);
      setError(null);
      setEnrichWarnings([]);
      setEnrichSuccess(false);

      const result = await ProductEnrichmentService.enrichProductFromAffiliateUrl(form.link);
      
      if (!result.success) {
        setError(result.error || 'Não foi possível buscar dados automaticamente. Preencha manualmente.');
        return;
      }

      setForm(prev => {
        const newForm = { ...prev };
        
        if (result.title && !prev.name.trim()) {
          newForm.name = result.title;
        }
        
        if (result.marketplace && !prev.marketplace) {
          newForm.marketplace = result.marketplace;
        }

        if (result.imageUrl && !prev.imageUrl.trim()) {
          newForm.imageUrl = result.imageUrl;
        }

        if (result.currentPrice && (!prev.salePrice || parseCurrencyInputToCents(prev.salePrice) <= 0)) {
          const cents = Math.round(result.currentPrice * 100);
          newForm.salePrice = formatCentsToBRL(cents);
        }

        if (result.originalPrice && (!prev.originalPrice || parseCurrencyInputToCents(prev.originalPrice) <= 0)) {
          const cents = Math.round(result.originalPrice * 100);
          newForm.originalPrice = formatCentsToBRL(cents);
        }

        if (result.coupon && !prev.coupon.trim()) {
          newForm.coupon = result.coupon;
        }

        return newForm;
      });

      if (result.imageUrl) {
        setExternalImageUrl(result.imageUrl);
        setImagePreviewUrl(result.imageUrl);
        setImageSource('auto');
        setImageError(null);
      }

      setEnrichSuccess(true);
      if (result.warnings && result.warnings.length > 0) {
        setEnrichWarnings(result.warnings);
      }
    } catch (err: any) {
      console.error('Erro ao enriquecer oferta no hook:', err);
      setError('Ocorreu um erro ao tentar buscar dados do produto.');
    } finally {
      setEnriching(false);
    }
  };

  // Filtragem tolerante de canais conectados no beta
  const connectedChannels = channels.filter(c => {
    const status = (c.status || '').toLowerCase();
    const type = (c.type || '').toLowerCase();
    return (status === 'connected' || status === 'active' || status === 'conectado') && 
           (type === 'telegram' || type === 'discord');
  });

  // Alternar seleção do canal
  const toggleChannel = (id: string) => {
    setSelectedChannels(prev => {
      if (FEATURES.billing && !prev.includes(id)) {
        const limits = getPlanLimits(user?.plan);
        if (prev.length >= limits.maxChannels) {
          setUpgradeReason('channels');
          setShowUpgradeModal(true);
          return prev;
        }
      }
      return prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id];
    });
  };

  // Processar o upload de imagem
  const handleImageUpload = async (file: File) => {
    try {
      validateImage(file);
      setImageFile(file);
      setImageError(null);
      setError(null);
      
      const localPreview = URL.createObjectURL(file);
      setImagePreviewUrl(localPreview);
      setImageSource('upload');
      setImageUploading(true);
      setUploading(true);

      if (!user?.id) throw new Error('Usuário não autenticado');

      // Otimização/Compressão
      const compressed = await compressImage(file);
      
      // Upload no bucket do Supabase
      const publicUrl = await uploadOfferImage(compressed, user.id);
      
      setUploadedImageUrl(publicUrl);
      setImageError(null);
      console.log("[IMAGE_UPLOAD] upload completed successfully", publicUrl);
    } catch (err: any) {
      console.error('Erro no upload da imagem:', err);
      const errMsg = err.message || 'Erro ao carregar a imagem. Tente novamente.';
      setImageError(errMsg);
      setError(errMsg);
    } finally {
      setImageUploading(false);
      setUploading(false);
    }
  };

  // Remover imagem
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    setUploadedImageUrl(null);
    setExternalImageUrl(null);
    setImageSource(null);
    setImageError(null);
    setImageUploading(false);
    setUploading(false);
    setForm(prev => ({ ...prev, image: '', imageUrl: '' }));
  };

  // Desconto calculado em tempo real usando centavos
  const originalPriceCents = parseCurrencyInputToCents(form.originalPrice);
  const salePriceCents = parseCurrencyInputToCents(form.salePrice);
  const discount = originalPriceCents && salePriceCents
    ? Math.round((1 - salePriceCents / originalPriceCents) * 100)
    : 0;

  // Envio / Salvamento do Formulário
  const handleSubmit = async (isDraft: boolean = false) => {
    console.log("[OFFER_SUBMIT] started");

    // Validações básicas
    if (!form.name.trim()) {
      setError('O nome da oferta é obrigatório.');
      return;
    }
    if (!form.salePrice || salePriceCents <= 0) {
      setError('O preço promocional é obrigatório e deve ser maior que zero.');
      return;
    }
    if (!form.link.trim() || !form.link.startsWith('http')) {
      setError('Insira um link de afiliado válido (começando com http/https).');
      return;
    }
    if (!form.marketplace) {
      setError('Selecione o marketplace correspondente.');
      return;
    }

    if (!isDraft && selectedChannels.length === 0) {
      setError('Selecione pelo menos um canal de disparo para salvar e disparar ou salve como rascunho.');
      return;
    }

    if (!user?.id) {
      setError('Usuário não autenticado no sistema.');
      return;
    }

    // Validação da imagem processando ou com erro
    if (imageUploading) {
      setError('Aguarde a imagem terminar de carregar ou remova a imagem antes de salvar.');
      return;
    }
    if (imageSource === 'upload' && !uploadedImageUrl && imageError) {
      setError('O upload da imagem falhou. Remova a imagem ou tente novamente antes de salvar.');
      return;
    }

    console.log("[OFFER_SUBMIT] validation ok");
    setLoading(true);
    setError(null);
    setProgressStep('saving');
    setProgressText('Salvando oferta no banco de dados...');

    try {
      if (FEATURES.billing && !isDraft && !offerToEdit) {
        const { count, error: countError } = await supabase
          .from('offers')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (countError) throw countError;

        const currentActiveCount = count || 0;
        if (!canCreateOffer(currentActiveCount, user.plan)) {
          setUpgradeReason('offers');
          setShowUpgradeModal(true);
          setLoading(false);
          setProgressStep('idle');
          setProgressText('');
          return;
        }
      }

      // Resolver imagem final de acordo com a prioridade
      let finalImage: string | null = null;
      if (uploadedImageUrl) {
        finalImage = uploadedImageUrl;
      } else if (externalImageUrl && externalImageUrl.trim().startsWith('http')) {
        finalImage = externalImageUrl.trim();
      }

      // Preparar payload higienizado
      const offerData = {
        user_id: user.id,
        name: form.name,
        image: finalImage,
        original_price: centsToDatabaseValue(originalPriceCents),
        sale_price: centsToDatabaseValue(salePriceCents),
        discount: discount,
        coupon: form.coupon.trim() || null,
        affiliate_link: form.link.trim(),
        marketplace: form.marketplace,
        category: form.category || 'Outros',
        status: isDraft ? 'draft' : (offerToEdit?.status || 'active'),
        channels: selectedChannels,
      };

      console.log("[OFFER_SUBMIT] selected channels", selectedChannels);
      console.log("[OFFER_SUBMIT] save offer start");

      // LOG DE PAYLOAD SEGURO DE ANTE-ENVIO
      console.log("[OFFER_PAYLOAD_DEBUG]", {
        keys: Object.keys(offerData),
        imageType: typeof offerData.image,
        imageLength: typeof offerData.image === "string" ? offerData.image.length : null,
        hasFileObject: (offerData.image as any) instanceof File,
        hasBlobObject: (offerData.image as any) instanceof Blob,
        payloadPreview: {
          name: offerData.name,
          marketplace: offerData.marketplace,
          category: offerData.category,
          sale_price: offerData.sale_price,
          original_price: offerData.original_price,
          image: typeof offerData.image === "string" ? offerData.image.slice(0, 120) : typeof offerData.image
        }
      });

      let savedOfferId = '';
      
      try {
        const savePromise = (async () => {
          if (offerToEdit) {
            await OfferService.updateOffer(offerToEdit.id, offerData);
            return offerToEdit.id;
          } else {
            const result = await OfferService.createOffer(offerData);
            return result.id;
          }
        })();

        savedOfferId = await withTimeout(savePromise, 15000, "Salvar oferta");
        console.log("[OFFER_SUBMIT] save offer success", savedOfferId);
      } catch (saveErr: any) {
        console.error("[OFFER_SUBMIT] save offer error", saveErr);
        throw saveErr;
      }

      // Se houver canais de disparo selecionados e NÃO for rascunho, executar disparos
      if (selectedChannels.length > 0 && !isDraft) {
        setProgressStep('sending');
        setProgressText('Iniciando o disparo multicanal...');
        
        const dispatchReport = await dispatchOffer({
          userId: user.id,
          offerId: savedOfferId,
          offerName: form.name,
          offerImage: finalImage || '',
          salePrice: centsToDatabaseValue(salePriceCents),
          originalPrice: centsToDatabaseValue(originalPriceCents),
          discount: discount,
          coupon: form.coupon || undefined,
          affiliateLink: form.link,
          marketplace: form.marketplace,
          description: form.category,
          channelIds: selectedChannels,
          onChannelStart: (channelName, channelType) => {
            setProgressStep('sending');
            setCurrentChannelSending(channelName);
            setProgressText(`Disparando para o canal: ${channelName} (${channelType === 'telegram' ? 'Telegram' : 'Discord'})...`);
          },
          onStepChange: (stepText) => {
            setProgressText(stepText);
          }
        });

        if (dispatchReport.results) {
          setDispatchResults(dispatchReport.results);
        }
      }

      setProgressStep('done');
      setProgressText('Finalizado.');
      
      if (selectedChannels.length > 0 && !isDraft) {
        setShowSummary(true);
      } else {
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }

    } catch (err: any) {
      console.error('Erro ao salvar oferta:', err);
      setError(err.message || 'Erro inesperado ao processar a oferta. Tente novamente.');
      setProgressStep('idle');
      setProgressText('');
    } finally {
      console.log("[OFFER_SUBMIT] finally cleanup");
      setLoading(false);
      
      const hasDispatched = selectedChannels.length > 0 && !isDraft;
      if (!hasDispatched && progressStep !== 'done') {
        setProgressStep('idle');
        setProgressText('');
      }
    }
  };

  return {
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
    setShowSummary,
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
    // Novos estados e handlers para o formulário
    imageFile,
    imagePreviewUrl,
    uploadedImageUrl,
    externalImageUrl,
    imageSource,
    imageUploading,
    imageError,
    handleRemoveImage
  };
}
