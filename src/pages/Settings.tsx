import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon, Link2, MessageSquare, Link, BarChart3, Save,
  Check, Copy, ExternalLink, Globe, Bell, Shield,
  CreditCard, Palette, Camera, Loader2, LogOut, AlertCircle, Sparkles, CheckCircle2, Trophy, HelpCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { compressImage, uploadAvatarImage } from '../lib/image-utils';
import { FEATURES } from '../config/features';
import { FeedbackService } from '../services/FeedbackService';
import { TemplateService } from '../services/TemplateService';
import { sendTelegramPhoto, sendTelegramMessage } from '../lib/telegram';
import { sender } from '../lib/sender';
import { getPlanLimits, PLAN_CONFIGS } from '../config/plans';
import { UserPlan } from '../types';
import { Avatar } from '../components/ui/Avatar';
import ApiIntegrationsTab from '../components/settings/ApiIntegrationsTab';
import { normalizeMarketplace } from '../lib/marketplace';

const SettingsSection: React.FC<{
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, description, icon: Icon, children }) => (
  <div className="glass-card overflow-hidden border-white/[0.04]">
    <div className="px-6 py-4 border-b border-white/[0.04] bg-surface-3/30 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-indigo-400" size={18} />
      </div>
      <div>
        <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">{title}</h3>
        {description && <p className="text-[12px] font-medium text-slate-400 mt-0.5">{description}</p>}
      </div>
    </div>
    <div className="p-6 space-y-5">{children}</div>
  </div>
);

const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-slate-350">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
);

