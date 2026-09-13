export const TEMPLATE_NAMES = [
  "confirmacao-conta",
  "boas-vindas",
  "recuperacao-senha",
  "trial-acabando",
  "trial-expirado",
  "assinatura-confirmada",
  "falha-pagamento",
  "cancelamento",
] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export const SUBJECTS: Record<TemplateName, string> = {
  "confirmacao-conta": "Confirme seu email para ativar sua conta",
  "boas-vindas": "Bem-vindo(a) à Aflyo",
  "recuperacao-senha": "Redefinir sua senha",
  "trial-acabando": "Seu teste grátis está acabando",
  "trial-expirado": "Sua conta Aflyo foi pausada",
  "assinatura-confirmada": "Assinatura confirmada",
  "falha-pagamento": "Não conseguimos processar seu pagamento",
  "cancelamento": "Sua assinatura foi cancelada",
};

export const PLACEHOLDER_KEYS = [
  "APP_URL", "SUPPORT_URL", "PREFERENCES_URL", "UNSUBSCRIBE_URL",
  "USER_NAME", "USER_EMAIL", "CONFIRMATION_URL",
  "PLAN_NAME", "AMOUNT", "NEXT_BILLING_DATE", "ACCESS_UNTIL_DATE", "DAYS_LEFT",
] as const;

export function isTemplateName(v: unknown): v is TemplateName {
  return typeof v === "string" && (TEMPLATE_NAMES as readonly string[]).includes(v);
}
