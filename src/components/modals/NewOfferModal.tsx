import React, { useState } from 'react';
import {
  X, Image, DollarSign, Tag, Link2, ShoppingBag, Grid3x3,
  MessageSquare, Send, Check, ChevronDown, Eye
} from 'lucide-react';
import { mockChannels, mockOffers, MARKETPLACE_LABELS, formatCurrency } from '../../data/mock';
import { Marketplace, Channel } from '../../types';

interface NewOfferModalProps {
  onClose: () => void;
}

const MARKETPLACES: { value: Marketplace; label: string; emoji: string }[] = [
  { value: 'mercadolivre', label: 'Mercado Livre', emoji: '🟡' },
  { value: 'shopee', label: 'Shopee', emoji: '🟠' },
  { value: 'amazon', label: 'Amazon', emoji: '📦' },
  { value: 'magalu', label: 'Magalu', emoji: '🔵' },
  { value: 'aliexpress', label: 'AliExpress', emoji: '🔴' },
];

const CATEGORIES = [
  'Eletrônicos', 'Áudio', 'TVs', 'Moda', 'Eletrodomésticos',
  'Computadores', 'Wearables', 'Leitura', 'Esportes', 'Beleza', 'Casa', 'Games',
];

const NewOfferModal: React.FC<NewOfferModalProps> = ({ onClose }) => {
  const [form, setForm] = useState({
    name: '',
    image: '',
    originalPrice: '',
    salePrice: '',
    coupon: '',
    link: '',
    marketplace: '' as Marketplace | '',
    category: '',
  });
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [step, setStep] = useState<'form' | 'preview'>('form');

  const connectedChannels = mockChannels.filter(c => c.status === 'connected');

  const toggleChannel = (id: string) => {
    setSelectedChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const discount = form.originalPrice && form.salePrice
    ? Math.round((1 - parseFloat(form.salePrice) / parseFloat(form.originalPrice)) * 100)
    : 0;

  const channelIcons: Record<string, string> = {
    whatsapp: '💬',
    telegram: '✈️',
    discord: '🎮',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content w-full max-w-3xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Nova Oferta</h2>
            <p className="text-sm text-slate-400 mt-0.5">Cadastre e dispare em múltiplos canais</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(step === 'form' ? 'preview' : 'form')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Eye className="w-3.5 h-3.5" />
              {step === 'form' ? 'Prévia' : 'Formulário'}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex divide-x divide-slate-100">
          {/* Form */}
          <div className="flex-1 px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Informações da Oferta</p>

            {/* 1. Image */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>
                Imagem da Oferta
              </label>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://exemplo.com/imagem.jpg"
                  value={form.image}
                  onChange={e => setForm({ ...form, image: e.target.value })}
                  className="input-modern pl-10"
                />
                <Image className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              {form.image && (
                <img src={form.image} alt="Preview" className="w-full h-32 object-cover rounded-lg border border-slate-200" onError={(e: any) => { e.target.style.display = 'none'; }} />
              )}
            </div>

            {/* 2. Name */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span>
                Nome da Oferta
              </label>
              <input
                type="text"
                placeholder="Ex: iPhone 15 Pro Max 256GB"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="input-modern"
              />
            </div>

            {/* 3. Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">3</span>
                  Preço Original
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="999.99"
                    value={form.originalPrice}
                    onChange={e => setForm({ ...form, originalPrice: e.target.value })}
                    className="input-modern pl-10"
                  />
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">↓</span>
                  Preço Promocional
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="799.99"
                    value={form.salePrice}
                    onChange={e => setForm({ ...form, salePrice: e.target.value })}
                    className="input-modern pl-10"
                  />
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                </div>
              </div>
            </div>
            {discount > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-emerald-600 font-semibold">🔥 {discount}% de desconto</span>
              </div>
            )}

            {/* 4. Coupon */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">4</span>
                Cupom de Desconto <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="CUPOM10OFF"
                  value={form.coupon}
                  onChange={e => setForm({ ...form, coupon: e.target.value.toUpperCase() })}
                  className="input-modern pl-10 font-mono"
                />
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* 5. Link */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">5</span>
                Link de Afiliado
              </label>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://mercadolivre.com/..."
                  value={form.link}
                  onChange={e => setForm({ ...form, link: e.target.value })}
                  className="input-modern pl-10"
                />
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* 6. Marketplace */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">6</span>
                Marketplace
              </label>
              <div className="grid grid-cols-3 gap-2">
                {MARKETPLACES.map(mp => (
                  <button
                    key={mp.value}
                    onClick={() => setForm({ ...form, marketplace: mp.value })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.marketplace === mp.value
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>{mp.emoji}</span>
                    <span className="truncate text-xs">{mp.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 7. Category */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">7</span>
                Categoria
              </label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="input-modern"
              >
                <option value="">Selecione a categoria</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Channels */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">Canais de Disparo</p>
              <div className="space-y-2">
                {connectedChannels.map(ch => (
                  <label
                    key={ch.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedChannels.includes(ch.id)
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(ch.id)}
                      onChange={() => toggleChannel(ch.id)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selectedChannels.includes(ch.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                    }`}>
                      {selectedChannels.includes(ch.id) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-lg">{channelIcons[ch.type]}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{ch.name}</p>
                      <p className="text-xs text-slate-400">{ch.members?.toLocaleString()} membros</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="w-72 px-5 py-5 bg-slate-50 flex flex-col gap-4 hidden md:flex">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prévia WhatsApp</p>

            {/* Phone mockup */}
            <div className="bg-[#0a0a0a] rounded-2xl p-3 flex-1 min-h-64">
              <div className="bg-[#128C7E] rounded-t-xl px-3 py-2 flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-full bg-green-200 flex items-center justify-center text-xs">👤</div>
                <div>
                  <p className="text-white text-xs font-semibold">{selectedChannels.length > 0 ? mockChannels.find(c => selectedChannels.includes(c.id))?.name || 'Canal' : 'Grupo de Teste'}</p>
                  <p className="text-green-200 text-[10px]">{selectedChannels.length} canais selecionados</p>
                </div>
              </div>
              <div className="bg-[#ECE5DD] rounded-b-xl p-3 min-h-48 flex flex-col justify-end">
                <div className="whatsapp-bubble max-w-full text-xs">
                  <p className="font-bold text-slate-800 text-[11px] mb-1">🔥 OFERTA IMPERDÍVEL!</p>
                  {form.name && <p className="text-slate-800 font-medium text-[11px] mb-1">{form.name}</p>}
                  {form.originalPrice && <p className="text-slate-500 line-through text-[10px]">De {formatCurrency(parseFloat(form.originalPrice))}</p>}
                  {form.salePrice && <p className="text-green-700 font-bold text-sm">Por {formatCurrency(parseFloat(form.salePrice))}</p>}
                  {discount > 0 && <p className="text-orange-600 font-semibold text-[11px]">💸 {discount}% OFF</p>}
                  {form.coupon && (
                    <div className="mt-1.5 bg-orange-50 border border-orange-200 rounded-md px-2 py-1">
                      <p className="text-[10px] text-orange-700 font-mono font-bold">🎫 Cupom: {form.coupon}</p>
                    </div>
                  )}
                  {form.link && <p className="text-blue-600 text-[10px] mt-1.5 underline truncate">🔗 {form.link.substring(0, 30)}...</p>}
                  {!form.name && !form.salePrice && (
                    <p className="text-slate-400 text-[11px] italic">Preencha os dados para ver a prévia</p>
                  )}
                  <p className="text-slate-400 text-[9px] mt-1.5 text-right">Agora ✓✓</p>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 text-center">A mensagem é enviada automaticamente para todos os canais selecionados</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-3xl">
          <p className="text-xs text-slate-400">
            {selectedChannels.length > 0
              ? `${selectedChannels.length} canal(is) selecionado(s)`
              : 'Nenhum canal selecionado'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-white transition-all"
            >
              Salvar Oferta
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className="btn-gradient flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-70"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Enviado!
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Salvar e Disparar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewOfferModal;
