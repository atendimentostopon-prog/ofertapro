import React, { useState } from 'react';
import {
  User, Link2, MessageSquare, Link, BarChart3, Save,
  Check, Copy, ExternalLink, Globe, Bell, Shield,
  CreditCard, ChevronRight, Palette
} from 'lucide-react';
import { mockUser } from '../data/mock';

const SettingsSection: React.FC<{
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, description, icon: Icon, children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-indigo-600" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {description && <p className="text-xs text-slate-400">{description}</p>}
      </div>
    </div>
    <div className="p-6 space-y-4">{children}</div>
  </div>
);

const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-slate-700">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

const Toggle: React.FC<{ label: string; description?: string; defaultChecked?: boolean }> = ({
  label, description, defaultChecked = false
}) => {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => setChecked(!checked)}
        className={`relative w-11 h-6 rounded-full transition-all duration-200 ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
};

const Settings: React.FC = () => {
  const [saved, setSaved] = useState(false);
  const [username, setUsername] = useState(mockUser.username);
  const [displayName, setDisplayName] = useState(mockUser.name);
  const [description, setDescription] = useState(mockUser.description || '');
  const [email, setEmail] = useState(mockUser.email);
  const [messageTemplate, setMessageTemplate] = useState(
    `🔥 *{nome_oferta}*\n\n💰 De {preco_original} por *{preco_promocional}*\n🏷 Cupom: *{cupom}*\n\n🔗 {link_afiliado}\n\n_OfertaPro — As melhores ofertas do dia!_`
  );
  const [shortener, setShortener] = useState('bitly');
  const [copied, setCopied] = useState(false);

  const publicUrl = `ofertapro.com/${username}`;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
          <p className="text-sm text-slate-500 mt-0.5">Personalize sua conta e preferências</p>
        </div>
        <button
          onClick={handleSave}
          className="btn-gradient flex items-center gap-2 text-sm px-4 py-2.5 shadow-lg shadow-indigo-200"
        >
          {saved ? <><Check className="w-4 h-4" /> Salvo!</> : <><Save className="w-4 h-4" /> Salvar</>}
        </button>
      </div>

      {/* Profile */}
      <SettingsSection title="Perfil Público" description="Como você aparece para seus seguidores" icon={User}>
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-400">
              <img
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}&backgroundColor=4f46e5`}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center">
              <Palette className="w-3 h-3 text-white" />
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{displayName}</p>
            <p className="text-xs text-slate-400">Clique no ícone para alterar a foto</p>
          </div>
        </div>

        <Field label="Nome de Exibição" hint="Como seu nome aparece na página pública">
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="input-modern"
          />
        </Field>

        <Field label="Descrição / Bio" hint="Apresente-se para seus seguidores (máx. 200 caracteres)">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            maxLength={200}
            className="input-modern resize-none"
            placeholder="Afiliado especializado em eletrônicos..."
          />
          <p className="text-xs text-slate-400 text-right">{description.length}/200</p>
        </Field>

        <Field label="E-mail">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input-modern"
          />
        </Field>
      </SettingsSection>

      {/* Public URL */}
      <SettingsSection title="Página Pública" description="URL personalizada para compartilhar suas ofertas" icon={Globe}>
        <Field label="Nome de usuário" hint="Apenas letras minúsculas, números e hífens. Ex: meu-usuario">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">
                ofertapro.com/
              </span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="input-modern pl-32"
              />
            </div>
          </div>
        </Field>

        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-indigo-600 font-medium flex-1">{publicUrl}</span>
          <button
            onClick={copyUrl}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
          >
            {copied ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </button>
          <a
            href={`/u/${username}`}
            target="_blank"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir
          </a>
        </div>
      </SettingsSection>

      {/* Message Template */}
      <SettingsSection title="Modelo de Mensagem" description="Template padrão usado no disparo de ofertas" icon={MessageSquare}>
        <Field
          label="Modelo padrão"
          hint="Use as variáveis: {nome_oferta}, {preco_original}, {preco_promocional}, {cupom}, {link_afiliado}"
        >
          <textarea
            value={messageTemplate}
            onChange={e => setMessageTemplate(e.target.value)}
            rows={6}
            className="input-modern resize-none font-mono text-xs"
          />
        </Field>

        {/* Preview */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">Prévia da mensagem:</p>
          <div className="whatsapp-bubble text-xs w-fit max-w-full">
            <p className="font-bold text-slate-700">🔥 iPhone 15 Pro Max 256GB</p>
            <p className="text-slate-600 mt-1">💰 De R$ 9.999 por <strong>R$ 7.499</strong></p>
            <p className="text-slate-600">🏷 Cupom: <strong>IPHONE15PRO</strong></p>
            <p className="text-blue-600 mt-1">🔗 ofertapro.com/l/abc123</p>
            <p className="text-slate-500 text-[10px] mt-1.5 italic">OfertaPro — As melhores ofertas do dia!</p>
          </div>
        </div>
      </SettingsSection>

      {/* Link Shortener */}
      <SettingsSection title="Encurtador de Links" description="Configure o encurtamento dos seus links de afiliado" icon={Link}>
        <Field label="Serviço de encurtamento">
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'bitly', label: 'bit.ly', desc: 'Gratuito' },
              { value: 'tinyurl', label: 'TinyURL', desc: 'Gratuito' },
              { value: 'custom', label: 'Domínio Próprio', desc: 'Pro ⭐' },
            ].map(s => (
              <button
                key={s.value}
                onClick={() => setShortener(s.value)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  shortener === s.value
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
        </Field>

        {shortener === 'custom' && (
          <Field label="Domínio personalizado" hint="Ex: links.meusite.com.br">
            <input type="text" placeholder="links.meusite.com.br" className="input-modern" />
          </Field>
        )}
      </SettingsSection>

      {/* Tracking */}
      <SettingsSection title="Tracking e Analytics" description="Preferências de rastreamento e métricas" icon={BarChart3}>
        <div className="space-y-3 divide-y divide-slate-100">
          <Toggle label="Rastreamento de cliques" description="Registre cada clique nos seus links de afiliado" defaultChecked />
          <div className="pt-3">
            <Toggle label="Notificações por e-mail" description="Receba resumos semanais de performance" defaultChecked />
          </div>
          <div className="pt-3">
            <Toggle label="Relatórios automáticos" description="Gere relatórios mensais automaticamente" />
          </div>
          <div className="pt-3">
            <Toggle label="Alertas de erros" description="Seja notificado quando um disparo falhar" defaultChecked />
          </div>
        </div>
      </SettingsSection>

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <Shield className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Zona de Perigo</h3>
            <p className="text-xs text-slate-400">Ações irreversíveis da conta</p>
          </div>
        </div>
        <div className="p-6 space-y-3">
          <button className="w-full flex items-center justify-between p-3 rounded-xl border border-red-200 hover:bg-red-50 transition-colors group">
            <div className="text-left">
              <p className="text-sm font-medium text-red-700">Excluir todas as ofertas</p>
              <p className="text-xs text-slate-400">Remove permanentemente todas suas ofertas cadastradas</p>
            </div>
            <ChevronRight className="w-4 h-4 text-red-400 group-hover:text-red-600" />
          </button>
          <button className="w-full flex items-center justify-between p-3 rounded-xl border border-red-200 hover:bg-red-50 transition-colors group">
            <div className="text-left">
              <p className="text-sm font-medium text-red-700">Desconectar todos os canais</p>
              <p className="text-xs text-slate-400">Remove a conexão com todos os grupos e canais</p>
            </div>
            <ChevronRight className="w-4 h-4 text-red-400 group-hover:text-red-600" />
          </button>
          <button className="w-full flex items-center justify-between p-3 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 transition-colors group">
            <div className="text-left">
              <p className="text-sm font-bold text-red-700">Excluir minha conta</p>
              <p className="text-xs text-slate-400">Esta ação é permanente e não pode ser desfeita</p>
            </div>
            <ChevronRight className="w-4 h-4 text-red-500 group-hover:text-red-700" />
          </button>
        </div>
      </div>

      {/* Save button bottom */}
      <div className="flex justify-end pb-4">
        <button onClick={handleSave} className="btn-gradient flex items-center gap-2 text-sm px-6 py-3 shadow-lg shadow-indigo-200">
          {saved ? <><Check className="w-4 h-4" /> Configurações salvas!</> : <><Save className="w-4 h-4" /> Salvar configurações</>}
        </button>
      </div>
    </div>
  );
};

export default Settings;
