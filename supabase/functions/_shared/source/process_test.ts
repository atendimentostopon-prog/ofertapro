import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { ConversionError } from "./affiliate.ts";
import { type DispatchBody, type MlEvent, processSourceMessage, type ProcessDeps, type SourceContext, type SourceRow } from "./process.ts";

const row: SourceRow = {
  id: "m1", user_id: "u1", whatsapp_group_id: "g1", media_key: null, attempts: 1,
  raw_text: "Secador Taiff\nDe R$ 199,90 por R$ 99,90\nhttps://amzn.to/x",
};
const ctx = (over: Partial<SourceContext> = {}): SourceContext => ({
  creds: { amazon_tag: "meu-20", shopee_app_id: null, shopee_app_secret: null, mercadolivre_tag: null, ml_session: null },
  ativo: true, horario_inicio: null, horario_fim: null,
  defaultChannelIds: ["c1", "c-own"], ownChannelId: "c-own", routeChannelIds: null, routeCategory: null, groupId: "g1",
  ...over,
});

function deps(over: Partial<ProcessDeps> = {}, c = ctx()) {
  const finished: Record<string, unknown>[] = [];
  const dispatched: DispatchBody[] = [];
  const mlEvents: MlEvent[] = [];
  const d: ProcessDeps = {
    claim: async () => ({ ...row }),
    loadContext: async () => c,
    hasAccess: async () => true,
    recentlyDispatched: async () => false,
    enrich: async () => ({ image: "https://img/x.jpg" }),
    fetchMediaUrl: async () => null,
    dispatch: async (_u, body) => { dispatched.push(body); return { offer_id: "o1", status: "success" }; },
    markMlInvalid: async () => {},
    recordMlEvent: async (_u, e) => { mlEvents.push(e); },
    finish: async (_id, patch) => { finished.push(patch); },
    convert: async (url) => `${url}?tag=meu-20`,
    expand: async () => "https://www.amazon.com.br/dp/B0ABCDEF12",
    now: () => new Date("2026-10-21T15:00:00Z"),
    ...over,
  };
  return { d, finished, dispatched, mlEvents };
}

async function reasonOf(over: Partial<ProcessDeps> = {}, c = ctx()) {
  const x = deps(over, c);
  await processSourceMessage(x.d, "m1");
  return x.finished[0]?.reason;
}

Deno.test("caminho feliz: converte e dispara sem o canal da própria origem (Review Focus 3)", async () => {
  const { d, finished, dispatched } = deps();
  assertEquals(await processSourceMessage(d, "m1"), "dispatched");
  assertEquals(dispatched[0].channel_ids, ["c1"]);
  assertEquals(dispatched[0].offer.sale_price, 99.9);
  assertEquals(dispatched[0].offer.original_price, 199.9);
  assertEquals(dispatched[0].offer.image, "https://img/x.jpg");
  assertEquals(dispatched[0].offer.affiliate_link, "https://www.amazon.com.br/dp/B0ABCDEF12?tag=meu-20");
  assertEquals(dispatched[0].source, { type: "whatsapp", key: "g1" });
  assertEquals(finished[0].status, "dispatched");
  assertEquals(finished[0].offer_id, "o1");
  assertEquals(finished[0].dedupe_key, "amazon:B0ABCDEF12");
});

Deno.test("mensagem já reivindicada por outro worker não faz nada", async () => {
  const { d, finished } = deps({ claim: async () => null });
  assertEquals(await processSourceMessage(d, "m1"), "noop");
  assertEquals(finished.length, 0);
});

Deno.test("dedupe 6h (Review Focus 2)", async () => {
  const { d, finished, dispatched } = deps({ recentlyDispatched: async () => true });
  assertEquals(await processSourceMessage(d, "m1"), "skipped");
  assertEquals(finished[0].reason, "duplicate");
  assertEquals(dispatched.length, 0);
});

Deno.test("não dispara sem credencial (Review Focus 1)", async () => {
  const { d, finished, dispatched } = deps({ convert: async () => { throw new ConversionError("missing_credentials"); } });
  assertEquals(await processSourceMessage(d, "m1"), "skipped");
  assertEquals(finished[0].reason, "missing_credentials");
  assertEquals(dispatched.length, 0);
});

