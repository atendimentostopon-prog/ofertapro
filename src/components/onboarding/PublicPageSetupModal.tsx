import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/image-utils';
import { withTimeout } from '../../lib/utils';
import { 
  Globe, User as UserIcon, AlignLeft, Palette, Camera, 
  Loader2, CheckCircle2, AlertCircle, Eye, Star, Zap, Phone, Mail, Link as LinkIcon, ChevronRight, ChevronLeft, Check, Sparkles
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';

interface PublicPageSetupModalProps {
  isOpen: boolean;
}

export const PublicPageSetupModal: React.FC<PublicPageSetupModalProps> = ({ isOpen }) => {
  const { user, refreshProfile, setUser } = useUser();
  
  // Etapa ativa: 1 (Minha Conta) ou 2 (Minha Vitrine)
  const [step, setStep] = useState(1);

  // --- Estados do Passo 1: Minha Conta ---
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingPersonalAvatar, setUploadingPersonalAvatar] = useState(false);

  // --- Estados do Passo 2: Minha Vitrine Pública ---
  const [publicName, setPublicName] = useState('');
  const [username, setUsername] = useState('');
  const [publicAvatarUrl, setPublicAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('');
  const [telegramGroupUrl, setTelegramGroupUrl] = useState('');
  const [discordGroupUrl, setDiscordGroupUrl] = useState('');
  const [theme, setTheme] = useState('default');
  const [uploadingPublicAvatar, setUploadingPublicAvatar] = useState(false);
  
  // UI states
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'>('idle');
  
  // Erros locais de campos
  const [whatsappError, setWhatsappError] = useState(false);
  const [telegramError, setTelegramError] = useState(false);
  const [discordError, setDiscordError] = useState(false);

  const personalFileInputRef = useRef<HTMLInputElement>(null);
  const publicFileInputRef = useRef<HTMLInputElement>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Monitorar mudança de usuário para resetar inicialização
  useEffect(() => {
    if (user) {
      if (lastUserIdRef.current !== user.id) {
        setIsInitialized(false);
        lastUserIdRef.current = user.id;
      }
    } else {
      setIsInitialized(false);
      lastUserIdRef.current = null;
    }
  }, [user]);

  // Inicializar com os dados do usuário do Supabase Auth / Profile
  useEffect(() => {
    if (user && !isInitialized) {
      setFullName(user.full_name === 'Usuário' ? '' : user.full_name || '');
      setPreferredName(user.preferred_name || '');
      setPhone(user.phone || '');
      setAvatarUrl(user.avatar_url || '');

      // Determinar o nome público inicial de forma segura
      let initialPublicName = '';
      if (user.publicName && user.publicName !== 'Usuário') {
        initialPublicName = user.publicName;
      } else if (user.public_display_name && user.public_display_name !== 'Usuário') {
        initialPublicName = user.public_display_name;
      } else if (user.full_name && user.full_name !== 'Usuário') {
        initialPublicName = user.full_name;
      }
      setPublicName(initialPublicName);
      
      // Limpa nomes temporários sugerindo username limpo
      const cleanUsername = (user.username || '').replace(/_temp$/, '').replace(/_[a-f0-9]{4}$/, '');
      setUsername(cleanUsername.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
      setBio(user.bio || '');
      setTheme(user.public_theme || 'default');
      setPublicAvatarUrl(user.publicAvatarUrl || user.public_avatar_url || user.avatar_url || '');
      
      setWhatsappGroupUrl(user.whatsapp_group_url || '');
      setTelegramGroupUrl(user.telegram_group_url || '');
      setDiscordGroupUrl(user.discord_group_url || '');

      setIsInitialized(true);
    }
  }, [user, isInitialized]);

  // Validar formato e unicidade do username em tempo real
  useEffect(() => {
    let active = true;

    if (username.length < 3) {
      console.log("[SLUG_CHECK] invalid (menos de 3 caracteres)", username);
      setUsernameStatus('invalid');
      return;
    }
    
    // Regra: Apenas letras, números, ponto, hífen ou underline
    const usernameRegex = /^[a-z0-9._-]+$/;
    if (!usernameRegex.test(username)) {
      console.log("[SLUG_CHECK] invalid (caracteres inválidos)", username);
      setUsernameStatus('invalid');
      return;
    }

    const checkUsername = async () => {
      console.log("[SLUG_CHECK] start checking", username);
      setUsernameStatus('checking');
      try {
        const queryPromise = supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        // Timeout de 5 segundos na consulta do Supabase
        const result = (await withTimeout(queryPromise, 5000, `Check Username Availability: ${username}`)) as any;

        if (!active) {
          console.log("[SLUG_CHECK] query returned but component/slug changed, ignoring", username);
          return;
        }

        if (result.error) throw result.error;

        if (result.data && result.data.id !== user?.id) {
          console.log("[SLUG_CHECK] taken", username);
          setUsernameStatus('taken');
        } else {
          console.log("[SLUG_CHECK] available", username);
          setUsernameStatus('available');
        }
      } catch (err: any) {
        console.error("[SLUG_CHECK] error", err);
        if (active) {
          setUsernameStatus('error');
        }
      }
    };

    const delayDebounce = setTimeout(() => {
      checkUsername();
    }, 500);

    return () => {
      active = false;
      clearTimeout(delayDebounce);
    };
  }, [username, user?.id]);

  if (!isOpen || !user) return null;

  // Função utilitária de upload com organização de pastas em 'avatars'
  const uploadLocalImage = async (file: File, path: 'profile' | 'public'): Promise<string> => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `${user.id}/${path}/${Date.now()}.${fileExt}`;
    
    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (err: any) {
      console.warn(`[IMAGE_UPLOAD_LOCAL] Falha no upload para avatars/${path}, usando fallback Base64:`, err.message || err);
      // Converter para string Base64 (Data URI) local no browser em caso de falha de RLS/Bucket
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Falha ao converter imagem para Base64'));
          }
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
      });
    }
  };

  const handlePersonalAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPersonalAvatar(true);
    setErrorMsg(null);
    try {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Formato de arquivo inválido. Use JPG, PNG ou WEBP.');
      }
      
      const compressed = await compressImage(file);
      const url = await uploadLocalImage(compressed, 'profile');
      setAvatarUrl(url);
      
      // Por padrão, sugere a mesma foto na vitrine se ela ainda estiver em branco
      if (!publicAvatarUrl) {
        setPublicAvatarUrl(url);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao processar imagem pessoal.');
    } finally {
      setUploadingPersonalAvatar(false);
    }
  };

  const handlePublicAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPublicAvatar(true);
    setErrorMsg(null);
    try {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Formato de arquivo inválido. Use JPG, PNG ou WEBP.');
      }
      
      const compressed = await compressImage(file);
      const url = await uploadLocalImage(compressed, 'public');
      setPublicAvatarUrl(url);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao processar imagem da vitrine.');
    } finally {
      setUploadingPublicAvatar(false);
    }
  };

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
      const isWppDomain = lowerVal.includes('chat.whatsapp.com') || lowerVal.includes('wa.me') || lowerVal.includes('api.whatsapp.com');
      const isOnlyPrefix = val.replace(/\/$/, '') === 'https://chat.whatsapp.com' || val.replace(/\/$/, '') === 'http://chat.whatsapp.com' || val.replace(/\/$/, '') === 'https://wa.me' || val.replace(/\/$/, '') === 'https://api.whatsapp.com';
      
      let hasSuffix = true;
      if (lowerVal.includes('chat.whatsapp.com/')) {
        const parts = val.split('chat.whatsapp.com/');
        hasSuffix = parts.length > 1 && parts[1].trim().length >= 5;
      } else if (lowerVal.includes('wa.me/')) {
        const parts = val.split('wa.me/');
        hasSuffix = parts.length > 1 && parts[1].trim().length >= 4;
      }
      
      valid = isWppDomain && !isOnlyPrefix && hasSuffix;
    } else if (type === 'telegram') {
      const isTgDomain = lowerVal.includes('t.me') || lowerVal.includes('telegram.me');
      const isOnlyPrefix = val.replace(/\/$/, '') === 'https://t.me' || val.replace(/\/$/, '') === 'http://t.me' || val.replace(/\/$/, '') === 'https://telegram.me';
      
      let hasSuffix = true;
      if (lowerVal.includes('t.me/')) {
        const parts = val.split('t.me/');
        hasSuffix = parts.length > 1 && parts[1].trim().length >= 3;
      }
      
      valid = isTgDomain && !isOnlyPrefix && hasSuffix;
    } else if (type === 'discord') {
      const isDcDomain = lowerVal.includes('discord.gg') || lowerVal.includes('discord.com/invite') || lowerVal.includes('discord.com/channels') || lowerVal.includes('discordapp.com');
      const isOnlyPrefix = val.replace(/\/$/, '') === 'https://discord.gg' || val.replace(/\/$/, '') === 'https://discord.com/invite';
      
      let hasSuffix = true;
      if (lowerVal.includes('discord.gg/')) {
        const parts = val.split('discord.gg/');
        hasSuffix = parts.length > 1 && parts[1].trim().length >= 3;
      } else if (lowerVal.includes('discord.com/invite/')) {
        const parts = val.split('discord.com/invite/');
        hasSuffix = parts.length > 1 && parts[1].trim().length >= 3;
      }
      
      valid = isDcDomain && !isOnlyPrefix && hasSuffix;
    }
    
    return { valid, normalized: valid ? val : url };
  };

  const handleNextStep = () => {
    setErrorMsg(null);
    if (step === 1) {
      if (!fullName.trim()) {
        setErrorMsg('Por favor, informe seu Nome Completo.');
        return;
      }
      // Passar para etapa 2
      setStep(2);
      // Pré-preenche o nome da vitrine se estiver em branco
      if (!publicName.trim()) {
        setPublicName(preferredName.trim() ? `Ofertas do ${preferredName}` : `Ofertas de ${fullName.split(' ')[0]}`);
      }
    }
  };

  const handlePrevStep = () => {
    setErrorMsg(null);
    if (step === 2) {
      setStep(1);
    }
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (saving) return;

    setErrorMsg(null);

    // Validações Etapa 2
    if (!publicName.trim()) {
      setErrorMsg('O Nome de Exibição da vitrine é obrigatório.');
      return;
    }

    if (usernameStatus === 'invalid' || username.length < 3 || username.length > 30) {
      setErrorMsg('O username público deve conter de 3 a 30 caracteres alfanuméricos válidos.');
      return;
    }

    if (usernameStatus === 'taken') {
      setErrorMsg('Este username/slug já está em uso por outro canal.');
      return;
    }

    // Validar links de redes sociais
    const wppVal = formatAndValidateLink(whatsappGroupUrl, 'whatsapp');
    const telVal = formatAndValidateLink(telegramGroupUrl, 'telegram');
    const discVal = formatAndValidateLink(discordGroupUrl, 'discord');

    setWhatsappError(!wppVal.valid);
    setTelegramError(!telVal.valid);
    setDiscordError(!discVal.valid);

    if (!wppVal.valid) {
      setErrorMsg('Informe um link completo do grupo do WhatsApp ou deixe o campo vazio.');
      return;
    }
    if (!telVal.valid) {
      setErrorMsg('Informe um link completo do canal do Telegram ou deixe o campo vazio.');
      return;
    }
    if (!discVal.valid) {
      setErrorMsg('Informe um link completo do convite do Discord ou deixe o campo vazio.');
      return;
    }

    console.log("[ONBOARDING_SUBMIT] start");
    console.log("[ONBOARDING_SUBMIT] validation ok");

    const sanitizedPayload = {
      // Dados Conta (Passo 1)
      full_name: fullName.trim(),
      preferred_name: preferredName.trim() || null,
      phone: phone.trim() || null,
      avatar_url: avatarUrl || null,
      
      // Dados Vitrine (Passo 2)
      public_name: publicName.trim(),
      public_display_name: publicName.trim(),
      username: username.trim().toLowerCase(),
      public_url: username.trim().toLowerCase(),
      public_avatar_url: publicAvatarUrl || avatarUrl || null,
      bio: bio.trim() || null,
      public_theme: theme,
      is_public_active: true,
      public_page_created: true,
      onboarded: true,
      
      // Links Sociais
      whatsapp_group_url: wppVal.normalized || null,
      telegram_group_url: telVal.normalized || null,
      discord_group_url: discVal.normalized || null,
      
      updated_at: new Date().toISOString()
    };

    console.log("[ONBOARDING_SUBMIT] payload", sanitizedPayload);

    setSaving(true);
    try {
      console.log("[ONBOARDING_SUBMIT] supabase update start");
      const updatePromise = supabase
        .from('profiles')
        .update(sanitizedPayload)
        .eq('id', user.id);

      const { error } = (await withTimeout(updatePromise, 10000, 'Supabase Update Profile')) as any;

      if (error) throw error;
      console.log("[ONBOARDING_SUBMIT] supabase update success");

      // Update otimista no contexto local para evitar travamento de interface
      console.log("[ONBOARDING_SUBMIT] updating local user state");
      setUser(prev => prev ? {
        ...prev,
        full_name: fullName.trim(),
        preferred_name: preferredName.trim() || undefined,
        phone: phone.trim() || undefined,
        avatar_url: avatarUrl || undefined,
        publicName: publicName.trim(),
        public_name: publicName.trim(),
        public_display_name: publicName.trim(),
        username: username.trim().toLowerCase(),
        publicUrl: username.trim().toLowerCase(),
        publicAvatarUrl: publicAvatarUrl || avatarUrl || undefined,
        bio: bio.trim() || undefined,
        public_theme: theme,
        isPublicActive: true,
        public_page_created: true,
        onboarded: true,
        whatsapp_group_url: wppVal.normalized || undefined,
        telegram_group_url: telVal.normalized || undefined,
        discord_group_url: discVal.normalized || undefined,
      } : null);

      console.log("[ONBOARDING_SUBMIT] refreshProfile start");
      try {
        await withTimeout(refreshProfile(), 8000, 'refreshProfile');
        console.log("[ONBOARDING_SUBMIT] refreshProfile success");
      } catch (refreshErr) {
        console.error("[ONBOARDING_SUBMIT] refreshProfile timeout/error (não bloqueante)", refreshErr);
      }

      console.log("[ONBOARDING_SUBMIT] navigate dashboard");
      console.log("[ONBOARDING_SUBMIT] done");
    } catch (err: any) {
      console.error("[ONBOARDING_SUBMIT] error", err);
      setErrorMsg(
        err.message?.includes('Timeout') 
          ? 'Não foi possível concluir o setup agora. Verifique sua conexão e tente novamente.' 
          : (err.message || 'Erro ao registrar informações. Tente novamente.')
      );
    } finally {
      setSaving(false);
    }
  };

  // Cores de preview do tema
  const themePreviewStyles: Record<string, string> = {
    default: 'bg-[#7C3AED]',
    indigo: 'bg-[#4F46E5]',
    emerald: 'bg-[#10B981]',
    dark: 'bg-[#070A12]',
  };

  const themeAccentColors: Record<string, string> = {
    default: 'bg-indigo-600 hover:bg-indigo-700',
    indigo: 'bg-indigo-500 hover:bg-indigo-600',
    emerald: 'bg-emerald-500 hover:bg-emerald-600',
    dark: 'bg-zinc-800 hover:bg-zinc-700 border border-white/5',
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#101827] rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[660px] border border-white/5 animate-scale-up">
        
        {/* Lado Esquerdo: Formulários e Passos */}
        <div className="flex-1 p-6 md:p-10 flex flex-col justify-between overflow-y-auto border-b md:border-b-0 md:border-r border-white/5">
          <div>
            {/* Header com indicador de progresso */}
            <div className="flex items-center justify-between mb-4">
              <span className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 fill-current animate-pulse" /> Onboarding Beta
              </span>
              <span className="text-xs font-bold text-slate-400">
                Etapa {step} de 2 — {step === 1 ? 'Minha Conta' : 'Minha Vitrine'}
              </span>
            </div>

            {/* Barra de progresso visual */}
            <div className="w-full bg-[#070A12] h-1 rounded-full overflow-hidden mb-6 flex gap-1">
              <div className={`h-full flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-indigo-500' : 'bg-zinc-800'}`} />
              <div className={`h-full flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-indigo-500' : 'bg-zinc-800'}`} />
            </div>

            <h2 className="text-2xl font-black text-white tracking-tight">
              {step === 1 ? 'Configure sua Conta Pessoal' : 'Configure sua Vitrine Pública'}
            </h2>
            <p className="text-xs text-[#94A3B8] mt-1 mb-6 leading-relaxed">
              {step === 1 
                ? 'Preencha seus dados internos da conta. Essas informações são confidenciais e usadas no seu painel.' 
                : 'Defina o link, nome e grupos sociais que aparecerão na sua vitrine para a sua audiência.'}
            </p>

            {errorMsg && (
              <div className="mb-5 p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 flex items-start gap-3 text-rose-450 text-xs font-semibold animate-shake">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* --- ETAPA 1: MINHA CONTA --- */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Upload Foto Pessoal */}
                <div className="flex items-center gap-4 p-4 bg-[#0b0c10]/40 rounded-2xl border border-white/5">
                  <div className="relative group">
                    <input 
                      type="file" 
                      ref={personalFileInputRef} 
                      onChange={handlePersonalAvatarChange} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    <div 
                      onClick={() => !uploadingPersonalAvatar && personalFileInputRef.current?.click()}
                      className="w-16 h-16 rounded-2xl overflow-hidden bg-[#101827] border border-white/10 flex items-center justify-center cursor-pointer relative"
                    >
                      {uploadingPersonalAvatar ? (
                        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                      ) : avatarUrl ? (
                        <img src={avatarUrl} alt="Foto Pessoal" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-7 h-7 text-slate-500" />
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                        <Camera className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-200">Foto Pessoal</p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">JPG, PNG ou WEBP. Comprimida automaticamente.</p>
                    <button 
                      type="button"
                      onClick={() => personalFileInputRef.current?.click()}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 mt-1"
                    >
                      Carregar Foto
                    </button>
                  </div>
                </div>

                {/* Nome Completo */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-350 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-slate-500" /> Nome Completo *
                  </label>
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full input-modern text-xs px-4 py-2.5 rounded-xl"
                    required
                  />
                </div>

                {/* Preferred Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-350 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-slate-500" /> Como quer ser chamado? (Opcional)
                  </label>
                  <input 
                    type="text" 
                    value={preferredName}
                    onChange={e => setPreferredName(e.target.value)}
                    placeholder="Ex: João (usado na saudação do Dashboard)"
                    className="w-full input-modern text-xs px-4 py-2.5 rounded-xl"
                  />
                </div>

                {/* E-mail (Readonly) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-650" /> E-mail de Login
                  </label>
                  <input 
                    type="email" 
                    value={user.email}
                    disabled
                    className="w-full input-modern text-xs px-4 py-2.5 rounded-xl bg-[#070A12]/40 text-slate-500 cursor-not-allowed border-white/5"
                  />
                </div>

                {/* Telefone */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-350 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-500" /> Telefone (Opcional)
                  </label>
                  <input 
                    type="text" 
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                    className="w-full input-modern text-xs px-4 py-2.5 rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* --- ETAPA 2: MINHA VITRINE PÚBLICA --- */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Upload Foto da Vitrine */}
                <div className="flex items-center gap-4 p-4 bg-[#0b0c10]/40 rounded-2xl border border-white/5">
                  <div className="relative group">
                    <input 
                      type="file" 
                      ref={publicFileInputRef} 
                      onChange={handlePublicAvatarChange} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    <div 
                      onClick={() => !uploadingPublicAvatar && publicFileInputRef.current?.click()}
                      className="w-16 h-16 rounded-2xl overflow-hidden bg-[#101827] border border-white/10 flex items-center justify-center cursor-pointer relative"
                    >
                      {uploadingPublicAvatar ? (
                        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                      ) : publicAvatarUrl ? (
                        <img src={publicAvatarUrl} alt="Foto Vitrine" className="w-full h-full object-cover" />
                      ) : (
                        <Globe className="w-7 h-7 text-slate-500" />
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                        <Camera className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-200">Logo/Foto da Vitrine (Opcional)</p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">Se não carregar, usaremos sua foto pessoal.</p>
                    <button 
                      type="button"
                      onClick={() => publicFileInputRef.current?.click()}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 mt-1"
                    >
                      Carregar Foto
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Nome da Vitrine */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350">Nome de Exibição da Vitrine *</label>
                    <input 
                      type="text" 
                      value={publicName}
                      onChange={e => setPublicName(e.target.value)}
                      placeholder="Ex: Super Promoções"
                      className="w-full input-modern text-xs px-4 py-2.5 rounded-xl"
                      required
                    />
                  </div>

                  {/* Slug / Username */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350">Link Público (Slug) *</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={username}
                        onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                        placeholder="meucanal"
                        maxLength={30}
                        className="w-full input-modern text-xs pl-3 pr-8 py-2.5 rounded-xl font-mono"
                        required
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {usernameStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
                        {usernameStatus === 'available' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        {usernameStatus === 'taken' && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                        {usernameStatus === 'invalid' && username.length > 0 && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                        {usernameStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                      </div>
                    </div>
                    {usernameStatus === 'invalid' && username.length > 0 && username.length < 3 && (
                      <p className="text-[10px] text-amber-500 mt-1">Use pelo menos 3 caracteres.</p>
                    )}
                    {usernameStatus === 'taken' && (
                      <p className="text-[10px] text-rose-500 mt-1">Este link já está em uso.</p>
                    )}
                    {usernameStatus === 'error' && (
                      <p className="text-[10px] text-rose-500 mt-1">Não foi possível verificar o link agora. Tente novamente.</p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-350 flex items-center gap-1.5">
                    <AlignLeft className="w-3.5 h-3.5 text-slate-500" /> Bio / Descrição (Máx. 200 caracteres)
                  </label>
                  <textarea 
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Conte o que seus visitantes vão encontrar no seu catálogo..."
                    maxLength={200}
                    rows={2}
                    className="w-full input-modern text-xs px-4 py-2 rounded-xl resize-none"
                  />
                  <p className="text-[9px] text-slate-500 text-right">{bio.length}/200</p>
                </div>

                {/* Links dos Canais */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Canais Sociais na Vitrine (Links de Grupos/Canais)</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* WhatsApp URL */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-emerald-400">Grupo WhatsApp</label>
                      <input 
                        type="text" 
                        value={whatsappGroupUrl}
                        onChange={e => { setWhatsappGroupUrl(e.target.value); setWhatsappError(false); }}
                        placeholder="chat.whatsapp.com/..."
                        className={`w-full input-modern text-xs px-3 py-2 rounded-xl ${whatsappError ? 'border-red-500 focus:border-red-500 bg-red-950/10' : ''}`}
                      />
                      {whatsappError && <span className="text-[9px] text-red-500">Link WhatsApp inválido</span>}
                    </div>

                    {/* Telegram URL */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-sky-400">Grupo/Canal Telegram</label>
                      <input 
                        type="text" 
                        value={telegramGroupUrl}
                        onChange={e => { setTelegramGroupUrl(e.target.value); setTelegramError(false); }}
                        placeholder="t.me/..."
                        className={`w-full input-modern text-xs px-3 py-2 rounded-xl ${telegramError ? 'border-red-500 focus:border-red-500 bg-red-950/10' : ''}`}
                      />
                      {telegramError && <span className="text-[9px] text-red-500">Link Telegram inválido</span>}
                    </div>

                    {/* Discord URL */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-400">Convite Discord</label>
                      <input 
                        type="text" 
                        value={discordGroupUrl}
                        onChange={e => { setDiscordGroupUrl(e.target.value); setDiscordError(false); }}
                        placeholder="discord.gg/..."
                        className={`w-full input-modern text-xs px-3 py-2 rounded-xl ${discordError ? 'border-red-500 focus:border-red-500 bg-red-950/10' : ''}`}
                      />
                      {discordError && <span className="text-[9px] text-red-500">Link Discord inválido</span>}
                    </div>
                  </div>
                </div>

                {/* Tema Visual */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-350">Tema de Cores da Vitrine</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'default', name: 'Clássico', color: 'bg-[#7C3AED]' },
                      { id: 'indigo', name: 'Índigo', color: 'bg-indigo-650' },
                      { id: 'emerald', name: 'Esmeralda', color: 'bg-emerald-650' },
                      { id: 'dark', name: 'Dark/Escuro', color: 'bg-zinc-800' },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id)}
                        className={`py-1.5 rounded-xl border text-center transition-all ${
                          theme === t.id 
                            ? 'border-indigo-500 bg-indigo-600/20' 
                            : 'border-white/5 bg-[#0B1020]/50 hover:bg-[#101827]/50'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full mx-auto mb-1 ${t.color}`} />
                        <span className="text-[9px] font-bold text-slate-300">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rodapé de Ações do Formulário */}
          <div className="flex gap-4 mt-6 pt-4 border-t border-white/5">
            {step === 2 && (
              <button
                type="button"
                onClick={handlePrevStep}
                className="btn-secondary px-5 py-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs text-slate-300 font-bold"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            )}

            {step === 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={!fullName.trim()}
                className="flex-1 btn-gradient flex items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-xs shadow-lg shadow-indigo-950/40 disabled:opacity-50"
              >
                Continuar para Vitrine <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || usernameStatus !== 'available' || !publicName.trim() || uploadingPublicAvatar}
                className="flex-1 btn-gradient flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-xs shadow-lg shadow-indigo-950/40 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Concluindo setup...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Concluir e Acessar Painel
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Lado Direito: Live Preview (Celular Mockup) */}
        <div className="hidden md:flex w-[380px] bg-[#0B1020]/30 p-6 flex-col justify-center items-center relative overflow-hidden border-l border-white/5">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-950/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-950/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 w-full max-w-[280px] rounded-[36px] border-[8px] border-slate-900 bg-[#070A12] shadow-2xl overflow-hidden aspect-[9/18] flex flex-col justify-between">
            
            {/* Celular Tela Interna */}
            <div className="flex-1 flex flex-col overflow-y-auto scrollbar-hide">
              {/* Top Banner de acordo com o tema */}
              <div className={`h-24 ${themePreviewStyles[theme] || 'bg-indigo-650'} relative p-4 flex flex-col justify-end transition-colors duration-300`}>
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-3 bg-black rounded-full" />
                <div className="flex items-center gap-2 -mb-8 z-10">
                  <div className="w-12 h-12 rounded-lg border-2 border-white/10 shadow-md overflow-hidden bg-[#101827] flex-shrink-0 flex items-center justify-center">
                    <Avatar 
                      src={publicAvatarUrl || avatarUrl} 
                      name={publicName || fullName || 'Vitrine'} 
                      size="lg" 
                    />
                  </div>
                </div>
              </div>

              {/* Informações da Vitrine */}
              <div className="pt-9 px-3 pb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-[11px] font-bold text-white truncate max-w-[150px]">
                    {publicName || 'Minha Vitrine'}
                  </h4>
                  <span className="inline-flex items-center bg-indigo-500/10 text-indigo-400 text-[7px] font-bold px-1 py-0.5 rounded">
                    <Star className="w-2 h-2 fill-current mr-0.5" /> Verificado
                  </span>
                </div>
                <p className="text-[8px] text-slate-500 font-mono">linkoferta.vercel.app/u/{username || 'slug'}</p>
                
                <p className="text-[10px] text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                  {bio || 'Sua descrição aparecerá aqui. Adicione uma bio informativa para seus visitantes.'}
                </p>

                {/* Botões dos Canais Sociais Simulados (Preview) */}
                {(whatsappGroupUrl || telegramGroupUrl || discordGroupUrl) && (
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    {whatsappGroupUrl && (
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-bold px-2 py-0.5 rounded-full">
                        🟢 WhatsApp
                      </span>
                    )}
                    {telegramGroupUrl && (
                      <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[8px] font-bold px-2 py-0.5 rounded-full">
                        🔵 Telegram
                      </span>
                    )}
                    {discordGroupUrl && (
                      <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[8px] font-bold px-2 py-0.5 rounded-full">
                        🎮 Discord
                      </span>
                    )}
                  </div>
                )}

                {/* Linha Divisória */}
                <div className="my-3 border-t border-white/5" />

                {/* Filtro fictício */}
                <div className="flex items-center gap-1 mb-2.5 overflow-x-auto scrollbar-hide">
                  <span className="text-[7.5px] bg-[#101827] text-slate-350 border border-white/5 px-2 py-0.5 rounded-full font-bold">🛍 Todas</span>
                  <span className="text-[7.5px] text-slate-550 px-2 py-0.5 rounded-full font-semibold">🟡 Mercado Livre</span>
                </div>

                {/* Oferta fictícia */}
                <div className="border border-white/5 rounded-xl overflow-hidden shadow-sm flex flex-col bg-[#101827]">
                  <div className="h-16 bg-[#0B1020]/50 flex items-center justify-center text-slate-500 relative text-[9px] font-bold">
                    📱 Imagem do Produto
                    <div className="absolute top-1 left-1 bg-red-650 text-white text-[7px] font-bold px-1 rounded-full">-30%</div>
                  </div>
                  <div className="p-2">
                    <span className="text-[6px] bg-indigo-500/10 text-indigo-400 font-bold px-1 py-0.5 rounded">Amazon</span>
                    <h5 className="text-[9px] font-bold text-slate-100 mt-1 truncate">Smartphone de Última Geração</h5>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] font-bold text-white">R$ 1.999</span>
                      <span className="text-[8px] text-slate-500 line-through">R$ 2.999</span>
                    </div>
                    <div className={`w-full text-center text-[7.5px] font-bold text-white py-1 rounded-md mt-2 transition-colors ${themeAccentColors[theme] || 'bg-indigo-600'} flex items-center justify-center gap-1`}>
                      Acessar Oferta
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer do preview do celular */}
            <div className="py-2 bg-[#0B1020]/50 border-t border-white/5 text-center flex flex-col items-center">
              <span className="text-[7.5px] font-extrabold text-slate-350">Vitrine Link Oferta</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PublicPageSetupModal;
