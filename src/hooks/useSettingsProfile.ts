import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { compressImage, uploadAvatarImage } from '../lib/image-utils';

type SocialType = 'whatsapp' | 'telegram' | 'discord';

const formatAndValidateLink = (
  url: string,
  type: SocialType
): { valid: boolean; normalized: string } => {
  let val = url.trim();
  if (val === '') return { valid: true, normalized: '' };

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

export const useSettingsProfile = () => {
  const { user, refreshProfile } = useUser();
  const { toast } = useToast();

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const publicAvatarInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [phone, setPhone] = useState('');

  const [publicName, setPublicName] = useState('');
  const [publicAvatarUrl, setPublicAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [isPublicActive, setIsPublicActive] = useState(true);
  const [uploadingPublicAvatar, setUploadingPublicAvatar] = useState(false);
  const [publicTheme, setPublicTheme] = useState('default');

  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('');
  const [telegramGroupUrl, setTelegramGroupUrl] = useState('');
  const [discordGroupUrl, setDiscordGroupUrl] = useState('');

  const [whatsappError, setWhatsappError] = useState(false);
  const [telegramError, setTelegramError] = useState(false);
  const [discordError, setDiscordError] = useState(false);

  const [shortener, setShortener] = useState<string>(() => {
    return localStorage.getItem('link_shortener') || 'bitly';
  });
  const [copied, setCopied] = useState(false);

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
    }
  }, [user?.id]);

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
      toast('Erro ao carregar avatar. Tente novamente.', 'error');
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
      toast('Erro ao carregar foto pública. Tente novamente.', 'error');
    } finally {
      setUploadingPublicAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (!fullName.trim()) {
      toast('Nome da Conta é obrigatório.', 'warning');
      return;
    }
    if (!publicName.trim()) {
      toast('Nome Público da Vitrine é obrigatório.', 'warning');
      return;
    }
    if (!username.trim() || username.length < 3) {
      toast('Slug da vitrine é obrigatório e deve ter pelo menos 3 caracteres.', 'warning');
      return;
    }
    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    if (cleanUsername !== username) {
      toast('Slug inválido. Não use espaços ou caracteres especiais.', 'error');
      return;
    }

    const wppVal = formatAndValidateLink(whatsappGroupUrl, 'whatsapp');
    const telVal = formatAndValidateLink(telegramGroupUrl, 'telegram');
    const discVal = formatAndValidateLink(discordGroupUrl, 'discord');

    setWhatsappError(!wppVal.valid);
    setTelegramError(!telVal.valid);
    setDiscordError(!discVal.valid);

    if (!wppVal.valid || !telVal.valid || !discVal.valid) {
      toast('Por favor, corrija os links inválidos das redes sociais destacados.', 'warning');
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
          toast('Este slug já está em uso por outro usuário. Escolha outro.', 'warning');
          setSaving(false);
          return;
        }
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          preferred_name: preferredName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: avatarUrl || null,

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

          whatsapp_group_url: wppVal.normalized || null,
          telegram_group_url: telVal.normalized || null,
          discord_group_url: discVal.normalized || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      localStorage.setItem('link_shortener', shortener);

      await refreshProfile();

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('Erro ao salvar configurações:', err);
      toast(`Erro: ${err.message || 'Falha ao salvar configurações.'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return {
    user,
    saved,
    saving,
    uploadingAvatar,
    uploadingPublicAvatar,
    avatarInputRef,
    publicAvatarInputRef,

    username, setUsername,
    fullName, setFullName,
    avatarUrl, setAvatarUrl,
    preferredName, setPreferredName,
    phone, setPhone,

    publicName, setPublicName,
    publicAvatarUrl, setPublicAvatarUrl,
    bio, setBio,
    isPublicActive, setIsPublicActive,
    publicTheme, setPublicTheme,

    whatsappGroupUrl, setWhatsappGroupUrl,
    telegramGroupUrl, setTelegramGroupUrl,
    discordGroupUrl, setDiscordGroupUrl,

    whatsappError, setWhatsappError,
    telegramError, setTelegramError,
    discordError, setDiscordError,

    shortener, setShortener,
    copied,

    handleAvatarChange,
    handlePublicAvatarChange,
    handleSave,
    copyUrl,
  };
};

export type SettingsProfileHook = ReturnType<typeof useSettingsProfile>;
