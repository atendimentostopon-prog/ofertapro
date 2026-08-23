import React from 'react';
import { User as UserIcon, Globe, Camera, Loader2, ExternalLink } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { SettingsSection, Field } from './shared';
import type { SettingsProfileHook } from '../../hooks/useSettingsProfile';

interface PublicPageTabProps {
  profile: SettingsProfileHook;
}

export const PublicPageTab: React.FC<PublicPageTabProps> = ({ profile }) => {
  const {
    user,
    publicName, setPublicName,
    publicAvatarUrl,
    avatarUrl,
    uploadingPublicAvatar,
    publicAvatarInputRef,
    handlePublicAvatarChange,
    bio, setBio,
    username, setUsername,
    copied,
    copyUrl,
    publicTheme, setPublicTheme,
    isPublicActive, setIsPublicActive,
  } = profile;

  if (!user) return null;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Página de Vendas Pública"
        description="Aparência e informações visíveis na sua página de ofertas"
        icon={UserIcon}
      >
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
              className={`w-20 h-20 rounded-2xl overflow-hidden bg-surface-0 border transition-all duration-300 cursor-pointer ${
                uploadingPublicAvatar ? 'border-mint-500' : 'border-line-strong shadow-md group-hover:border-mint-500'
              }`}
            >
              {uploadingPublicAvatar ? (
                <div className="w-full h-full flex items-center justify-center bg-surface-1">
                  <Loader2 className="w-6 h-6 text-mint-700 animate-spin" />
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
            <h4 className="text-[13px] font-bold text-ink">Foto da Vitrine</h4>
            <p className="text-[11px] text-ink-secondary max-w-xs leading-normal">Carregue a foto que aparecerá no topo do seu catálogo público.</p>
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
          <p className="text-[10px] text-ink-tertiary text-right">{bio.length}/200</p>
        </Field>

        <Field label="Link de Acesso (URL Personalizada)">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-ink-tertiary font-mono select-none">
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

        <div className="flex flex-wrap items-center gap-3 p-3 bg-surface-1 rounded-xl border border-line">
          <Globe className="w-4 h-4 text-ink-tertiary" />
          <span className="text-xs text-mint-700 font-bold flex-1 truncate">{window.location.origin}/u/{username}</span>
          <button
            onClick={copyUrl}
            className="flex items-center gap-1 text-[11px] font-bold text-ink-secondary hover:text-mint-700 transition-colors"
          >
            {copied ? 'Copiado!' : 'Copiar Link'}
          </button>
          <a
            href={`/u/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-ink-secondary hover:text-mint-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Visualizar
          </a>
        </div>

        <Field label="Tema de Cores">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'default', name: 'Clássico', color: 'bg-[#7C3AED]' },
              { id: 'indigo', name: 'Índigo', color: 'bg-[#4F46E5]' },
              { id: 'emerald', name: 'Esmeralda', color: 'bg-[#10B981]' },
              { id: 'dark', name: 'Escuro/Dark', color: 'bg-graphite-800' },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPublicTheme(t.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-center transition-all ${
                  publicTheme === t.id
                    ? 'border-mint-500 bg-graphite/20 text-mint-800 shadow-sm'
                    : 'border-line bg-surface-1 text-ink-secondary hover:bg-surface-0/50'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full ${t.color}`} />
                <span className="text-[11px] font-bold">{t.name}</span>
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between py-2 border-t border-line mt-4 pt-4">
          <div>
            <p className="text-xs font-bold text-ink">Status da Página Pública</p>
            <p className="text-[11px] text-ink-secondary mt-0.5">Disponibilizar vitrine na internet.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsPublicActive(!isPublicActive)}
            className={`relative w-11 h-6 rounded-full transition-all duration-200 ${isPublicActive ? 'bg-mint-500' : 'bg-surface-2'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPublicActive ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </SettingsSection>
    </div>
  );
};
