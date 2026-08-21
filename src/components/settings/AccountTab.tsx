import React from 'react';
import { User as UserIcon, Camera, Loader2, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { APP_NAME } from '../../config/app';
import { Avatar } from '../ui/Avatar';
import { SettingsSection, Field } from './shared';
import type { SettingsProfileHook } from '../../hooks/useSettingsProfile';

interface AccountTabProps {
  profile: SettingsProfileHook;
}

export const AccountTab: React.FC<AccountTabProps> = ({ profile }) => {
  const {
    user,
    fullName, setFullName,
    preferredName, setPreferredName,
    phone, setPhone,
    avatarUrl,
    uploadingAvatar,
    avatarInputRef,
    handleAvatarChange,
  } = profile;

  if (!user) return null;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Configurações da Conta"
        description={`Suas informações internas e de contato no ${APP_NAME}`}
        icon={UserIcon}
      >
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
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
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

        <div className="pt-4 border-t border-white/5">
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Tem certeza que deseja sair da conta?')) {
                await supabase.auth.signOut();
                window.location.href = '/login';
              }
            }}
            className="btn-secondary hover:bg-rose-950/20 hover:text-rose-400 hover:border-rose-900/50 transition-colors text-xs px-4 py-2 flex items-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair da Conta
          </button>
        </div>
      </SettingsSection>
    </div>
  );
};
