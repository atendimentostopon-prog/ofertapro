import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeDiscordMd as esc, escapeHtml, render } from "./format.ts";
import type { OpsEvent } from "./types.ts";

const base: OpsEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-13T15:00:00.000Z",
  severity: "business",
  category: "signup",
  title: "Novo cadastro",
  detail: { email: "ana@x.com", provider: "google" },
  user_id: null,
  occurrences: 1,
};

const PAINEL = "https://admin.aflyo.com.br/users/3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";

function ev(over: Partial<OpsEvent>): OpsEvent {
  return { ...base, ...over };
}
function fields(r: ReturnType<typeof render>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of (r.discord.embeds[0] as any).fields) out[f.name] = f.value;
  return out;
}
function embed(r: ReturnType<typeof render>): any {
  return r.discord.embeds[0];
}

Deno.test("escapeHtml escapa & < >", () => {
  assertEquals(escapeHtml("a & <b>"), "a &amp; &lt;b&gt;");
});

Deno.test("render: Discord tem embed com título, cor e rótulo pt-BR; e-mail completo", () => {
  const r = render(base);
  const e = embed(r);
  assertEquals(e.title, "🟢 Novo cadastro");
  assert(typeof e.color === "number");
  assertEquals(e.footer.text, "signup · business");
  assertEquals(fields(r)["E-mail"], "ana@x.com");
  // chave desconhecida cai em rótulo humanizado depois das conhecidas
  const names = e.fields.map((f: any) => f.name);
  assertEquals(names, ["E-mail", "Provider"]);
  assertEquals(fields(r)["Provider"], "google");
});

Deno.test("render: Telegram em HTML, escapado e com o detalhe", () => {
  const r = render(ev({ title: "Erro <script>", detail: { msg: "a & b" } }));
  assert(r.telegram.includes("Erro &lt;script&gt;"));
  assert(r.telegram.includes("Msg: <b>a &amp; b</b>"));
});

Deno.test("render: ocorrências > 1 aparecem como ×N", () => {
  const r = render(ev({ severity: "error", occurrences: 25 }));
  const nota = "×25 ocorrências. Os detalhes abaixo são da primeira ocorrência.";
  assertEquals(embed(r).description, nota);
  assert(r.telegram.includes(nota));
});

Deno.test("render: titulo sanitizado (sem Bearer, JWT, e-mail completo)", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
  const r = render(ev({ title: `Erro para joao@x.com com Bearer abc123 e ${jwt}` }));
  const t = embed(r).title as string;
  assert(!t.includes("joao@x.com"));
  assert(!t.includes("abc123"));
  assert(!t.includes(jwt));
  assert(!r.telegram.includes("joao@x.com"));
  assert(!r.telegram.includes("abc123"));
  assert(!r.telegram.includes(jwt));
});

Deno.test("render: detalhe mantém e-mail completo mas segredos seguem redigidos", () => {
  const r = render(ev({
    detail: {
      erro: "falha ana@x.com Bearer abc123 url?token=zzz",
      api_key: "segredo",
    },
  }));
  const f = fields(r);
  assert(f["Erro"].includes("ana@x.com"));
  assert(!f["Erro"].includes("abc123"));
  assert(!f["Erro"].includes("zzz"));
  assertEquals(f["Api key"], esc("[redigido]"));
  assert(!r.telegram.includes("abc123"));
  assert(!r.telegram.includes("segredo"));
});

