// SEC-2: enquanto a confirmação de e-mail esteve desligada no GoTrue
// (autoconfirm), qualquer signup já saía "verificado". Depois de reativar
// "Confirm email" no dashboard, o app ainda precisa BLOQUEAR ações
// públicas (publicar oferta ativa, ligar a vitrine) para contas com
// e-mail não confirmado. O trial pode começar normalmente; só as ações
// que expõem coisa pra internet exigem verificação.

import { supabase } from './supabase';

/**
 * Consulta o usuário atual no GoTrue e diz se o e-mail está confirmado.
 * Usa `email_confirmed_at` do próprio objeto de auth (claim de verdade),
 * não uma coluna espelhada no profile.
 */
export async function isCurrentEmailVerified(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;
    const u: any = data.user;
    return Boolean(
      u.email_confirmed_at ||
      u.confirmed_at ||
      u.user_metadata?.email_verified === true
    );
  } catch {
    return false;
  }
}

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Confirme seu e-mail para publicar ofertas ou ativar sua página pública. ' +
  'Enviamos um link de confirmação no seu cadastro (você ainda pode salvar rascunhos).';
