import React from 'react';
import { Link2 } from 'lucide-react';
import { SettingsSection, Field } from './shared';
import type { SettingsProfileHook } from '../../hooks/useSettingsProfile';

interface LinksTabProps {
  profile: SettingsProfileHook;
}

export const LinksTab: React.FC<LinksTabProps> = ({ profile }) => {
  const {
    whatsappGroupUrl, setWhatsappGroupUrl, whatsappError, setWhatsappError,
    telegramGroupUrl, setTelegramGroupUrl, telegramError, setTelegramError,
    discordGroupUrl, setDiscordGroupUrl, discordError, setDiscordError,
  } = profile;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Links Públicos da Vitrine"
        description="Configure os links de convite para os seus canais e grupos de ofertas"
        icon={Link2}
      >
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
  );
};