Deno.test("signup: rótulos, telefone, origem, confirmação, trial, resumo e link", () => {
  const r = render(ev({
    detail: {
      nome: "Ana Silva",
      email: "ana@x.com",
      telefone: "+55 11 98765-4321",
      origem: "google",
      email_confirmado: false,
      cadastro_numero: 128,
      cadastros_hoje: 7,
      trial_termina: "2026-10-20T15:00:00.000Z",
      painel: PAINEL,
    },
  }));
  const e = embed(r);
  assertEquals(e.description, "Cadastro nº 128 · 7 hoje");
  assertEquals(e.url, PAINEL);
  const f = fields(r);
  assertEquals(f["Nome"], "Ana Silva");
  assertEquals(f["E-mail"], "ana@x.com");
  assertEquals(f["Telefone"], esc("(11) 98765-4321"));
  assertEquals(f["Origem"], "Google");
  assertEquals(f["Confirmação"], "Aguardando confirmação");
  assertEquals(f["Trial termina"], "20/10 às 12:00");
  assertEquals(
    Object.keys(f),
    ["Nome", "E-mail", "Telefone", "Origem", "Confirmação", "Trial termina"],
  );
  // Telegram
  const lines = r.telegram.split("\n");
  assertEquals(lines[0], "<b>🟢 Novo cadastro</b>");
  assertEquals(lines[1], "Cadastro nº 128 · 7 hoje");
  assertEquals(lines[2], "Nome: <b>Ana Silva</b>");
  assert(r.telegram.includes("Telefone: <b>(11) 98765-4321</b>"));
  assertEquals(lines[lines.length - 2], "signup · 13/10/2026 12:00");
  assertEquals(lines[lines.length - 1], `<a href="${PAINEL}">Abrir no painel</a>`);
});

Deno.test("signup: origem email, confirmado e telefone fixo", () => {
  const r = render(ev({
    detail: { origem: "email", email_confirmado: true, telefone: "1133334444" },
  }));
  const f = fields(r);
  assertEquals(f["Origem"], "E-mail e senha");
  assertEquals(f["Confirmação"], "Confirmado");
  assertEquals(f["Telefone"], esc("(11) 3333-4444"));
  assertEquals(embed(r).description, undefined);
});

Deno.test("telefone fora do padrão BR fica como veio", () => {
  assertEquals(fields(render(ev({ detail: { telefone: "+1 202 555 0100" } })))["Telefone"], "+1 202 555 0100");
});

Deno.test("e-mail confirmado: tempo, onboarding e resumo com taxa", () => {
  const r = render(ev({
    title: "E-mail confirmado",
    detail: {
      nome: "Ana",
      email: "ana@x.com",
      confirmou_em_min: 4,
      onboarding_passo: "1 de 4",
      confirmaram_hoje: 5,
      taxa_confirmacao_7d: 62.5,
      cadastro_numero: 128,
      painel: PAINEL,
    },
  }));
  assertEquals(embed(r).description, "5 confirmaram hoje · confirmação em 7 dias: 62,5%");
  const f = fields(r);
  assertEquals(f["Confirmou em"], "4 min");
  assertEquals(f["Onboarding"], "passo 1 de 4");
  assertEquals(Object.keys(f).includes("Cadastro numero"), false);
  assert(r.telegram.includes("5 confirmaram hoje · confirmação em 7 dias: 62,5%"));
});

Deno.test("confirmou em: formatos de minutos e horas", () => {
  const f = (n: number) => fields(render(ev({ detail: { confirmou_em_min: n } })))["Confirmou em"];
  assertEquals(f(0.4), esc("< 1 min"));
  assertEquals(f(59), "59 min");
  assertEquals(f(80), "1 h 20 min");
  assertEquals(f(120), "2 h");
  assertEquals(f(26 * 60), "1 d 2 h");
  assertEquals(f(74 * 60), "3 d 2 h");
  assertEquals(f(48 * 60), "2 d");
});

Deno.test("e-mail confirmado: taxa inteira vira 60%", () => {
  const r = render(ev({
    title: "E-mail confirmado",
    detail: { confirmaram_hoje: 1, taxa_confirmacao_7d: 60 },
  }));
  assertEquals(embed(r).description, "1 confirmou hoje · confirmação em 7 dias: 60%");
});

