import React from 'react';
import { User as UserIcon, Globe, Camera, Loader2, ExternalLink } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { SettingsSection, Field } from './shared';
import { getShortlinkHost, getShortlinkUrl } from '../../config/app';
import type { SettingsProfileHook } from '../../hooks/useSettingsProfile';

interface PublicPageTabProps {
  profile: SettingsProfileHook;
}

const THEMES = [
  { id: 'default', name: 'Clássico', color: 'bg-[#7C3AED]' },
  { id: 'indigo', name: 'Índigo', color: 'bg-[#4F46E5]' },
  { id: 'blue', name: 'Azul', color: 'bg-[#2563EB]' },
  { id: 'emerald', name: 'Esmeralda', color: 'bg-[#10B981]' },
  { id: 'rose', name: 'Rosa', color: 'bg-[#DB2777]' },
  { id: 'orange', name: 'Laranja', color: 'bg-[#EA580C]' },
  { id: 'dark', name: 'Escuro', color: 'bg-graphite-800' },
];

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
        title="Vitrine pública"
        description="Aparência e informações visíveis na sua página de ofertas"
        icon={UserIcon}
      >
        <div className="flex items-center gap-5">
          <div
            className="relative group w-20 h-20 flex-shrink-0 cursor-pointer"
            onClick={() => !uploadingPublicAvatar && publicAvatarInputRef.current?.click()}
          >
            <input
              type="file"
              ref={publicAvatarInputRef}
              onChange={handlePublicAvatarChange}
              accept="image/*"
              className="hidden"
            />
            <div
              className={`w-20 h-20 rounded-2xl overflow-hidden bg-surface-0 border transition-colors duration-200 ${
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
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            {!uploadingPublicAvatar && (
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <h4 className="text-[13px] font-bold text-ink">Foto da Vitrine</h4>
            <p className="text-[11px] text-ink-secondary max-w-xs leading-normal">
              Carregue a foto que aparecerá no topo do seu catálogo público.
            </p>
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
          <div className="flex items-stretch rounded-xl border border-line bg-surface-0 overflow-hidden focus-within:border-mint-400 focus-within:shadow-[0_0_0_3px_rgba(94,231,165,0.28)] transition-colors">
            <span className="flex items-center pl-3.5 pr-1.5 text-xs text-ink-tertiary font-mono select-none whitespace-nowrap">
              {getShortlinkHost()}/
            </span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="flex-1 min-w-0 text-xs font-mono py-2.5 pr-3.5 bg-transparent outline-none border-0"
              required
            />
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-3 p-3 bg-surface-1 rounded-xl border border-line">
          <Globe className="w-4 h-4 text-ink-tertiary flex-shrink-0" />
          <span className="text-xs text-mint-700 font-bold flex-1 min-w-0 truncate">{getShortlinkHost()}/{username}</span>
          <button
            onClick={copyUrl}
            className="flex items-center gap-1 text-[11px] font-bold text-ink-secondary hover:text-mint-700 transition-colors"
          >
            {copied ? 'Copiado!' : 'Copiar Link'}
          </button>
          <a
            href={`${getShortlinkUrl()}/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-ink-secondary hover:text-mint-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Visualizar
          </a>
        </div>

        <Field label="Tema de Cores">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))' }}
          >
            {THEMES.map(t => {
              const selected = publicTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPublicTheme(t.id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                    selected
                      ? 'border-mint-500 bg-ice text-ink shadow-sm ring-1 ring-mint-500/40'
                      : 'border-line bg-surface-1 text-ink-secondary hover:border-line-strong hover:bg-surface-2'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${t.color}`} />
                  <span className="text-[11px] font-bold truncate">{t.name}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex items-center justify-between gap-4 border-t border-line mt-4 pt-4">
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink">Status da Página Pública</p>
            <p className="text-[11px] text-ink-secondary mt-0.5">Disponibilizar a vitrine na internet.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isPublicActive}
            aria-label="Status da página pública"
            onClick={() => setIsPublicActive(!isPublicActive)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${isPublicActive ? 'bg-mint-500' : 'bg-surface-3'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPublicActive ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </SettingsSection>
    </div>
  );
};
