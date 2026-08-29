import { useEffect, useState, type FormEvent } from 'react';
import { Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { getCaktoSdk } from '../../config/cakto';
import { supabase } from '../../lib/supabase';
import type { PlanCode, BillingCycle } from '../../config/planCatalog';

// Checkout transparente da Cakto: os campos sao inputs controlados nossos
// (sem iframe). O SDK da Cakto no browser tokeniza o cartao e roda o 3DS +
// antifraude; a gente so manda o token pro backend.
interface CaktoPaymentPanelProps {
  plan: PlanCode;
  cycle: BillingCycle;
  price: number;
  onSuccess: () => void;
}

function money(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

const onlyDigits = (s: string): string => s.replace(/\D/g, '');

function maskCardNumber(v: string): string {
  return onlyDigits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function maskExpiry(v: string): string {
  const d = onlyDigits(v).slice(0, 4);
  return d.length <= 2 ? d : d.slice(0, 2) + '/' + d.slice(2);
}

function maskCpf(v: string): string {
  return onlyDigits(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d ? '(' + d : d;
  if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
  if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
}

// Input no mesmo estilo do resto do app: borda de 1.5px em
// rgba(16,20,24,0.09), raio 11px, foco mint.
const INPUT_CLASS =
  'w-full px-3.5 py-2.5 text-sm text-ink bg-surface-0 rounded-[11px] border-[1.5px] border-[rgba(16,20,24,0.09)] outline-none transition-shadow placeholder:text-ink-tertiary focus:border-mint-500 focus:shadow-[0_0_0_3px_rgba(94,231,165,0.28)] disabled:opacity-60 disabled:pointer-events-none';
const LABEL_CLASS = 'block text-xs font-semibold text-ink-secondary mb-1.5';

export default function CaktoPaymentPanel({ plan, cycle, price, onSuccess }: CaktoPaymentPanelProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [installments, setInstallments] = useState(cycle === 'yearly' ? 12 : 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No mount: aquece o antifraude da Cakto. Best-effort, nao bloqueia o render
  // nem o submit (o getAntifraudReference degrada pra string vazia se falhar).
  useEffect(() => {
    getCaktoSdk()
      .then((sdk) => sdk.initAntifraud())
      .catch(() => {
        /* best-effort */
      });
  }, []);

  const cardDigits = onlyDigits(cardNumber);
  const cpfDigits = onlyDigits(cpf);
  const phoneDigits = onlyDigits(phone);
  const expMonth = expiry.slice(0, 2);
  const expYear = expiry.slice(3, 5);

  const formComplete =
    cardDigits.length >= 13 &&
    cardDigits.length <= 19 &&
    /^\d{2}\/\d{2}$/.test(expiry) &&
    cvc.length >= 3 &&
    cvc.length <= 4 &&
    name.trim().length > 0 &&
    cpfDigits.length === 11 &&
    phoneDigits.length >= 10 &&
    phoneDigits.length <= 11;

  function validate(): string | null {
    if (cardDigits.length < 13 || cardDigits.length > 19) return 'Confira o numero do cartao.';
    const mm = Number(expMonth);
    if (!/^\d{2}\/\d{2}$/.test(expiry) || mm < 1 || mm > 12) return 'Confira a validade do cartao.';
    const now = new Date();
    const curYY = now.getFullYear() % 100;
    const curMM = now.getMonth() + 1;
    const yy = Number(expYear);
    if (yy < curYY || (yy === curYY && mm < curMM)) return 'O cartao esta vencido.';
    if (cvc.length < 3 || cvc.length > 4) return 'Confira o codigo de seguranca (CVC).';
    if (!name.trim()) return 'Informe o nome impresso no cartao.';
    if (cpfDigits.length !== 11) return 'Confira o CPF.';
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return 'Confira o telefone.';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const sdk = await getCaktoSdk();

      // expYear: o exemplo do SDK aceita 2 ou 4 digitos. Mandamos o "AA" de 2
      // digitos exatamente como veio da mascara MM/AA.
      const card = {
        holderName: name.trim(),
        cardNumber: cardDigits,
        cvv: cvc,
        expMonth,
        expYear,
      };

      const { cardToken } = await sdk.createToken(card);

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const email = session?.user?.email ?? '';

      // 3DS e best-effort: se estourar ou vier success=false, seguimos sem os
      // dados de autenticacao e o backend cai pro paymentMethod credit_card.
      let threeDS:
        | { cavv?: string; eci?: string; xid?: string; referenceId?: string; version?: string }
        | undefined;
      try {
        const auth = await sdk.authenticate3DS({
          card,
          customer: {
            amount: Math.round(price * 100),
            currency: 'BRL',
            email,
            name: name.trim(),
            phone: phoneDigits,
            paymentMethod: 'credit',
            address: {},
          },
        });
        if (auth && auth.success) {
          threeDS = {
            cavv: auth.cavv,
            eci: auth.eci,
            xid: auth.xid,
            referenceId: auth.referenceId,
            version: auth.version,
          };
        } else {
          console.warn('[cakto] 3DS nao autenticou, seguindo sem 3DS', auth?.error);
        }
      } catch (err) {
        console.warn('[cakto] 3DS falhou, seguindo sem 3DS', err);
      }

      await sdk.completeAntifraudProfile().catch(() => {
        /* best-effort */
      });
      const antifraud_ref = sdk.getAntifraudReference();

      const res = await fetch(
        import.meta.env.VITE_SUPABASE_URL + '/functions/v1/cakto-create-payment',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + (session?.access_token ?? ''),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan_code: plan,
            billing_cycle: cycle,
            installments,
            card_token: cardToken,
            three_d_secure: threeDS,
            antifraud_ref,
            customer: { name: name.trim(), cpf: cpfDigits, phone: phoneDigits },
          }),
        },
      );

      const out = await res.json().catch(() => ({}));

      if (
        res.ok &&
        (out.status === 'paid' || out.status === 'pending' || out.status === 'processing')
      ) {
        try {
          sdk.cleanupAntifraud?.();
        } catch {
          /* opcional */
        }
        // Deixa submitting travado: o Checkout troca pra tela de espera.
        onSuccess();
        return;
      }

      setError(
        out.error ||
          out.message ||
          'Pagamento recusado. Confira os dados do cartao ou tente outro.',
      );
      setSubmitting(false);
    } catch (err) {
      console.error('[cakto] falha no checkout', err);
      setError('Nao foi possivel concluir o pagamento. Confira os dados do cartao e tente de novo.');
      setSubmitting(false);
    }
  }

  const ctaLabel = cycle === 'yearly' ? `Pagar em ${installments}x` : `Pagar ${money(price)}`;

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-graphite text-ink-inverse flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink font-display leading-tight">Como voce quer pagar?</h2>
          <p className="text-xs text-ink-secondary">So cartao por enquanto. Pix e boleto em breve.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="space-y-3.5">
          <div>
            <label htmlFor="cakto-card" className={LABEL_CLASS}>Numero do cartao</label>
            <input
              id="cakto-card"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cakto-exp" className={LABEL_CLASS}>Validade</label>
              <input
                id="cakto-exp"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/AA"
                value={expiry}
                onChange={(e) => setExpiry(maskExpiry(e.target.value))}
                disabled={submitting}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="cakto-cvc" className={LABEL_CLASS}>CVC</label>
              <input
                id="cakto-cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                value={cvc}
                onChange={(e) => setCvc(onlyDigits(e.target.value).slice(0, 4))}
                disabled={submitting}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cakto-name" className={LABEL_CLASS}>Nome no cartao</label>
            <input
              id="cakto-name"
              autoComplete="cc-name"
              placeholder="Igual esta impresso no cartao"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="cakto-cpf" className={LABEL_CLASS}>CPF</label>
            <input
              id="cakto-cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="cakto-phone" className={LABEL_CLASS}>Telefone</label>
            <input
              id="cakto-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </div>

          {cycle === 'yearly' && (
            <div>
              <label htmlFor="cakto-installments" className={LABEL_CLASS}>Parcelas</label>
              <select
                id="cakto-installments"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                disabled={submitting}
                className={INPUT_CLASS + ' appearance-none cursor-pointer'}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{`${n}x de ${money(price / n)} sem juros`}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-danger-ink text-xs font-medium">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !formComplete}
          className="mt-6 w-full py-[15px] rounded-[13px] bg-gradient-to-br from-mint-400 to-mint-500 text-graphite font-bold text-sm flex items-center justify-center gap-2 shadow-[0_12px_28px_-12px_rgba(61,217,143,0.55)] transition-all hover:-translate-y-px hover:shadow-[0_16px_32px_-12px_rgba(61,217,143,0.65)] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0 cursor-pointer"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? 'Processando pagamento' : ctaLabel}
        </button>

        <div className="mt-[18px] flex items-center justify-center gap-2 text-xs text-ink-secondary text-center">
          <Shield className="w-[15px] h-[15px] text-mint-700 flex-shrink-0" />
          Seus dados passam direto pela <b className="text-ink font-semibold">Cakto</b>, a gente nem ve seu cartao
        </div>

        <p className="mt-3.5 text-[11px] leading-relaxed text-ink-tertiary text-center">
          Ao confirmar, voce topa com nossos <a href="/terms" className="underline text-ink-secondary">Termos de Uso</a> e{' '}
          <a href="/privacy" className="underline text-ink-secondary">Politica de Privacidade</a>. A assinatura renova sozinha ate voce cancelar.
        </p>
      </form>
    </div>
  );
}