Deno.test("trial expirando: restam, dias, bot, canais e data", () => {
  const r = render(ev({
    severity: "business",
    category: "billing",
    title: "Trial termina em menos de 24h",
    detail: {
      nome: "Ana",
      email: "ana@x.com",
      telefone: "11987654321",
      horas_restantes: 18,
      dias_de_uso: 6,
      onboarding_passo: "3 de 4",
      bot_status: "active",
      canais: 2,
      trial_termina: "2026-10-14T09:30:00.000Z",
      painel: PAINEL,
    },
  }));
  const f = fields(r);
  assertEquals(f["Restam"], "18 h");
  assertEquals(f["Dias de uso"], "6");
  assertEquals(f["Bot"], "ativo");
  assertEquals(f["Canais"], "2");
  assertEquals(f["Trial termina"], "14/10 às 06:30");
  assertEquals(embed(r).description, undefined);
  assertEquals(fields(render(ev({ detail: { horas_restantes: 0.75 } })))["Restam"], "45 min");
  assertEquals(fields(render(ev({ detail: { horas_restantes: 23.8 } })))["Restam"], "23 h");
  assertEquals(fields(render(ev({ detail: { bot_status: "paused" } })))["Bot"], "pausado");
  assertEquals(fields(render(ev({ detail: { bot_status: "error" } })))["Bot"], "error");
  assertEquals(
    fields(render(ev({ detail: { onboarding_passo: "concluído" } })))["Onboarding"],
    "concluído",
  );
});

Deno.test("venda: valor BRL, plano, ciclo, pagamento, parcelas e resumo com vendas do dia", () => {
  const r = render(ev({
    category: "billing",
    title: "Venda aprovada",
    detail: {
      evento: "purchase_approved",
      plano: "pro",
      ciclo: "monthly",
      valor: 48.89,
      forma_pagamento: "credit_card",
      parcelas: 3,
      pedido: "ord_1",
      oferta: "Pro mensal",
      cliente_nome: "Ana",
      cliente_email: "ana@x.com",
      cliente_telefone: "5511987654321",
      acesso: "liberado, bot retomado",
      vendas_hoje: 4,
      faturamento_hoje: 1234.5,
      painel: PAINEL,
    },
  }));
  assertEquals(embed(r).description, esc("Pro mensal · R$ 48,89 · hoje: 4 vendas · R$ 1.234,50 (bruto)"));
  const f = fields(r);
  // plano, ciclo, valor e vendas do dia ficam so no resumo
  for (const k of ["Plano", "Ciclo", "Valor", "Vendas hoje", "Faturamento hoje"]) {
    assertEquals(k in f, false, k);
  }
  assertEquals(f["Evento"], "Compra aprovada");
  assertEquals(f["Pagamento"], "Cartão");
  assertEquals(f["Parcelas"], "3x");
  assertEquals(f["Cliente"], "Ana");
  assertEquals(f["E-mail do cliente"], "ana@x.com");
  assertEquals(f["Telefone do cliente"], esc("(11) 98765-4321"));
  assertEquals(f["Acesso"], "liberado, bot retomado");
  const keys = Object.keys(f);
  assert(keys.indexOf("Pagamento") < keys.indexOf("Pedido"));
  assert(keys.indexOf("Pedido") < keys.indexOf("Cliente"));
  assert(keys.indexOf("Pedido") < keys.indexOf("Cliente"));
});

Deno.test("venda: enterprise vira Business, pix e boleto, anual", () => {
  const r = render(ev({
    category: "billing",
    title: "Venda aprovada",
    detail: { plano: "enterprise", ciclo: "yearly", valor: 100, forma_pagamento: "pix" },
  }));
  assertEquals(embed(r).description, "Business anual · R$ 100,00");
  assertEquals(fields(r)["Pagamento"], "Pix");
  assertEquals(fields(render(ev({ detail: { forma_pagamento: "boleto" } })))["Pagamento"], "Boleto");
  assertEquals(fields(render(ev({ detail: { plano: "free" } })))["Plano"], "Free");
  assertEquals(
    fields(render(ev({ detail: { forma_pagamento: "carteira_x" } })))["Pagamento"],
    esc("carteira_x"),
  );
  // sem valor no resumo, plano e ciclo aparecem como campos
  const g = fields(render(ev({ category: "billing", detail: { plano: "pro", ciclo: "monthly" } })));
  assertEquals(g["Plano"], "Pro");
  assertEquals(g["Ciclo"], "Mensal");
});