const Toggle: React.FC<{ label: string; description?: string; defaultChecked?: boolean }> = ({
  label, description, defaultChecked = false
}) => {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-medium text-slate-200">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => setChecked(!checked)}
        className={`relative w-11 h-6 rounded-full transition-all duration-200 ${checked ? 'bg-indigo-600' : 'bg-zinc-800'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
};

const Settings: React.FC = () => {
  const { user, refreshProfile } = useUser();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const publicAvatarInputRef = useRef<HTMLInputElement>(null);

  // Perfil state
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [phone, setPhone] = useState('');

  // Vitrine pública state
  const [publicName, setPublicName] = useState('');
  const [publicAvatarUrl, setPublicAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [isPublicActive, setIsPublicActive] = useState(true);
  const [uploadingPublicAvatar, setUploadingPublicAvatar] = useState(false);
  const [publicTheme, setPublicTheme] = useState('default');

  // Links sociais da vitrine
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('');
  const [telegramGroupUrl, setTelegramGroupUrl] = useState('');
  const [discordGroupUrl, setDiscordGroupUrl] = useState('');

  // Erros locais de campos sociais
  const [whatsappError, setWhatsappError] = useState(false);
  const [telegramError, setTelegramError] = useState(false);
  const [discordError, setDiscordError] = useState(false);

  // Encurtador local
  const [shortener, setShortener] = useState(() => {
    return localStorage.getItem('link_shortener') || 'bitly';
  });
  const [copied, setCopied] = useState(false);

  // Aba ativa geral
  const [activeTab, setActiveTab] = useState<'profile' | 'templates' | 'billing' | 'account' | 'links' | 'integrations'>('account');

  // Pilar E: Templates de Mensagens
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [telegramTemplate, setTelegramTemplate] = useState('');
  const [discordTemplate, setDiscordTemplate] = useState('');
  const [currentEditingTemplateTab, setCurrentEditingTemplateTab] = useState<'whatsapp' | 'telegram' | 'discord'>('whatsapp');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [templatesSaved, setTemplatesSaved] = useState(false);
  const [restoringTemplate, setRestoringTemplate] = useState(false);

  // Pilar D: Limites de Uso
  const [activeOffersCount, setActiveOffersCount] = useState(0);
  const [connectedChannelsCount, setConnectedChannelsCount] = useState(0);
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);

  // Mock de oferta para renderização do preview de templates
  const mockOffer = {
    name: 'Notebook ASUS Vivobook 15',
    originalPrice: '3000.00',
    salePrice: '2499.00',
    discount: 17,
    coupon: 'CUPOM10',
    marketplace: 'amazon',
    category: 'Informática',
    affiliate_link: 'https://amzn.to/exemplo',
    affiliateLink: 'https://amzn.to/exemplo'
  };

  const [testingTemplate, setTestingTemplate] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadUsageStats = async () => {
    if (!user) return;
    try {
      const [offersRes, channelsRes] = await Promise.all([
        supabase.from('offers').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('channels').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'connected')
      ]);
      setActiveOffersCount(offersRes.count || 0);
      setConnectedChannelsCount(channelsRes.count || 0);
    } catch (err) {
      console.error('Erro ao carregar métricas de limites:', err);
    }
  };

  const loadTemplates = async () => {
    if (!user) return;
    try {
      setLoadingTemplates(true);
      // Busca templates da tabela dedicada message_templates
      const templates = await TemplateService.getTemplates(user.id);
      setWhatsappTemplate(templates.whatsapp || TemplateService.getDefaultTemplate('whatsapp'));
      setTelegramTemplate(templates.telegram || TemplateService.getDefaultTemplate('telegram'));
      setDiscordTemplate(templates.discord || TemplateService.getDefaultTemplate('discord'));
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
      // Fallback para padrões se houver erro
      setWhatsappTemplate(TemplateService.getDefaultTemplate('whatsapp'));
      setTelegramTemplate(TemplateService.getDefaultTemplate('telegram'));
      setDiscordTemplate(TemplateService.getDefaultTemplate('discord'));
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSaveTemplates = async () => {
    if (!user) return;
    // Calcular o template ativo inline (getActiveTemplateContent é declarada depois)
    const currentTemplate = (
      currentEditingTemplateTab === 'whatsapp' ? whatsappTemplate
      : currentEditingTemplateTab === 'telegram' ? telegramTemplate
      : discordTemplate
    ) || TemplateService.getDefaultTemplate(currentEditingTemplateTab);
    const validation = TemplateService.validateTemplate(currentTemplate);
    if (!validation.valid) {
      alert(`Erro no template de ${currentEditingTemplateTab}: ${validation.error}`);
      return;
    }
    setSavingTemplates(true);

    // Timeout de segurança: o botão nunca fica preso mais de 10s
    const safetyTimer = setTimeout(() => {
      setSavingTemplates(false);
      console.warn('[Templates] Timeout de segurança atingido ao salvar template.');
    }, 10000);

    try {
      await TemplateService.saveTemplate(user.id, currentEditingTemplateTab, currentTemplate);
      setTemplatesSaved(true);
      setTimeout(() => setTemplatesSaved(false), 2500);
    } catch (err: any) {
      console.error('Erro ao salvar template:', err);
      alert(`Erro ao salvar template: ${err.message || 'Tente novamente.'}`);
    } finally {
      clearTimeout(safetyTimer);
      setSavingTemplates(false);
    }
  };

  const handleRestoreDefaultTemplate = async () => {
    if (!user) return;
    if (!window.confirm(`Restaurar o template de ${currentEditingTemplateTab} para o padrão? Isso apagará as suas customizações.`)) return;
    setRestoringTemplate(true);
    try {
      const defaultText = await TemplateService.restoreDefaultTemplate(user.id, currentEditingTemplateTab);
      if (currentEditingTemplateTab === 'whatsapp') setWhatsappTemplate(defaultText);
      else if (currentEditingTemplateTab === 'telegram') setTelegramTemplate(defaultText);
      else setDiscordTemplate(defaultText);
    } catch (err: any) {
      console.error('Erro ao restaurar template:', err);
      const defaultText = TemplateService.getDefaultTemplate(currentEditingTemplateTab);
      if (currentEditingTemplateTab === 'whatsapp') setWhatsappTemplate(defaultText);
      else if (currentEditingTemplateTab === 'telegram') setTelegramTemplate(defaultText);
      else setDiscordTemplate(defaultText);
    } finally {
      setRestoringTemplate(false);
    }
  };

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setFullName(user.full_name || '');
      setAvatarUrl(user.avatar_url || '');
      setPreferredName(user.preferred_name || '');
      setPhone(user.phone || '');

      setPublicName(user.publicName || user.public_display_name || user.full_name || '');
      setPublicAvatarUrl(user.public_avatar_url || user.publicAvatarUrl || '');
      setBio(user.bio || '');
      setIsPublicActive(user.public_page_active ?? user.isPublicActive ?? true);
      setPublicTheme(user.public_theme || 'default');

      setWhatsappGroupUrl(user.whatsapp_group_url || '');
      setTelegramGroupUrl(user.telegram_group_url || '');
      setDiscordGroupUrl(user.discord_group_url || '');

      // Buscar contagens de uso para faturamento
      loadUsageStats();

      // Buscar templates dinâmicos
      loadTemplates();
    }
  }, [user]);

  // Validar e Formatar URLs de grupos sociais
  const formatAndValidateLink = (url: string, type: 'whatsapp' | 'telegram' | 'discord'): { valid: boolean; normalized: string } => {
    let val = url.trim();
    if (val === '') return { valid: true, normalized: '' };
    
    // Prefixar com https:// caso o usuário não digite
    if (!/^https?:\/\//i.test(val)) {
      val = 'https://' + val;
    }
    
    const lowerVal = val.toLowerCase();
    let valid = false;
    
    if (type === 'whatsapp') {
      valid = lowerVal.includes('chat.whatsapp.com') || lowerVal.includes('wa.me') || lowerVal.includes('api.whatsapp.com');
    } else if (type === 'telegram') {
      valid = lowerVal.includes('t.me') || lowerVal.includes('telegram.me');
    } else if (type === 'discord') {
      valid = lowerVal.includes('discord.gg') || lowerVal.includes('discord.com/invite') || lowerVal.includes('discord.com/channels') || lowerVal.includes('discordapp.com');
    }
    
    return { valid, normalized: valid ? val : url };
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      const localPreview = URL.createObjectURL(file);
      setAvatarUrl(localPreview);

      const compressed = await compressImage(file);
      const publicUrl = await uploadAvatarImage(compressed, user.id, 'profile');
      
      setAvatarUrl(publicUrl);
    } catch (err: any) {
      console.error('Erro no upload do avatar:', err);
      alert('Erro ao carregar avatar. Tente novamente.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePublicAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingPublicAvatar(true);
    try {
      const localPreview = URL.createObjectURL(file);
      setPublicAvatarUrl(localPreview);

      const compressed = await compressImage(file);
      const uploadedUrl = await uploadAvatarImage(compressed, user.id, 'public');
      
      setPublicAvatarUrl(uploadedUrl);
    } catch (err: any) {
      console.error('Erro no upload da foto pública:', err);
      alert('Erro ao carregar foto pública. Tente novamente.');
    } finally {
      setUploadingPublicAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (!fullName.trim()) {
      alert('Nome da Conta é obrigatório.');
      return;
    }
    if (!publicName.trim()) {
      alert('Nome Público da Vitrine é obrigatório.');
      return;
    }
    if (!username.trim() || username.length < 3) {
      alert('Slug da vitrine é obrigatório e deve ter pelo menos 3 caracteres.');
      return;
    }
    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    if (cleanUsername !== username) {
      alert('Slug inválido. Não use espaços ou caracteres especiais.');
      return;
    }

    // Validar e formatar links das redes sociais
    const wppVal = formatAndValidateLink(whatsappGroupUrl, 'whatsapp');
    const telVal = formatAndValidateLink(telegramGroupUrl, 'telegram');
    const discVal = formatAndValidateLink(discordGroupUrl, 'discord');

    setWhatsappError(!wppVal.valid);
    setTelegramError(!telVal.valid);
    setDiscordError(!discVal.valid);

    if (!wppVal.valid || !telVal.valid || !discVal.valid) {
      alert('Por favor, corrija os links inválidos das redes sociais destacados.');
      return;
    }

    setSaving(true);
    try {
      if (cleanUsername !== user.username) {
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', cleanUsername)
          .neq('id', user.id)
          .maybeSingle();

        if (checkError) throw checkError;
        if (existingUser) {
          alert('Este slug já está em uso por outro usuário. Escolha outro.');
          setSaving(false);
          return;
        }
      }

      // 1. Salvar dados de Perfil
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          // Conta
          full_name: fullName.trim(),
          preferred_name: preferredName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: avatarUrl || null,

          // Vitrine
          public_name: publicName.trim(),
          public_display_name: publicName.trim(),
          username: cleanUsername,
          public_url: cleanUsername,
          bio: bio.trim() || null,
          public_avatar_url: publicAvatarUrl || null,
          is_public_active: isPublicActive,
          public_page_active: isPublicActive,
          public_theme: publicTheme,
          public_page_created: true,

          // Links Sociais
          whatsapp_group_url: wppVal.normalized || null,
          telegram_group_url: telVal.normalized || null,
          discord_group_url: discVal.normalized || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Salva preferências locais
      localStorage.setItem('link_shortener', shortener);

      await refreshProfile();

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('Erro ao salvar configurações:', err);
      alert(`Erro: ${err.message || 'Falha ao salvar configurações.'}`);
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simulação de Upgrade (SaaS Monetização)
  const handleUpgradePlan = async (targetPlan: UserPlan) => {
    if (!user) return;
    setUpdatingPlan(targetPlan);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ plan: targetPlan })
        .eq('id', user.id);

      if (error) throw error;
      
      await refreshProfile();
      loadUsageStats();
      
      alert(`Parabéns! Sua conta foi atualizada para o plano ${targetPlan.toUpperCase()} com sucesso! 🚀`);
    } catch (err: any) {
      console.error('Erro ao atualizar plano:', err);
      alert('Erro ao atualizar plano.');
    } finally {
      setUpdatingPlan(null);
    }
  };

  // Injetar variável no cursor do textarea
  const injectVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      if (currentEditingTemplateTab === 'whatsapp') {
        setWhatsappTemplate(prev => prev + ' ' + variable);
      } else if (currentEditingTemplateTab === 'telegram') {
        setTelegramTemplate(prev => prev + ' ' + variable);
      } else if (currentEditingTemplateTab === 'discord') {
        setDiscordTemplate(prev => prev + ' ' + variable);
      }
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newValue = before + variable + after;

    if (currentEditingTemplateTab === 'whatsapp') {
      setWhatsappTemplate(newValue);
    } else if (currentEditingTemplateTab === 'telegram') {
      setTelegramTemplate(newValue);
    } else if (currentEditingTemplateTab === 'discord') {
      setDiscordTemplate(newValue);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const handleTestTemplate = async () => {
    if (!user) return;
    try {
      setTestingTemplate(true);
      // Buscar canais conectados do tipo selecionado
      const { data: channels, error } = await supabase
        .from('channels')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', currentEditingTemplateTab)
        .eq('status', 'connected');

      if (error) throw error;

      if (!channels || channels.length === 0) {
        alert(`Você não possui nenhum canal de ${currentEditingTemplateTab === 'telegram' ? 'Telegram' : currentEditingTemplateTab === 'discord' ? 'Discord' : 'WhatsApp'} conectado e ativo. Conecte um canal para realizar o disparo de teste.`);
        setTestingTemplate(false);
        return;
      }

      const channel = channels[0];
      const trackingLink = 'https://amzn.to/exemplo';
      const template = getActiveTemplateContent() || getActiveTemplatePlaceholder();

      const mockProfile = {
        full_name: user.full_name || 'Contato Givaldo',
        preferred_name: user.preferred_name || 'Contato Givaldo',
        public_name: user.publicName || user.public_display_name || 'Best Promos',
        public_display_name: user.public_display_name || 'Best Promos',
        username: user.username || 'bestpromos'
      };

      const rendered = TemplateService.renderTemplate(
        template,
        mockOffer,
        mockProfile,
        trackingLink,
        currentEditingTemplateTab
      );

      if (currentEditingTemplateTab === 'discord') {
        await sender.sendToDiscord(channel.identifier, {
          offerName: mockOffer.name,
          salePrice: parseFloat(mockOffer.salePrice),
          originalPrice: parseFloat(mockOffer.originalPrice),
          discount: mockOffer.discount,
          coupon: mockOffer.coupon,
          marketplace: mockOffer.marketplace,
          offerImage: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500',
          customDescription: rendered,
          affiliateLink: trackingLink
        });
      } else if (currentEditingTemplateTab === 'telegram') {
        const botToken = channel.metadata?.bot_token;
        const chatId = channel.identifier;
        if (!botToken || !chatId) {
          throw new Error('Configuração do Telegram incompleta para este canal.');
        }

        const testImage = 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500';
        await sendTelegramPhoto(botToken, chatId, testImage, rendered, 'HTML');
      } else if (currentEditingTemplateTab === 'whatsapp') {
        // Criar uma oferta mock real no banco em background para que a public-api consiga renderizar e disparar
        const mockOfferData = {
          name: mockOffer.name,
          description: 'Disparo de teste do WhatsApp',
          image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500',
          original_price: parseFloat(mockOffer.originalPrice) * 100, // em centavos
          sale_price: parseFloat(mockOffer.salePrice) * 100,
          discount: mockOffer.discount,
          coupon: mockOffer.coupon || null,
          affiliate_link: trackingLink,
          marketplace: normalizeMarketplace(mockOffer.marketplace),
          category: 'Outros',
          status: 'draft',
          user_id: user.id
        };

        // Log de debug temporário solicitado na Etapa 4
        console.log('[TEST_TEMPLATE_PAYLOAD]', {
          marketplaceOriginal: mockOffer.marketplace,
          marketplaceNormalized: normalizeMarketplace(mockOffer.marketplace),
          channel: channel.name
        });

        const { data: tempOffer, error: tempOfferErr } = await supabase
          .from('offers')
          .insert(mockOfferData)
          .select()
          .single();

        if (tempOfferErr) throw tempOfferErr;

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Sessão expirada.');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/public-api/dispatch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              offer_id: tempOffer.id,
              channel_ids: [channel.id]
            })
          });

          const responseData = await response.json();
          // Excluir a oferta temporária em background
          supabase.from('offers').delete().eq('id', tempOffer.id).then(() => {});

          if (!response.ok || !responseData.success) {
            throw new Error(responseData?.error || responseData?.message || `Erro ao testar envio do WhatsApp: ${response.statusText}`);
          }
        } catch (dispatchErr) {
          // Garante a exclusão mesmo se falhar
          supabase.from('offers').delete().eq('id', tempOffer.id).then(() => {});
          throw dispatchErr;
        }
      }

      alert(`Mensagem de teste enviada com sucesso para o canal "${channel.name}"! 🚀`);
    } catch (err: any) {
      console.error('[TEST_TEMPLATE_ERROR_DEBUG]:', err);
      alert("Não foi possível enviar o teste. Verifique os dados do template e tente novamente.");
    } finally {
      setTestingTemplate(false);
    }
  };

  const injectFormat = (formatType: 'bold' | 'italic' | 'strike' | 'link') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    
    let formatted = '';
    if (formatType === 'bold') {
      formatted = `**${selectedText || 'texto'}**`;
    } else if (formatType === 'italic') {
      formatted = `_${selectedText || 'texto'}_`;
    } else if (formatType === 'strike') {
      formatted = `~${selectedText || 'texto'}~`;
    } else if (formatType === 'link') {
      formatted = `[${selectedText || 'Comprar agora'}]({link})`;
    }

    const newValue = text.substring(0, start) + formatted + text.substring(end);

    if (currentEditingTemplateTab === 'whatsapp') {
      setWhatsappTemplate(newValue);
    } else if (currentEditingTemplateTab === 'telegram') {
      setTelegramTemplate(newValue);
    } else if (currentEditingTemplateTab === 'discord') {
      setDiscordTemplate(newValue);
    }

    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(start, start + formatted.length);
      } else {
        const offset = formatType === 'bold' ? 2 : (formatType === 'italic' || formatType === 'strike' ? 1 : 1);
        const innerTextLength = formatType === 'link' ? 14 : 5;
        textarea.setSelectionRange(start + offset, start + offset + innerTextLength);
      }
    }, 0);
  };

  const limits = getPlanLimits(user.plan);

  // Obter template para renderização de preview
  const getActiveTemplateContent = () => {
    if (currentEditingTemplateTab === 'whatsapp') return whatsappTemplate;
    if (currentEditingTemplateTab === 'telegram') return telegramTemplate;
    return discordTemplate;
  };

  const getActiveTemplatePlaceholder = () => {
    return TemplateService.getDefaultTemplate(currentEditingTemplateTab);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Configurações</h1>
          <p className="text-[15px] font-medium text-[#94A3B8] mt-1">Gerencie seu perfil, planos e templates de disparo</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-gradient flex items-center gap-2 text-sm px-4 py-2.5 shadow-lg shadow-indigo-950/40 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <><Check className="w-4 h-4" /> Salvo!</>
          ) : (
            <><Save className="w-4 h-4" /> Salvar Alterações</>
          )}
        </button>
      </div>

      {/* Tabs Menu Principal */}
      <div className="w-full overflow-x-auto scrollbar-none py-1">
        <div className="tab-container flex-nowrap min-w-max p-1.5 gap-1">
          {[
            { id: 'account', label: 'Minha Conta', icon: UserIcon },
            { id: 'profile', label: 'Minha Vitrine Pública', icon: Globe },
            { id: 'links', label: 'Links da Vitrine', icon: Link2 },
            { id: 'templates', label: 'Templates de Mensagem', icon: MessageSquare },
            { id: 'integrations', label: 'API & Integrações', icon: Shield },
            { id: 'billing', label: 'Planos & Cobrança', icon: CreditCard }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`tab-item flex items-center gap-2 font-bold text-xs ${
                  activeTab === tab.id ? 'active' : ''
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================== */}
      {/* ABA 1: VITRINE PÚBLICA */}
      {/* ========================================================== */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <SettingsSection title="Página de Vendas Pública" description="Aparência e informações visíveis na sua página de ofertas" icon={UserIcon}>
            <div className="flex items-center gap-6">
              <div className="relative group">
                <input
                  type="file"
                  ref={publicAvatarInputRef}
                  onChange={handlePublicAvatarChange}
                  accept="image/*"
                  className="hidden"
                />
                <div 
                  onClick={() => !uploadingPublicAvatar && publicAvatarInputRef.current?.click()}
                  className={`w-20 h-20 rounded-2xl overflow-hidden bg-[#101827] border transition-all duration-300 cursor-pointer ${
                    uploadingPublicAvatar ? 'border-indigo-500' : 'border-white/10 shadow-md group-hover:border-indigo-400'
                  }`}
                >
                  {uploadingPublicAvatar ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900/80">
                      <Loader2 className="w-6 h-6 text-indigo-450 animate-spin" />
                    </div>
                  ) : (
                    <Avatar
                      src={publicAvatarUrl || avatarUrl}
                      name={publicName || user.email}
                      size="xl"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  )}
                  {!uploadingPublicAvatar && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="text-[13px] font-bold text-slate-200">Foto da Vitrine</h4>
                <p className="text-[11px] text-[#94A3B8] max-w-xs leading-normal">Carregue a foto que aparecerá no topo do seu catálogo público.</p>
              </div>
            </div>

            <Field label="Nome de Exibição" hint="Nome público no topo da vitrine">
              <input
                type="text"
                value={publicName}
                onChange={e => setPublicName(e.target.value)}
                className="input-modern text-xs"
                required
              />
            </Field>

            <Field label="Bio da Vitrine" hint="Breve mensagem de boas-vindas aos seguidores (máx. 200 caracteres)">
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={3}
                maxLength={200}
                className="input-modern resize-none text-xs"
                placeholder="Ex: Pegue as melhores ofertas e cupons atualizados diariamente!"
              />
              <p className="text-[10px] text-slate-500 text-right">{bio.length}/200</p>
            </Field>

            <Field label="Link de Acesso (URL Personalizada)">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono select-none">
                  {window.location.origin}/u/
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="input-modern pl-40 text-xs font-mono"
                  required
                />
              </div>
            </Field>

            {/* URL Actions */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-[#0B1020]/50 rounded-xl border border-white/5">
              <Globe className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-indigo-400 font-bold flex-1 truncate">{window.location.origin}/u/{username}</span>
              <button
                onClick={copyUrl}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-300 hover:text-indigo-400 transition-colors"
              >
                {copied ? 'Copiado!' : 'Copiar Link'}
              </button>
              <a
                href={`/u/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold text-slate-300 hover:text-indigo-400 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Visualizar
              </a>
            </div>

            {/* Tema */}
            <Field label="Tema de Cores">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'default', name: 'Clássico', color: 'bg-[#7C3AED]' },
                  { id: 'indigo', name: 'Índigo', color: 'bg-indigo-600' },
                  { id: 'emerald', name: 'Esmeralda', color: 'bg-emerald-600' },
                  { id: 'dark', name: 'Escuro/Dark', color: 'bg-zinc-800' }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPublicTheme(t.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-center transition-all ${
                      publicTheme === t.id 
                        ? 'border-indigo-500 bg-indigo-600/25 text-indigo-300 shadow-sm' 
                        : 'border-white/5 bg-[#0B1020]/50 text-slate-400 hover:bg-[#101827]/50'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full ${t.color}`} />
                    <span className="text-[11px] font-bold">{t.name}</span>
                  </button>
                ))}
              </div>
            </Field>

            {/* Status Switch */}
            <div className="flex items-center justify-between py-2 border-t border-white/5 mt-4 pt-4">
              <div>
                <p className="text-xs font-bold text-slate-200">Status da Página Pública</p>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">Disponibilizar vitrine na internet.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPublicActive(!isPublicActive)}
                className={`relative w-11 h-6 rounded-full transition-all duration-200 ${isPublicActive ? 'bg-indigo-600' : 'bg-zinc-800'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPublicActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </SettingsSection>
        </div>
      )}

      {/* ========================================================== */}
      {/* ABA: LINKS DA VITRINE */}
      {/* ========================================================== */}
      {activeTab === 'links' && (
        <div className="space-y-6">
          <SettingsSection title="Links Públicos da Vitrine" description="Configure os links de convite para os seus canais e grupos de ofertas" icon={Link2}>
            <Field label="Link do Grupo WhatsApp" hint="Insira o link de convite do grupo do WhatsApp (wa.me/... ou chat.whatsapp.com/...)">
              <input
                type="text"
                value={whatsappGroupUrl}
                onChange={e => { setWhatsappGroupUrl(e.target.value); setWhatsappError(false); }}
                className={`input-modern text-xs ${whatsappError ? 'border-red-500 bg-red-950/10' : ''}`}
                placeholder="Ex: chat.whatsapp.com/ABC123xyz"
              />
              {whatsappError && <p className="text-xs text-rose-500 font-bold mt-1">O link inserido deve ser um link de grupo ou conversa do WhatsApp válido.</p>}
            </Field>

            <Field label="Link do Canal/Grupo Telegram" hint="Insira o link público do seu canal ou grupo no Telegram (t.me/... ou telegram.me/...)">
              <input
                type="text"
                value={telegramGroupUrl}
                onChange={e => { setTelegramGroupUrl(e.target.value); setTelegramError(false); }}
                className={`input-modern text-xs ${telegramError ? 'border-red-500 bg-red-950/10' : ''}`}
                placeholder="Ex: t.me/meucanal"
              />
              {telegramError && <p className="text-xs text-rose-500 font-bold mt-1">O link inserido deve ser um link de convite ou grupo do Telegram válido.</p>}
            </Field>

            <Field label="Link do Convite Discord" hint="Insira o link do convite do seu servidor do Discord (discord.gg/... ou discord.com/invite/...)">
              <input
                type="text"
                value={discordGroupUrl}
                onChange={e => { setDiscordGroupUrl(e.target.value); setDiscordError(false); }}
                className={`input-modern text-xs ${discordError ? 'border-red-500 bg-red-950/10' : ''}`}
                placeholder="Ex: discord.gg/abcde"
              />
              {discordError && <p className="text-xs text-rose-500 font-bold mt-1">O link inserido deve ser um link de convite do Discord válido.</p>}
            </Field>
          </SettingsSection>
        </div>
      )}

      {/* ABA 2: TEMPLATES DE MENSAGENS */}
      {/* ========================================================== */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <SettingsSection title="Templates de Mensagem" description="Personalize a mensagem de envio para cada canal utilizando variáveis dinâmicas" icon={MessageSquare}>
            
            {/* Limit Check: Planos Free não suportam custom templates */}
            {!limits.customTemplates && (
              <div className="p-4 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#101827] border border-white/5 flex items-center justify-center text-indigo-400 flex-shrink-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-xs font-bold text-slate-200">Customização disponível no plano Starter! 🚀</h4>
                  <p className="text-[11px] text-[#94A3B8] font-medium">Faça o upgrade para personalizar as mensagens enviadas para os canais de disparo.</p>
                </div>
                <button
                  onClick={() => setActiveTab('billing')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-[11px] transition-colors shadow-md shadow-indigo-900/40 flex-shrink-0"
                >
                  Fazer Upgrade
                </button>
              </div>
            )}

            {/* Documentação na UI */}
            <div className="p-4 bg-[#0B1020]/45 rounded-2xl border border-white/5 space-y-2 mb-2">
              <p className="text-[11.5px] text-slate-350 font-medium leading-relaxed">
                ℹ️ <strong>Como funciona:</strong> Personalize como suas ofertas serão enviadas para cada canal. Use variáveis como <code className="bg-white/5 px-1 py-0.5 rounded text-indigo-300 font-mono text-[10px]">{`{titulo}`}</code>, <code className="bg-white/5 px-1 py-0.5 rounded text-indigo-300 font-mono text-[10px]">{`{preco_promocional}`}</code> e <code className="bg-white/5 px-1 py-0.5 rounded text-indigo-300 font-mono text-[10px]">{`{link}`}</code>. Campos vazios são ocultados automaticamente quando você usa variáveis inteligentes como <code className="bg-white/5 px-1 py-0.5 rounded text-indigo-300 font-mono text-[10px]">{`{cupom_linha}`}</code>.
              </p>
              <p className="text-[11.5px] text-indigo-400 font-medium">
                ⚠️ <strong>Aviso:</strong> Cada canal tem regras próprias de formatação. Você pode usar comandos simples como <strong>**negrito**</strong>, <em>_itálico_</em>, <del>~riscado~</del> e <a>[texto]({`{link}`})</a>. O Link Oferta converte automaticamente para Telegram, Discord e WhatsApp.
              </p>
              <p className="text-[11.5px] text-indigo-400 font-medium">
                ⚠️ A variável <code className="bg-white/5 px-1 py-0.5 rounded text-indigo-300 font-mono text-[10px]">{`{link}`}</code> usa o link de afiliado direto cadastrado na oferta.
              </p>
            </div>

            {/* Abas por canal */}
            <div className="w-full overflow-x-auto scrollbar-none mb-4">
              <div className="tab-container flex-nowrap min-w-max p-1.5 gap-1 max-w-max">
                {[
                  { id: 'whatsapp', label: 'WhatsApp 💬' },
                  { id: 'telegram', label: 'Telegram ✈️' },
                  { id: 'discord', label: 'Discord 🎮' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentEditingTemplateTab(tab.id as any)}
                    className={`tab-item font-bold text-xs ${
                      currentEditingTemplateTab === tab.id ? 'active' : ''
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2">
              {/* Textarea e Variáveis */}
              <div className="md:col-span-8 space-y-3">
                <Field
                  label={`Estrutura da Mensagem (${currentEditingTemplateTab.toUpperCase()})`}
                  hint="Escreva o texto e clique nas variáveis abaixo para injetá-las no cursor"
                >
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={getActiveTemplateContent()}
                      placeholder={getActiveTemplatePlaceholder()}
                      onChange={e => {
                        if (!limits.customTemplates) return; // Bloquear edição
                        if (currentEditingTemplateTab === 'whatsapp') setWhatsappTemplate(e.target.value);
                        else if (currentEditingTemplateTab === 'telegram') setTelegramTemplate(e.target.value);
                        else setDiscordTemplate(e.target.value);
                      }}
                      disabled={!limits.customTemplates || loadingTemplates}
                      rows={10}
                      className={`input-modern resize-none font-mono text-xs ${!limits.customTemplates ? 'bg-[#070A12]/50 cursor-not-allowed text-slate-500 border-white/5' : ''}`}
                    />
                  </div>
                </Field>

                {/* Contadores e Validação */}
                {(() => {
                  const activeContent = getActiveTemplateContent();
                  const activePlaceholder = getActiveTemplatePlaceholder();
                  const mockProfile = {
                    full_name: user?.full_name || 'Contato Givaldo',
                    preferred_name: user?.preferred_name || 'Contato Givaldo',
                    public_name: user?.publicName || user?.public_display_name || 'Best Promos',
                    public_display_name: user?.public_display_name || 'Best Promos',
                    username: user?.username || 'bestpromos'
                  };
                  const renderedPreview = TemplateService.renderTemplate(
                    activeContent || activePlaceholder,
                    mockOffer,
                    mockProfile,
                    'https://amzn.to/exemplo',
                    currentEditingTemplateTab
                  );
                  const validation = TemplateService.validateTemplate(activeContent || activePlaceholder);

                  return (
                    <>
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold px-1">
                        <span>Caracteres no template: {activeContent.length}</span>
                        <span>Preview aproximado: {renderedPreview.length} caracteres</span>
                      </div>

                      {!validation.valid && validation.error && (
                        <div className="flex items-center gap-2 p-2.5 bg-rose-950/20 border border-rose-900/30 rounded-xl text-rose-400 text-[11px] font-bold">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{validation.error}</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Botões de Formatação Rápida */}
                <div>
                  <p className="text-xs font-bold text-slate-350 mb-2">Formatação Rápida:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'bold', label: 'Negrito 🌟', title: 'Negrito (**texto**)' },
                      { id: 'italic', label: 'Itálico 💫', title: 'Itálico (_texto_)' },
                      { id: 'strike', label: 'Riscado ❌', title: 'Riscado (~texto~)' },
                      { id: 'link', label: 'Link Comprar 🔗', title: 'Link ([Comprar agora]({link}))' }
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => limits.customTemplates && injectFormat(f.id as any)}
                        className={`px-3 py-1.5 rounded-lg border border-white/[0.06] bg-surface-1 hover:border-indigo-500/50 hover:bg-surface-3 text-[10px] font-bold text-slate-300 transition-all ${
                          !limits.customTemplates ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title={f.title}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Variáveis dinâmicas para clicar */}
                <div>
                  <p className="text-xs font-bold text-slate-350 mb-2">Variáveis Disponíveis:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TemplateService.listAvailableVariables().map(v => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => limits.customTemplates && injectVariable(v.name)}
                        className={`px-2.5 py-1.5 rounded-lg border border-white/[0.06] bg-surface-1 hover:border-indigo-500/50 hover:bg-surface-3 text-[10px] font-bold text-slate-300 flex items-center transition-all ${
                          !limits.customTemplates ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title={v.description}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-wrap gap-2 pt-1.5">
                  <button
                    type="button"
                    disabled={!limits.customTemplates || loadingTemplates || restoringTemplate || savingTemplates}
                    onClick={handleRestoreDefaultTemplate}
                    className="px-3.5 py-2 border border-white/5 hover:border-white/10 hover:bg-white/5 rounded-xl text-[11px] font-bold text-slate-300 bg-[#101827] transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {restoringTemplate ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Restaurar Padrão
                  </button>

                  <button
                    type="button"
                    disabled={!limits.customTemplates || loadingTemplates || testingTemplate || !TemplateService.validateTemplate(getActiveTemplateContent() || getActiveTemplatePlaceholder()).valid}
                    onClick={handleTestTemplate}
                    className="px-3.5 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-400 text-[11px] font-bold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingTemplate ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {currentEditingTemplateTab === 'whatsapp' ? 'Enviar teste real' : 'Testar no Canal'}
                  </button>

                  <button
                    type="button"
                    disabled={!limits.customTemplates || loadingTemplates || savingTemplates || !TemplateService.validateTemplate(getActiveTemplateContent() || getActiveTemplatePlaceholder()).valid}
                    onClick={handleSaveTemplates}
                    className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-900/40"
                  >
                    {savingTemplates ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : templatesSaved ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-300" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {templatesSaved ? 'Template Salvo!' : savingTemplates ? 'Salvando...' : 'Salvar Template'}
                  </button>
                </div>
              </div>

              {/* Lado Direito: Preview da Mensagem */}
              <div className="md:col-span-4 space-y-3 bg-[#0B1020]/30 rounded-xl p-4 border border-white/5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">Preview no Canal</p>
                  
                  {/* Bubble Preview */}
                  <div className={`text-xs max-w-full min-h-[160px] flex flex-col justify-start bg-[#070A12]/80 border border-white/5 p-3.5 shadow-sm rounded-xl text-slate-300 ${
                    currentEditingTemplateTab === 'discord' ? 'border-l-4 border-l-indigo-500' : ''
                  }`}>
                    {currentEditingTemplateTab === 'discord' && (
                      <div className="text-[11px] font-bold text-indigo-400 mb-1.5 truncate">
                        {mockOffer.name}
                      </div>
                    )}
                    {currentEditingTemplateTab === 'telegram' ? (
                      <div 
                        className="text-[10.5px] leading-relaxed whitespace-pre-wrap select-text select-all"
                        dangerouslySetInnerHTML={{
                          __html: TemplateService.renderTemplate(
                            getActiveTemplateContent() || getActiveTemplatePlaceholder(),
                            mockOffer,
                            {
                              ...user,
                              full_name: user?.full_name || 'Contato Givaldo',
                              preferred_name: user?.preferred_name || 'Contato Givaldo',
                              public_name: user?.publicName || user?.public_display_name || 'Best Promos',
                              public_display_name: user?.public_display_name || 'Best Promos',
                              username: user?.username || 'bestpromos'
                            },
                            'https://amzn.to/exemplo',
                            currentEditingTemplateTab
                          )
                        }}
                      />
                    ) : (
                      <p className="text-[10.5px] leading-relaxed whitespace-pre-wrap select-text select-all">
                        {TemplateService.renderTemplate(
                          getActiveTemplateContent() || getActiveTemplatePlaceholder(),
                          mockOffer,
                          {
                            ...user,
                            full_name: user?.full_name || 'Contato Givaldo',
                            preferred_name: user?.preferred_name || 'Contato Givaldo',
                            public_name: user?.publicName || user?.public_display_name || 'Best Promos',
                            public_display_name: user?.public_display_name || 'Best Promos',
                            username: user?.username || 'bestpromos'
                          },
                          'https://amzn.to/exemplo',
                          currentEditingTemplateTab
                        )}
                      </p>
                    )}
                  </div>
                </div>
                
                <p className="text-[9.5px] text-slate-500 font-medium text-center leading-normal">As variáveis serão preenchidas com dados da oferta em runtime.</p>
              </div>
            </div>
          </SettingsSection>
        </div>
      )}

      {/* ABA: API E INTEGRAÇÕES */}
      {activeTab === 'integrations' && (
        <ApiIntegrationsTab />
      )}

      {/* ABA 3: PLANOS E COBRANÇA */}
      {/* ========================================================== */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <SettingsSection title="Planos & Cobrança" description="Status do seu plano de faturamento no Link Oferta" icon={CreditCard}>
            <div className="p-6 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#101827] border border-white/5 flex items-center justify-center text-indigo-450 flex-shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1.5 font-medium">
                <h4 className="text-sm font-bold text-white">Plano Beta Gratuito Ativo 🚀</h4>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  O Link Oferta está atualmente em fase de testes beta pública e é 100% gratuito. Todos os recursos PRO estão liberados por padrão para a sua conta, sem bloqueios de uso, limites de ofertas cadastradas ou restrições nos canais conectados.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-bold text-indigo-400 rounded-xl">
                  Recursos PRO Liberados: Sem limites ou cobranças no Beta
                </div>
              </div>
            </div>
          </SettingsSection>
        </div>
      )}

      {/* ABA 4: MINHA CONTA */}
      {/* ========================================================== */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <SettingsSection title="Configurações da Conta" description="Suas informações internas e de contato no Link Oferta" icon={UserIcon}>
            <div className="flex items-center gap-5 p-4 bg-[#0B1020]/50 rounded-2xl border border-white/5 mb-2">
              <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarChange}
                  accept="image/*"
                  className="hidden"
                />
                <div className={`w-14 h-14 rounded-full overflow-hidden bg-[#101827] border border-white/10 flex-shrink-0 shadow-inner group-hover:border-indigo-500 transition-all ${
                  uploadingAvatar ? 'opacity-50' : ''
                }`}>
                  {uploadingAvatar ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900/80">
                      <Loader2 className="w-4 h-4 text-indigo-450 animate-spin" />
                    </div>
                  ) : (
                    <Avatar
                      src={avatarUrl}
                      name={fullName || user.email}
                      size="lg"
                    />
                  )}
                </div>
                {!uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-full">
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{preferredName || fullName || 'Usuário'}</p>
                <p className="text-xs text-[#94A3B8] truncate">{user.email}</p>
              </div>
            </div>

            <Field label="Nome da Conta" hint="Nome completo usado internamente no seu painel administrativo">
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="input-modern text-xs"
              />
            </Field>

            <Field label="Como podemos te chamar?" hint="Nome preferido ou apelido para saudações e exibição no painel">
              <input
                type="text"
                value={preferredName}
                onChange={e => setPreferredName(e.target.value)}
                placeholder="Ex: João"
                className="input-modern text-xs"
              />
            </Field>

            <Field label="Telefone de Contato" hint="Seu telefone/WhatsApp comercial com DDD">
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Ex: (11) 99999-9999"
                className="input-modern text-xs"
              />
            </Field>

            <Field label="E-mail de Cadastro" hint="Seu e-mail de acesso de login (somente leitura)">
              <input
                type="email"
                value={user.email}
                disabled
                className="input-modern bg-[#070A12]/50 text-slate-500 border-white/5 cursor-not-allowed text-xs"
              />
            </Field>

            <Field label="Código do Usuário (ID)" hint="Identificador de segurança da sua conta">
              <input
                type="text"
                value={user.id}
                disabled
                className="input-modern bg-[#070A12]/50 text-slate-500 border-white/5 font-mono text-[10px] cursor-not-allowed"
              />
            </Field>

            {/* Logout button */}
            <div className="pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm('Tem certeza que deseja sair da conta?')) {
                    await supabase.auth.signOut();
                    window.location.href = '/login';
                  }
                }}
                className="btn-secondary hover:bg-rose-950/20 hover:text-rose-450 hover:border-rose-900/50 transition-colors text-xs px-4 py-2 flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair da Conta
              </button>
            </div>
           </SettingsSection>
        </div>
      )}

    </div>
  );
};

export default Settings;
