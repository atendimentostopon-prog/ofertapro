import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare, Save, Loader2, AlertCircle, Sparkles, CheckCircle2, Link2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Toggle } from '../ui/Toggle';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { APP_NAME } from '../../config/app';
import { TemplateService } from '../../services/TemplateService';
import { sendTelegramPhoto } from '../../lib/telegram';
import { sender } from '../../lib/sender';
import { getPlanLimits } from '../../config/plans';
import { normalizeMarketplace } from '../../lib/marketplace';
import { SettingsSection, Field } from './shared';

type ChannelKind = 'whatsapp' | 'telegram' | 'discord';

interface TemplatesTabProps {
  onUpgradeClick?: () => void;
}

const mockOffer = {
  name: 'Notebook ASUS Vivobook 15',
  originalPrice: '3000.00',
  salePrice: '2499.00',
  discount: 17,
  coupon: 'CUPOM10',
  marketplace: 'amazon',
  category: 'Informática',
  affiliate_link: 'https://amzn.to/exemplo',
  affiliateLink: 'https://amzn.to/exemplo',
};

export const TemplatesTab: React.FC<TemplatesTabProps> = ({ onUpgradeClick }) => {
  const { user } = useUser();
  const { toast } = useToast();

  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [telegramTemplate, setTelegramTemplate] = useState('');
  const [discordTemplate, setDiscordTemplate] = useState('');
  const [currentEditingTemplateTab, setCurrentEditingTemplateTab] = useState<ChannelKind>('whatsapp');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [templatesSaved, setTemplatesSaved] = useState(false);
  const [restoringTemplate, setRestoringTemplate] = useState(false);
  const [testingTemplate, setTestingTemplate] = useState(false);
  const [useOwnShortener, setUseOwnShortener] = useState(true);
  const [savingShortener, setSavingShortener] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadTemplates = async () => {
    if (!user) return;
    try {
      setLoadingTemplates(true);
      const templates = await TemplateService.getTemplates(user.id);
      setWhatsappTemplate(templates.whatsapp || TemplateService.getDefaultTemplate('whatsapp'));
      setTelegramTemplate(templates.telegram || TemplateService.getDefaultTemplate('telegram'));
      setDiscordTemplate(templates.discord || TemplateService.getDefaultTemplate('discord'));
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
      setWhatsappTemplate(TemplateService.getDefaultTemplate('whatsapp'));
      setTelegramTemplate(TemplateService.getDefaultTemplate('telegram'));
      setDiscordTemplate(TemplateService.getDefaultTemplate('discord'));
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadTemplates();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_settings')
      .select('use_own_shortener')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar preferência de encurtador:', error);
          return;
        }
        // Sem linha em user_settings (usuário nunca salvou nada ali) ou
        // coluna null -> mantém o default true, igual à Edge Function.
        if (data && data.use_own_shortener === false) {
          setUseOwnShortener(false);
        }
      });
  }, [user?.id]);

  const handleToggleShortener = async (next: boolean) => {
    if (!user) return;
    setUseOwnShortener(next);
    setSavingShortener(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, use_own_shortener: next }, { onConflict: 'user_id' });
      if (error) throw error;
      toast(next ? 'Encurtador próprio ativado.' : 'Encurtador próprio desativado.', 'success');
    } catch (err: any) {
      console.error('Erro ao salvar preferência de encurtador:', err);
      setUseOwnShortener(!next);
      toast('Não foi possível salvar essa preferência. Tente novamente.', 'error');
    } finally {
      setSavingShortener(false);
    }
  };

  const getActiveTemplateContent = () => {
    if (currentEditingTemplateTab === 'whatsapp') return whatsappTemplate;
    if (currentEditingTemplateTab === 'telegram') return telegramTemplate;
    return discordTemplate;
  };

  const getActiveTemplatePlaceholder = () => {
    return TemplateService.getDefaultTemplate(currentEditingTemplateTab);
  };

  const handleSaveTemplates = async () => {
    if (!user) return;
    const currentTemplate = (
      currentEditingTemplateTab === 'whatsapp' ? whatsappTemplate
      : currentEditingTemplateTab === 'telegram' ? telegramTemplate
      : discordTemplate
    ) || TemplateService.getDefaultTemplate(currentEditingTemplateTab);
    const validation = TemplateService.validateTemplate(currentTemplate);
    if (!validation.valid) {
      toast(`Erro no template de ${currentEditingTemplateTab}: ${validation.error}`, 'error');
      return;
    }
    setSavingTemplates(true);

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
      toast(`Erro ao salvar template: ${err.message || 'Tente novamente.'}`, 'error');
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

  const handleTestTemplate = async () => {
    if (!user) return;
    try {
      setTestingTemplate(true);
      const { data: channels, error } = await supabase
        .from('channels')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', currentEditingTemplateTab)
        .eq('status', 'connected');

      if (error) throw error;

      if (!channels || channels.length === 0) {
        toast(`Você não possui nenhum canal de ${currentEditingTemplateTab === 'telegram' ? 'Telegram' : currentEditingTemplateTab === 'discord' ? 'Discord' : 'WhatsApp'} conectado e ativo. Conecte um canal para realizar o disparo de teste.`, 'warning');
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
        username: user.username || 'bestpromos',
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
          affiliateLink: trackingLink,
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
        const mockOfferData = {
          name: mockOffer.name,
          description: 'Disparo de teste do WhatsApp',
          image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500',
          original_price: parseFloat(mockOffer.originalPrice) * 100,
          sale_price: parseFloat(mockOffer.salePrice) * 100,
          discount: mockOffer.discount,
          coupon: mockOffer.coupon || null,
          affiliate_link: trackingLink,
          marketplace: normalizeMarketplace(mockOffer.marketplace),
          category: 'Outros',
          status: 'draft',
          user_id: user.id,
        };

        console.log('[TEST_TEMPLATE_PAYLOAD]', {
          marketplaceOriginal: mockOffer.marketplace,
          marketplaceNormalized: normalizeMarketplace(mockOffer.marketplace),
          channel: channel.name,
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
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              offer_id: tempOffer.id,
              channel_ids: [channel.id],
            }),
          });

          const responseData = await response.json();
          supabase.from('offers').delete().eq('id', tempOffer.id).then(() => {});

          if (!response.ok || !responseData.success) {
            throw new Error(responseData?.error || responseData?.message || `Erro ao testar envio do WhatsApp: ${response.statusText}`);
          }
        } catch (dispatchErr) {
          supabase.from('offers').delete().eq('id', tempOffer.id).then(() => {});
          throw dispatchErr;
        }
      }

      toast(`Mensagem de teste enviada com sucesso para o canal "${channel.name}"! 🚀`, 'success');
    } catch (err: any) {
      console.error('[TEST_TEMPLATE_ERROR_DEBUG]:', err);
      toast('Não foi possível enviar o teste. Verifique os dados do template e tente novamente.', 'error');
    } finally {
      setTestingTemplate(false);
    }
  };

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

  const limits = getPlanLimits(user?.plan);

  const activeContent = getActiveTemplateContent();
  const activePlaceholder = getActiveTemplatePlaceholder();
  const mockProfile = {
    full_name: user?.full_name || 'Contato Givaldo',
    preferred_name: user?.preferred_name || 'Contato Givaldo',
    public_name: user?.publicName || user?.public_display_name || 'Best Promos',
    public_display_name: user?.public_display_name || 'Best Promos',
    username: user?.username || 'bestpromos',
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
    <div className="space-y-6">
      <SettingsSection
        title="Templates de Mensagem"
        description="Personalize a mensagem de envio para cada canal utilizando variáveis dinâmicas"
        icon={MessageSquare}
      >
        {!limits.customTemplates && (
          <div className="p-4 bg-ice border border-mint-200 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left mb-4">
            <div className="w-10 h-10 rounded-xl bg-surface-0 border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-bold text-ink">Customização disponível no plano Starter! 🚀</h4>
              <p className="text-[11px] text-ink-secondary font-medium">Faça o upgrade para personalizar as mensagens enviadas para os canais de disparo.</p>
            </div>
            <button
              onClick={onUpgradeClick}
              className="bg-graphite hover:bg-graphite-800 text-ink-inverse font-bold px-4 py-2 rounded-xl text-[11px] transition-colors flex-shrink-0"
            >
              Fazer Upgrade
            </button>
          </div>
        )}

        <div className="p-4 bg-surface-1 rounded-2xl border border-line space-y-2 mb-2">
          <p className="text-[11.5px] text-ink-secondary font-medium leading-relaxed">
            ℹ️ <strong>Como funciona:</strong> Personalize como suas ofertas serão enviadas para cada canal. Use variáveis como <code className="bg-surface-2 px-1 py-0.5 rounded text-mint-700 font-mono text-[10px]">{`{titulo}`}</code>, <code className="bg-surface-2 px-1 py-0.5 rounded text-mint-700 font-mono text-[10px]">{`{preco_promocional}`}</code> e <code className="bg-surface-2 px-1 py-0.5 rounded text-mint-700 font-mono text-[10px]">{`{link}`}</code>. Campos vazios são ocultados automaticamente quando você usa variáveis inteligentes como <code className="bg-surface-2 px-1 py-0.5 rounded text-mint-700 font-mono text-[10px]">{`{cupom_linha}`}</code>.
          </p>
          <p className="text-[11.5px] text-warning-ink font-medium">
            ⚠️ <strong>Aviso:</strong> Cada canal tem regras próprias de formatação. Você pode usar comandos simples como <strong>**negrito**</strong>, <em>_itálico_</em>, <del>~riscado~</del> e <a>[texto]({`{link}`})</a>. O {APP_NAME} converte automaticamente para Telegram, Discord e WhatsApp.
          </p>
          <p className="text-[11.5px] text-warning-ink font-medium">
            ⚠️ A variável <code className="bg-surface-2 px-1 py-0.5 rounded text-mint-700 font-mono text-[10px]">{`{link}`}</code> usa o link de afiliado direto cadastrado na oferta.
          </p>
        </div>

        <div className="w-full overflow-x-auto scrollbar-none mb-4">
          <div className="tab-container flex-nowrap min-w-max p-1.5 gap-1 max-w-max">
            {[
              { id: 'whatsapp', label: 'WhatsApp 💬' },
              { id: 'telegram', label: 'Telegram ✈️' },
              { id: 'discord', label: 'Discord 🎮' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrentEditingTemplateTab(tab.id as ChannelKind)}
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
                    if (!limits.customTemplates) return;
                    if (currentEditingTemplateTab === 'whatsapp') setWhatsappTemplate(e.target.value);
                    else if (currentEditingTemplateTab === 'telegram') setTelegramTemplate(e.target.value);
                    else setDiscordTemplate(e.target.value);
                  }}
                  disabled={!limits.customTemplates || loadingTemplates}
                  rows={10}
                  className={`input-modern resize-none font-mono text-xs ${!limits.customTemplates ? 'bg-surface-1 cursor-not-allowed text-ink-tertiary' : ''}`}
                />
              </div>
            </Field>

            <div className="flex justify-between items-center text-[10px] text-ink-tertiary font-bold px-1">
              <span>Caracteres no template: {activeContent.length}</span>
              <span>Preview aproximado: {renderedPreview.length} caracteres</span>
            </div>

            {!validation.valid && validation.error && (
              <div className="flex items-center gap-2 p-2.5 bg-danger-bg border border-danger/20 rounded-xl text-danger-ink text-[11px] font-bold">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{validation.error}</span>
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-ink-secondary mb-2">Formatação Rápida:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'bold', label: 'Negrito 🌟', title: 'Negrito (**texto**)' },
                  { id: 'italic', label: 'Itálico 💫', title: 'Itálico (_texto_)' },
                  { id: 'strike', label: 'Riscado ❌', title: 'Riscado (~texto~)' },
                  { id: 'link', label: 'Link Comprar 🔗', title: 'Link ([Comprar agora]({link}))' },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => limits.customTemplates && injectFormat(f.id as any)}
                    className={`px-3 py-1.5 rounded-lg border border-line bg-surface-1 hover:border-mint-300 hover:bg-surface-2 text-[10px] font-bold text-ink-secondary transition-all ${
                      !limits.customTemplates ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={f.title}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-ink-secondary mb-2">Variáveis Disponíveis:</p>
              <div className="flex flex-wrap gap-1.5">
                {TemplateService.listAvailableVariables().map(v => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => limits.customTemplates && injectVariable(v.name)}
                    className={`px-2.5 py-1.5 rounded-lg border border-line bg-surface-1 hover:border-mint-300 hover:bg-surface-2 text-[10px] font-bold text-ink-secondary flex items-center transition-all ${
                      !limits.customTemplates ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={v.description}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1.5">
              <button
                type="button"
                disabled={!limits.customTemplates || loadingTemplates || restoringTemplate || savingTemplates}
                onClick={handleRestoreDefaultTemplate}
                className="px-3.5 py-2 border border-line hover:border-line-strong hover:bg-surface-1 rounded-xl text-[11px] font-bold text-ink-secondary bg-surface-0 transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {restoringTemplate ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Restaurar Padrão
              </button>

              <button
                type="button"
                disabled={!limits.customTemplates || loadingTemplates || testingTemplate || !TemplateService.validateTemplate(getActiveTemplateContent() || getActiveTemplatePlaceholder()).valid}
                onClick={handleTestTemplate}
                className="px-3.5 py-2 bg-ice hover:bg-mint-100 border border-mint-200 hover:border-mint-300 text-mint-700 text-[11px] font-bold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="ml-auto px-4 py-2 bg-graphite hover:bg-graphite-800 text-ink-inverse text-[11px] font-bold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingTemplates ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : templatesSaved ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-mint-400" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {templatesSaved ? 'Template Salvo!' : savingTemplates ? 'Salvando...' : 'Salvar Template'}
              </button>
            </div>
          </div>

          <div className="md:col-span-4 space-y-3 bg-surface-1 rounded-xl p-4 border border-line flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-extrabold text-ink-tertiary uppercase tracking-wider mb-2.5">Preview no Canal</p>

              <div className={`text-xs max-w-full min-h-[160px] flex flex-col justify-start bg-surface-0 border border-line p-3.5 shadow-xs rounded-xl text-ink-secondary ${
                currentEditingTemplateTab === 'discord' ? 'border-l-4 border-l-mint-500' : ''
              }`}>
                {currentEditingTemplateTab === 'discord' && (
                  <div className="text-[11px] font-bold text-mint-700 mb-1.5 truncate">
                    {mockOffer.name}
                  </div>
                )}
                {currentEditingTemplateTab === 'telegram' ? (
                  <div
                    className="text-[10.5px] leading-relaxed whitespace-pre-wrap select-text select-all"
                    dangerouslySetInnerHTML={{ __html: renderedPreview }}
                  />
                ) : (
                  <p className="text-[10.5px] leading-relaxed whitespace-pre-wrap select-text select-all">
                    {renderedPreview}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[9.5px] text-ink-tertiary font-medium text-center leading-normal">As variáveis serão preenchidas com dados da oferta em runtime.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Link de Afiliado"
        description="Escolha qual link é enviado nos disparos automáticos das suas ofertas"
        icon={Link2}
      >
        <Toggle
          id="use-own-shortener"
          label="Usar encurtador próprio (aflyo.com.br/o/...)"
          description={
            useOwnShortener
              ? 'Os links enviados nos canais contam clique no seu painel (Dashboard e Ofertas). Recomendado.'
              : 'Os links são encurtados por um serviço externo (is.gd) e não contam clique no seu painel.'
          }
          checked={useOwnShortener}
          onChange={handleToggleShortener}
          disabled={savingShortener}
        />
      </SettingsSection>
    </div>
  );
};