Deno.test("reembolso: acesso revogado, motivo, ocorrências somadas ao resumo", () => {
  const r = render(ev({
    category: "billing",
    title: "Reembolso",
    occurrences: 3,
    detail: {
      evento: "refund",
      plano: "starter",
      ciclo: "monthly",
      valor: 19.9,
      motivo: "solicitado pelo cliente",
      acesso: "revogado e bot pausado",
    },
  }));
  assertEquals(embed(r).description, "Starter mensal · R$ 19,90\n×3 ocorrências. Os detalhes abaixo são da primeira ocorrência.");
  const f = fields(r);
  assertEquals(f["Motivo"], "solicitado pelo cliente");
  assertEquals(f["Acesso"], "revogado e bot pausado");
});

Deno.test("falha do webhook: erro, ação e link", () => {
  const r = render(ev({
    severity: "critical",
    category: "billing",
    title: "Webhook Cakto falhou: refund",
    detail: {
      evento: "refund",
      pedido: "ord_9",
      cliente_nome: "Ana",
      cliente_email: "ana@x.com",
      plano: "pro",
      erro: "profiles by id: timeout",
      acao: "Verifique o webhook e reprocesse o evento em Cakto > Webhooks no painel admin",
      painel: PAINEL,
    },
  }));
  const f = fields(r);
  assertEquals(f["Erro"], "profiles by id: timeout");
  assert(f["O que fazer"].startsWith("Verifique o webhook"));
  assertEquals(embed(r).description, undefined);
  assertEquals((embed(r) as any).title.startsWith("🔴"), true);
  // ">" do texto é escapado no Telegram
  assert(r.telegram.includes("Cakto &gt; Webhooks"));
  assert(r.telegram.endsWith(`<a href="${PAINEL}">Abrir no painel</a>`));
});

Deno.test("secret inválido: ip, país, navegador e rota", () => {
  const r = render(ev({
    severity: "error",
    category: "security",
    title: "Webhook Cakto com secret inválido",
    detail: { ip: "203.0.113.9", pais: "BR", user_agent: "curl/8.0", rota: "/cakto-webhook" },
  }));
  const f = fields(r);
  assertEquals(f["IP"], "203.0.113.9");
  assertEquals(f["País"], "BR");
  assertEquals(f["Navegador / cliente"], "curl/8.0");
  assertEquals(f["Rota"], "/cakto-webhook");
  assertEquals(embed(r).url, undefined);
});

Deno.test("valores vazios são omitidos", () => {
  const r = render(ev({
    detail: { nome: "", email: null, telefone: "   ", motivo: undefined, ip: "1.1.1.1", extra: [] },
  }));
  assertEquals(Object.keys(fields(r)), ["IP"]);
  assert(!r.telegram.includes("Nome:"));
  assert(!r.telegram.includes("Extra"));
});

Deno.test("chave desconhecida vira rótulo humanizado depois das conhecidas", () => {
  const r = render(ev({ detail: { zeta_campo_novo: "v", nome: "Ana", outro: 1 } }));
  assertEquals(Object.keys(fields(r)), ["Nome", "Zeta campo novo", "Outro"]);
});