Deno.test("gates de acesso, pausa e horário", async () => {
  assertEquals(await reasonOf({ hasAccess: async () => false }), "no_access");
  assertEquals(await reasonOf({}, ctx({ ativo: false })), "bot_paused");
  assertEquals(await reasonOf({}, ctx({ horario_inicio: "20:00", horario_fim: "22:00" })), "outside_hours");
});

Deno.test("sem link, loja não suportada, sem destino e sem preço", async () => {
  assertEquals(await reasonOf({ claim: async () => ({ ...row, raw_text: "bom dia" }) }), "no_link");
  assertEquals(await reasonOf({ expand: async () => "https://www.magazineluiza.com.br/p/1" }), "unsupported_marketplace");
  assertEquals(await reasonOf({}, ctx({ defaultChannelIds: ["c-own"] })), "no_destination");
  assertEquals(await reasonOf({ claim: async () => ({ ...row, raw_text: "Secador Taiff\nhttps://amzn.to/x" }), enrich: async () => ({}) }), "no_price");
});

Deno.test("preço e imagem vindos do enrich completam a mensagem", async () => {
  const { d, dispatched } = deps({
    claim: async () => ({ ...row, raw_text: "Secador Taiff\nhttps://amzn.to/x" }),
    enrich: async () => ({ salePrice: 89.9, title: "Secador X" }),
    fetchMediaUrl: async () => "https://storage/x.jpg",
  });
  assertEquals(await processSourceMessage(d, "m1"), "dispatched");
  assertEquals(dispatched[0].offer.sale_price, 89.9);
  assertEquals(dispatched[0].offer.name, "Secador Taiff");
  assertEquals(dispatched[0].offer.image, "https://storage/x.jpg");
});

Deno.test("enrich que falha não derruba o disparo", async () => {
  const { d } = deps({ enrich: async () => { throw new Error("timeout"); } });
  assertEquals(await processSourceMessage(d, "m1"), "dispatched");
});

Deno.test("falha transitória volta para a fila até 3 tentativas", async () => {
  const x = deps({ dispatch: async () => { throw new Error("HTTP 503"); } });
  assertEquals(await processSourceMessage(x.d, "m1"), "retry");
  assertEquals(x.finished[0].status, "pending");
  const y = deps({ claim: async () => ({ ...row, attempts: 3 }), dispatch: async () => { throw new Error("HTTP 503"); } });
  assertEquals(await processSourceMessage(y.d, "m1"), "failed");
  assertEquals(y.finished[0].status, "failed");
});

Deno.test("ML inválido marca saúde da sessão e registra evento manual", async () => {
  let marked = false;
  const x = deps({
    expand: async () => "https://produto.mercadolivre.com.br/MLB-1234567-x",
    convert: async () => { throw new ConversionError("ml_session_invalid", "HTTP 401"); },
    markMlInvalid: async () => { marked = true; },
  });
  await processSourceMessage(x.d, "m1");
  assertEquals(marked, true);
  assertEquals(x.finished[0].reason, "ml_session_invalid");
  assertEquals(x.mlEvents[0], { outcome: "manual", reason: "sessao_recusada", product_name: "Secador Taiff", source_url: "https://produto.mercadolivre.com.br/MLB-1234567-x", short_url: null });
});

Deno.test("ML convertido registra evento auto", async () => {
  const x = deps({
    expand: async () => "https://produto.mercadolivre.com.br/MLB-1234567-x",
    convert: async () => "https://mercadolivre.com/sec/meu",
  });
  await processSourceMessage(x.d, "m1");
  assertEquals(x.mlEvents[0].outcome, "auto");
  assertEquals(x.mlEvents[0].short_url, "https://mercadolivre.com/sec/meu");
});

Deno.test("primeiro link suportado vence quando há vários", async () => {
  const x = deps({
    claim: async () => ({ ...row, raw_text: "Kit R$ 10,00\nhttps://bit.ly/grupo\nhttps://amzn.to/x" }),
    expand: async (u) => (u.includes("bit.ly") ? "https://chat.whatsapp.com/abc" : "https://www.amazon.com.br/dp/B0ABCDEF12"),
  });
  assertEquals(await processSourceMessage(x.d, "m1"), "dispatched");
});
