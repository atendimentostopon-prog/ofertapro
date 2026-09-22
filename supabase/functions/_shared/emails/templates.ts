// supabase/functions/_shared/emails/templates.ts
// Conteudo dos 8 templates embutido como string.
// Deno.readTextFile falha depois do deploy (arquivos .html nao entram no bundle
// da Edge Function); embutir como modulo TS resolve.
import type { TemplateName } from "./subjects.ts";

const assinaturaConfirmada = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">PAGAMENTO APROVADO</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Assinatura confirmada, {{USER_NAME}}</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Seu pagamento foi aprovado e sua conta Aflyo está com acesso total liberado.</p>
</div>
<div style="text-align:left;width:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;border-radius:14px;margin:4px 0 20px 0;">
<tr><td style="padding:18px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-top:0;">
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-bottom:3px;">Plano</span>
<span style="display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#101418;">{{PLAN_NAME}}</span>
</td></tr>
<tr><td style="padding-top:16px;">
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-bottom:3px;">Valor</span>
<span style="display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#101418;">{{AMOUNT}} / mês</span>
</td></tr>
<tr><td style="padding-top:16px;">
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-bottom:3px;">Próxima cobrança</span>
<span style="display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#101418;">{{NEXT_BILLING_DATE}}</span>
</td></tr>
</table>
</td></tr>
</table>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/dashboard" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Ir para meu painel</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Você pode gerenciar ou cancelar sua assinatura a qualquer momento em Configurações e Faturamento.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const boasVindas = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Bem-vindo(a) à Aflyo, {{USER_NAME}}</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Sua conta está ativa e seu <strong style="color:#101418;">trial gratuito de 7 dias</strong> já começou. Agora é só configurar seus canais e deixar a Aflyo automatizar suas ofertas.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Primeiros passos recomendados:</p>
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 4px 0;">
<tr><td style="padding:12px 16px;background-color:#F6F7F9;border-radius:12px;">
<span style="font-family:'Inter',sans-serif;font-size:14px;color:#101418;font-weight:600;">1&nbsp;&nbsp;Conecte seu Telegram</span>
</td></tr>
<tr><td style="height:8px;line-height:8px;">&nbsp;</td></tr>
<tr><td style="padding:12px 16px;background-color:#F6F7F9;border-radius:12px;">
<span style="font-family:'Inter',sans-serif;font-size:14px;color:#101418;font-weight:600;">2&nbsp;&nbsp;Cadastre os grupos que quer monitorar</span>
</td></tr>
<tr><td style="height:8px;line-height:8px;">&nbsp;</td></tr>
<tr><td style="padding:12px 16px;background-color:#F6F7F9;border-radius:12px;">
<span style="font-family:'Inter',sans-serif;font-size:14px;color:#101418;font-weight:600;">3&nbsp;&nbsp;Defina o canal de disparo das ofertas</span>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/dashboard" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Acessar meu painel</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Qualquer dúvida, é só responder este email, a gente te ajuda a configurar tudo.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const cancelamento = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Sua assinatura foi cancelada</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá, {{USER_NAME}}. Confirmamos o cancelamento do plano <strong style="color:#101418;">{{PLAN_NAME}}</strong>. Você continua com acesso até <strong style="color:#101418;">{{ACCESS_UNTIL_DATE}}</strong>, quando o disparo automático será pausado.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Sentiremos sua falta. Se mudar de ideia, é só reativar quando quiser. Suas configurações continuam salvas.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/planos" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Reativar assinatura</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Se o cancelamento foi por causa de algum problema, adoraríamos ouvir o que podemos melhorar. Responda este email.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const confirmacaoConta = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">TRIAL DE 7 DIAS</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Confirme seu email para ativar sua conta</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá! Falta só um passo para você começar a monitorar e disparar ofertas automaticamente com a Aflyo.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Clique no botão abaixo para confirmar <strong style="color:#101418;">{{USER_EMAIL}}</strong> e ativar seu trial gratuito:</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{CONFIRMATION_URL}}" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Confirmar meu email</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="{{CONFIRMATION_URL}}" style="color:#101418;word-break:break-all;">{{CONFIRMATION_URL}}</a></p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Não foi você quem criou essa conta? Ignore este email com segurança.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const falhaPagamento = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#FDECEC;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#E5484D;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#B3261E;letter-spacing:0.2px;">PAGAMENTO NÃO APROVADO</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Não conseguimos processar seu pagamento</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá, {{USER_NAME}}. A cobrança do plano <strong style="color:#101418;">{{PLAN_NAME}}</strong> ({{AMOUNT}}) não foi aprovada. Pode ser saldo insuficiente, cartão vencido ou recusa do banco.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Atualize sua forma de pagamento para evitar a interrupção do serviço.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/faturamento" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Atualizar forma de pagamento</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Vamos tentar cobrar novamente em breve. Se o problema persistir, sua conta pode ser pausada.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const recuperacaoSenha = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Redefinir sua senha</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Recebemos uma solicitação para redefinir a senha da conta <strong style="color:#101418;">{{USER_EMAIL}}</strong>.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Clique no botão abaixo para criar uma nova senha. Este link expira em 1 hora.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{CONFIRMATION_URL}}" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Redefinir minha senha</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Se o botão não funcionar, copie e cole este link:<br><a href="{{CONFIRMATION_URL}}" style="color:#101418;word-break:break-all;">{{CONFIRMATION_URL}}</a></p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Não foi você quem solicitou? Ignore este email. Sua senha atual continua válida.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const trialAcabando = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">FALTAM {{DAYS_LEFT}} DIAS DE TRIAL</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Seu trial está acabando, {{USER_NAME}}</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Seu período gratuito da Aflyo termina em <strong style="color:#101418;">{{DAYS_LEFT}} dias</strong>. Depois disso, sua conta fica pausada até você assinar um plano. Nenhum dado é perdido.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Assine agora e garanta que o disparo das suas ofertas não pare.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/planos" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Ver planos e assinar</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Dúvidas sobre qual plano escolher? Responda este email que a gente te ajuda.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const trialExpirado = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Seu trial expirou, conta pausada</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá, {{USER_NAME}}. Seu período gratuito de 7 dias chegou ao fim e sua conta foi pausada. O monitoramento e o disparo automático de ofertas está parado até a reativação.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">A boa notícia: suas configurações, lojas monitoradas e canais continuam salvos. É só assinar um plano para voltar de onde parou.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/planos" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Reativar minha conta</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Precisa de mais tempo ou tem alguma dúvida antes de assinar? É só responder este email.</p>
</div>
</td></tr>
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const ticketAberto = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 28px 40px;" align="center">
<h1 style="margin:0 0 12px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#101418;line-height:1.3;">Seu ticket foi aberto!</h1>
<p style="margin:0 0 24px 0;font-size:15px;color:#4B5563;line-height:1.6;">Recebemos seu pedido de suporte. Nossa equipe vai analisar em breve e entrar em contato.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;background:#F6F7F9;border-radius:12px;padding:16px 20px;width:100%;border:1px solid #ECEDF2;">
<tr><td>
<p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Assunto</p>
<p style="margin:0;font-size:15px;font-weight:600;color:#101418;">{{TICKET_TITLE}}</p>
</td></tr>
<tr><td style="padding-top:12px;">
<p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Numero do ticket</p>
<p style="margin:0;font-size:15px;font-weight:600;color:#101418;">#{{TICKET_NUMBER}}</p>
</td></tr>
</table>
<a href="{{TICKET_URL}}" style="display:inline-block;background-color:#1ED8A0;color:#FFFFFF;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:13px 28px;">Ver ticket</a>
</td></tr>
<tr><td style="padding:24px 40px 32px 40px;border-top:1px solid #F0F1F5;" align="center">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Voce tem uma conta na Aflyo.
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferencias de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const respostaSupporte = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
<tr><td style="padding:36px 40px 28px 40px;" align="center">
<h1 style="margin:0 0 12px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#101418;line-height:1.3;">Voce tem uma nova resposta!</h1>
<p style="margin:0 0 20px 0;font-size:15px;color:#4B5563;line-height:1.6;">Nossa equipe respondeu ao seu ticket <strong style="color:#101418;">#{{TICKET_NUMBER}}</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;background:#F6F7F9;border-radius:12px;padding:16px 20px;width:100%;border-left:3px solid #1ED8A0;">
<tr><td>
<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">{{TICKET_TITLE}}</p>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{{REPLY_PREVIEW}}</p>
</td></tr>
</table>
<a href="{{TICKET_URL}}" style="display:inline-block;background-color:#1ED8A0;color:#FFFFFF;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:13px 28px;">Ver resposta</a>
</td></tr>
<tr><td style="padding:24px 40px 32px 40px;border-top:1px solid #F0F1F5;" align="center">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Voce tem uma conta na Aflyo.
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferencias de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

export const TEMPLATES: Record<TemplateName, string> = {
  "assinatura-confirmada": assinaturaConfirmada,
  "boas-vindas": boasVindas,
  "cancelamento": cancelamento,
  "confirmacao-conta": confirmacaoConta,
  "falha-pagamento": falhaPagamento,
  "recuperacao-senha": recuperacaoSenha,
  "ticket-aberto": ticketAberto,
  "resposta-suporte": respostaSupporte,
  "trial-acabando": trialAcabando,
  "trial-expirado": trialExpirado,
};