Deno.test("painel: só https://admin.aflyo.com.br/ vira link; outros viram texto escapado", () => {
  for (const bad of [
    "javascript:alert(1)",
    "https://evil.com/users/1",
    "https://admin.aflyo.com.br.evil.com/x",
    "http://admin.aflyo.com.br/users/1",
    'https://admin.aflyo.com.br/x" onmouseover="a',
    "https://admin.aflyo.com.br/<b>",
  ]) {
    const r = render(ev({ detail: { painel: bad, nome: "Ana" } }));
    assertEquals(embed(r).url, undefined, bad);
    assert(!r.telegram.includes("<a "), bad);
    assertEquals(fields(r)["Painel"], esc(bad), bad);
    // sem tag crua vazando
    assert(!r.telegram.replace(/<\/?b>/g, "").includes("<"), bad);
  }
});

Deno.test("painel válido: url no título do Discord e link no fim do Telegram, sem campo extra", () => {
  const r = render(ev({ detail: { painel: PAINEL, nome: "Ana" } }));
  assertEquals(embed(r).url, PAINEL);
  assertEquals(Object.keys(fields(r)), ["Nome"]);
  assert(r.telegram.split("\n").pop()!.startsWith('<a href="https://admin.aflyo.com.br/'));
});

Deno.test("HTML: todo valor dinâmico é escapado no Telegram", () => {
  const r = render(ev({
    detail: { nome: "<img src=x onerror=1> & Cia", motivo: "a<b>c" },
  }));
  assert(r.telegram.includes("Nome: <b>&lt;img src=x onerror=1&gt; &amp; Cia</b>"));
  assert(r.telegram.includes("Motivo: <b>a&lt;b&gt;c</b>"));
});

Deno.test("render: detalhe gigante respeita limites do Discord e do Telegram, corta linhas", () => {
  // sanitizeDetail guarda no maximo 20 chaves: o painel entra primeiro para sobreviver.
  const huge: Record<string, unknown> = { painel: PAINEL };
  const longValue = "&".repeat(100) + "<".repeat(50) + "conteudo".repeat(60);
  for (let i = 0; i < 50; i++) huge[`campo_${i}`] = longValue;
  huge.nome = longValue;
  const r = render(ev({
    title: "&".repeat(100) + "<b>longo</b>",
    detail: huge,
    occurrences: 5,
  }));

  const e = embed(r);
  assert(e.fields.length <= 15);
  assert(e.title.length <= 250);
  let total = e.title.length + (e.description?.length ?? 0) + e.footer.text.length;
  for (const f of e.fields) {
    assert(f.value.length <= 1024);
    total += f.name.length + f.value.length;
  }
  assert(total <= 5500, `embed com ${total} chars`);

  assert(r.telegram.length <= 4000, `telegram com ${r.telegram.length}`);
  // nenhuma entidade HTML cortada ao meio e nenhum < ou & crus fora das tags permitidas
  const stripped = r.telegram
    .replace(/<a href="[^"]*">/g, "")
    .replace(/<\/a>/g, "")
    .replace(/<\/?b>/g, "")
    .replace(/&amp;|&lt;|&gt;|&quot;/g, "");
  assert(!stripped.includes("<"));
  assert(!stripped.includes("&"));
  // corta por linha: toda linha de campo termina em </b>, e o link segue por último
  const lines = r.telegram.split("\n");
  assert(lines[lines.length - 1].endsWith("</a>"));
  for (const l of lines.slice(2, -2)) assert(l.endsWith("</b>"), l.slice(-20));
  const fieldCount = lines.filter((l) => l.endsWith("</b>")).length;
  assert(fieldCount < 40, `campos: ${fieldCount}`);
});

