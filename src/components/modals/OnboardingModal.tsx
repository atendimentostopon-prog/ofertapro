import React, { useState } from 'react';
import { Sparkles, ArrowRight, User as UserIcon, Globe, FileText, Loader2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { compressImage, uploadOfferImage } from '../../lib/image-utils';
import { FeedbackService } from '../../services/FeedbackService';
import { Avatar } from '../ui/Avatar';

interface OnboardingModalProps {
  onComplete: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const { user, refreshProfile } = useUser();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [username, setUsername] = useState(user?.username?.split('_')[0] || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Higieniza o username (apenas letras, números, hífen e underline, tudo minúsculo)
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');
    setUsername(value);
    setError(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      if (!user) throw new Error('Usuário não autenticado');

      // Otimização e compressão
      const compressed = await compressImage(file);
      
      // Upload para o bucket public do Supabase
      const publicUrl = await uploadOfferImage(compressed, user.id);
      setAvatarUrl(publicUrl);
    } catch (err: any) {
      console.error('Erro no upload do avatar:', err);
      // Registrar log de erro de upload
      await FeedbackService.logEvent({
        event_type: 'erro_upload_avatar',
        message: `Falha no upload do avatar do perfil: ${err.message || String(err)}`,
        metadata: { error: err.message || String(err) }
      });
      setError(err.message || 'Erro ao carregar avatar. Tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Por favor, insira seu nome completo.');
      return;
    }
    if (!username.trim() || username.length < 3) {
      setError('O slug público deve ter no mínimo 3 caracteres.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!user) throw new Error('Usuário não autenticado');

      // 1. Verificar se o username (public_url) já existe para outro usuário
      const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('public_url', username)
          .neq('id', user.id)
          .maybeSingle();

      if (checkError) throw checkError;
      if (existingUser) {
        setError('Este endereço (slug) já está em uso por outro usuário. Tente outro.');
        setLoading(false);
        return;
      }

      // 2. Criar ou atualizar perfil com onboarded = true (upsert)
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName.trim(),
          public_name: fullName.trim(),
          username: username.trim(),
          public_url: username.trim(),
          bio: bio.trim(),
          avatar_url: avatarUrl,
          public_avatar_url: avatarUrl,
          onboarded: true,
          updated_at: new Date().toISOString()
        });

      if (updateError) throw updateError;

      // Registrar evento de onboarding completo
      await FeedbackService.logEvent({
        event_type: 'onboarding_completo',
        message: `Usuário ${user.email} completou o onboarding da vitrina`,
        metadata: { username: username.trim(), full_name: fullName.trim() }
      });

      setSuccess(true);
      await refreshProfile();
      setTimeout(() => {
        onComplete();
      }, 1200);
    } catch (err: any) {
      console.error('Erro no onboarding:', err);
      // Registrar evento de erro no onboarding
      await FeedbackService.logEvent({
        event_type: 'onboarding_erro',
        message: `Erro ao salvar perfil no onboarding: ${err.message || String(err)}`,
        metadata: { error: err.message || String(err) }
      });
      setError(err.message || 'Falha ao salvar perfil. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#101827] w-full max-w-lg rounded-3xl shadow-2xl border border-white/[0.08] overflow-hidden animate-slide-up my-auto">
        
        {/* Banner Decorativo */}
        <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 p-8 text-white text-center">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 border border-white/25 rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Seja Bem-vindo ao OfertaPro
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Configure sua conta em segundos</h2>
            <p className="text-sm text-indigo-100 max-w-sm mx-auto">
              Defina como seus clientes verão sua vitrine de ofertas públicas na internet.
            </p>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 font-semibold">
              ⚠️ {error}
            </div>
          )}

          {success ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg animate-pulse">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-[#F8FAFC]">Tudo pronto!</h3>
                <p className="text-xs text-[#94A3B8] mt-1">Seu painel está sendo liberado...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Upload de Avatar */}
              <div className="flex items-center gap-4 bg-[#162033] p-4 rounded-2xl border border-white/5">
                <div className="relative w-16 h-16 rounded-2xl bg-[#101827] border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group shadow-inner">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-8 h-8 text-[#64748B]" />
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-[#F8FAFC]">Foto de Perfil</p>
                  <p className="text-[10px] text-[#94A3B8] mt-0.5">Clique para carregar uma imagem quadrada</p>
                  <label className="inline-block mt-2 text-[11px] font-bold text-[#F8FAFC] hover:text-white cursor-pointer bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 shadow-sm transition-all">
                    Carregar Foto
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              {/* Nome Completo */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#94A3B8] flex items-center gap-1.5 uppercase tracking-wider">
                  <UserIcon className="w-3.5 h-3.5 text-[#64748B]" />
                  Nome de Exibição *
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="input-modern text-sm"
                  required
                />
              </div>

              {/* Username / Slug Público */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#94A3B8] flex items-center gap-1.5 uppercase tracking-wider">
                  <Globe className="w-3.5 h-3.5 text-[#64748B]" />
                  Endereço da sua Vitrine (Slug) *
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-bold text-[#64748B] select-none">
                    ofertapro.com/u/
                  </span>
                  <input
                    type="text"
                    placeholder="promocoes"
                    value={username}
                    onChange={handleUsernameChange}
                    className="input-modern text-sm pl-28 font-mono font-bold"
                    required
                    minLength={3}
                  />
                </div>
                <p className="text-[10px] text-[#64748B] leading-normal">
                  Este será o endereço da sua vitrine pública (ex: ofertapro.com/u/promocoes). Use apenas letras minúsculas, números e hífens.
                </p>
              </div>

              {/* Bio (Descrição Curta) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#94A3B8] flex items-center gap-1.5 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5 text-[#64748B]" />
                  Bio / Descrição do Perfil
                </label>
                <textarea
                  placeholder="Ex: Compartilho aqui as melhores ofertas de celulares e eletrônicos todos os dias!"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={2}
                  maxLength={160}
                  className="input-modern text-sm resize-none py-2.5"
                />
                <div className="flex justify-end text-[9px] text-[#64748B]">
                  {bio.length}/160 caracteres
                </div>
              </div>

              {/* Ações */}
              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full btn-gradient py-3.5 flex items-center justify-center gap-2 font-bold text-sm tracking-tight disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando Configurações...
                  </>
                ) : (
                  <>
                    Salvar e Acessar o Painel
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default OnboardingModal;