Deno.test("markdown do Discord: nome e user-agent com link saem escapados", () => {
  const evil = "[Abrir no painel](https://evil.example/login)";
  const r = render(ev({
    detail: { nome: evil, user_agent: evil, motivo: "*negrito* _it_ `c` ~~s~~ |spoiler| > q # h" },
  }));
  const f = fields(r);
  assertEquals(f["Nome"], "\\[Abrir no painel\\]\\(https://evil.example/login\\)");
  assertEquals(f["Navegador / cliente"], f["Nome"]);
  assert(!/(^|[^\\])\[/.test(f["Nome"]));
  assert(!/(^|[^\\])\(/.test(f["Nome"]));
  assertEquals(f["Motivo"], "\\*negrito\\* \\_it\\_ \\`c\\` \\~\\~s\\~\\~ \\|spoiler\\| \\> q \\# h");
  assertEquals(embed(r).url, undefined);
});

Deno.test("markdown do Discord: description tambem e escapada; Telegram segue so HTML", () => {
  const r = render(ev({
    category: "billing",
    title: "Venda aprovada",
    detail: { plano: "[x](https://evil)", valor: 10 },
  }));
  assert(embed(r).description.startsWith("\\[x\\]\\(https://evil\\)"));
  assert(r.telegram.includes("[x](https://evil)"));
});

Deno.test("painel legitimo continua sendo o url do titulo, nao e escapado", () => {
  const r = render(ev({ detail: { nome: "Ana", painel: PAINEL } }));
  assertEquals(embed(r).url, PAINEL);
});

Deno.test("chave legada (termina) cai no fallback humanizado sem quebrar", () => {
  const r = render(ev({ detail: { email: "ana@x.com", termina: "2026-10-14T09:30:00.000Z" } }));
  assertEquals(fields(r)["Termina"], "2026-10-14T09:30:00.000Z");
});

Deno.test("rotulos de evento: conhecidos em pt-BR, desconhecido cru", () => {
  assertEquals(fields(render(ev({ detail: { evento: "subscription_renewal_refused" } })))["Evento"], "Renovação recusada");
  assertEquals(fields(render(ev({ detail: { evento: "ping_x" } })))["Evento"], esc("ping_x"));
});

Deno.test("1 confirmou e N confirmaram", () => {
  const d = (n: number) => embed(render(ev({ title: "E-mail confirmado", detail: { confirmaram_hoje: n } }))).description;
  assertEquals(d(1), "1 confirmou hoje");
  assertEquals(d(2), "2 confirmaram hoje");
});

Deno.test("telegram conectado: canal, identificador, membros e quantidade; plano e trial do usuário", () => {
  const r = render(ev({
    category: "bot",
    title: "Telegram conectado",
    detail: {
      nome: "Ana Silva",
      email: "ana@x.com",
      telefone: "11987654321",
      plano: "starter",
      trial_termina: "2026-10-20T15:00:00.000Z",
      canal_nome: "Ofertas da Ana",
      identificador: "@ofertas_ana",
      membros: 1250,
      canais_telegram: 2,
      painel: PAINEL,
    },
  }));
  const f = fields(r);
  assertEquals(f["Nome"], "Ana Silva");
  assertEquals(f["E-mail"], "ana@x.com");
  assertEquals(f["Telefone"], esc("(11) 98765-4321"));
  assertEquals(f["Plano"], "Starter");
  assertEquals(f["Canal"], "Ofertas da Ana");
  assertEquals(f["Identificador"], esc("@ofertas_ana"));
  assertEquals(f["Membros"], "1250");
  assertEquals(f["Canais Telegram"], "2");
  const keys = Object.keys(f);
  assert(keys.indexOf("Telefone") < keys.indexOf("Canal"));
  assert(keys.indexOf("Canal") < keys.indexOf("Canais Telegram"));
  assertEquals(embed(r).url, PAINEL);
  assert(r.telegram.includes("Canal: <b>Ofertas da Ana</b>"));
});

Deno.test("whatsapp conectado: número BR formatado, perfil e instância; vazios omitidos", () => {
  const r = render(ev({
    category: "bot",
    title: "WhatsApp conectado",
    detail: {
      nome: "Bruno",
      email: "bruno@x.com",
      numero_whatsapp: "5511912345678",
      perfil_whatsapp: "Bruno Ofertas",
      instancia: "aflyo_bruno_1",
      membros: "",
      painel: PAINEL,
    },
  }));
  const f = fields(r);
  assertEquals(f["Número"], esc("(11) 91234-5678"));
  assertEquals(f["Perfil"], "Bruno Ofertas");
  assertEquals(f["Instância"], esc("aflyo_bruno_1"));
  assertEquals("Membros" in f, false);
  assertEquals("Canal" in f, false);
});

Deno.test("bot ativado: grupos, canais de destino e marketplaces", () => {
  const r = render(ev({
    category: "bot",
    title: "Bot ativado",
    detail: {
      nome: "Carla",
      email: "carla@x.com",
      plano: "pro",
      grupos_origem: 3,
      canais_destino: 2,
      marketplaces: "Shopee, Mercado Livre",
      painel: PAINEL,
    },
  }));
  const f = fields(r);
  assertEquals(f["Plano"], "Pro");
  assertEquals(f["Grupos de origem"], "3");
  assertEquals(f["Canais de destino"], "2");
  assertEquals(f["Marketplaces"], esc("Shopee, Mercado Livre"));
  assertEquals(embed(r).description, undefined);
  const keys = Object.keys(f);
  assert(keys.indexOf("Plano") < keys.indexOf("Grupos de origem"));
});

Deno.test("primeira oferta: resumo com produto, marketplace, preço e desconto; chaves do resumo não repetem", () => {
  const r = render(ev({
    category: "bot",
    title: "Primeira oferta recebida",
    detail: {
      nome: "Diego",
      email: "diego@x.com",
      produto: "Fone Bluetooth XYZ",
      marketplace: "Shopee",
      preco: 89.9,
      preco_original: 138.5,
      desconto: 35,
      minutos_ate_primeira_oferta: 135,
      painel: PAINEL,
    },
  }));
  assertEquals(embed(r).description, esc("Fone Bluetooth XYZ · Shopee · R$ 89,90 (-35%)"));
  const f = fields(r);
  for (const k of ["Produto", "Marketplace", "Preço", "Desconto"]) assertEquals(k in f, false, k);
  assertEquals(f["Preço original"], esc("R$ 138,50"));
  assertEquals(f["Desde a ativação do bot"], "2 h 15 min");
  assert(r.telegram.includes("Fone Bluetooth XYZ · Shopee · R$ 89,90 (-35%)"));
});

Deno.test("primeira oferta: sem bot_started não há tempo desde a ativação; sem desconto e sem preço", () => {
  const r = render(ev({
    category: "bot",
    title: "Primeira oferta recebida",
    detail: { nome: "Eva", produto: "Mouse", marketplace: "Amazon", preco: 49 },
  }));
  assertEquals(embed(r).description, esc("Mouse · Amazon · R$ 49,00"));
  assertEquals("Desde a ativação do bot" in fields(r), false);

  const r2 = render(ev({
    category: "bot",
    title: "Primeira oferta recebida",
    detail: { nome: "Eva", produto: "Mouse" },
  }));
  assertEquals(embed(r2).description, "Mouse");
});

Deno.test("primeira oferta: produto malicioso é escapado no Discord e no Telegram", () => {
  const r = render(ev({
    category: "bot",
    title: "Primeira oferta recebida",
    detail: { produto: "[x](https://evil) <b>oi</b>", marketplace: "Shopee", preco: 10, preco_original: 20 },
  }));
  const d = embed(r).description as string;
  assert(!d.includes("[x](https://evil)"));
  assert(d.includes(esc("[x](https://evil)")));
  assert(!r.telegram.includes("<b>oi</b>"));
  assert(r.telegram.includes("&lt;b&gt;oi&lt;/b&gt;"));

  // fora do resumo (outro título), o produto vira campo e também é escapado
  const r2 = render(ev({ category: "bot", title: "Outro", detail: { produto: "[x](https://evil)" } }));
  assertEquals(fields(r2)["Produto"], esc("[x](https://evil)"));
});
