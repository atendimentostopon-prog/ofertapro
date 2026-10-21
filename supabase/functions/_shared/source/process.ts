// Orquestra uma mensagem de grupo de origem: gates, link, conversão, dedupe e disparo.
// Toda E/S entra por ProcessDeps (testável sem rede nem banco).
import { type AffiliateCreds, ConversionError, type ConversionCode } from "./affiliate.ts";
import { withinHours } from "./hours.ts";
import { detectMarketplace, productKey, type SourceMarketplace } from "./links.ts";
import { parseOfferText } from "./parse.ts";

export type SkipReason =
  | "no_access" | "bot_paused" | "outside_hours" | "no_link" | "unsupported_marketplace"
  | ConversionCode | "duplicate" | "no_destination" | "no_price";

export interface SourceRow {
  id: string;
  user_id: string;
  whatsapp_group_id: string;
  raw_text: string;
  media_key: unknown;
  attempts: number;
}

export interface SourceContext {
  creds: AffiliateCreds;
  ativo: boolean;
  horario_inicio: string | null;
  horario_fim: string | null;
  defaultChannelIds: string[];
  ownChannelId: string | null;
  routeChannelIds: string[] | null;
  routeCategory: string | null;
  groupId: string;
}

export interface DispatchBody {
  channel_ids: string[];
  offer: {
    name: string;
    affiliate_link: string;
    marketplace: SourceMarketplace;
    sale_price: number;
    original_price?: number;
    coupon?: string;
    image?: string;
    category?: string;
  };
  source: { type: "whatsapp"; key: string };
}

export interface MlEvent {
  outcome: "auto" | "manual";
  reason: string | null;
  product_name: string | null;
  source_url: string;
  short_url: string | null;
}

export type Enriched = Partial<{ title: string; image: string; salePrice: number; originalPrice: number }>;

export interface ProcessDeps {
  claim(id: string): Promise<SourceRow | null>;
  loadContext(userId: string, groupId: string): Promise<SourceContext>;
  hasAccess(userId: string): Promise<boolean>;
  recentlyDispatched(userId: string, key: string): Promise<boolean>;
  enrich(url: string): Promise<Enriched>;
  fetchMediaUrl(row: SourceRow): Promise<string | null>;
  dispatch(userId: string, body: DispatchBody): Promise<{ offer_id: string | null; status: string }>;
  markMlInvalid(userId: string, detail: string): Promise<void>;
  recordMlEvent(userId: string, event: MlEvent): Promise<void>;
  finish(id: string, patch: Record<string, unknown>): Promise<void>;
  convert(url: string, mp: SourceMarketplace, creds: AffiliateCreds): Promise<string>;
  expand(url: string): Promise<string>;
  now(): Date;
}

const MAX_ATTEMPTS = 3;

// Motivo no formato de ml_link_events (o mesmo que o bot grava).
const ML_REASON: Record<ConversionCode, string> = {
  missing_credentials: "sem_tag",
  ml_session_invalid: "sessao_recusada",
  conversion_failed: "erro_api",
};

export async function processSourceMessage(d: ProcessDeps, id: string) {
  const row = await d.claim(id);
  if (!row) return "noop" as const;

  const skip = async (reason: SkipReason, extra: Record<string, unknown> = {}) => {
    await d.finish(id, { status: "skipped", reason, processed_at: d.now().toISOString(), ...extra });
    return "skipped" as const;
  };

  try {
    if (!(await d.hasAccess(row.user_id))) return skip("no_access");
    const ctx = await d.loadContext(row.user_id, row.whatsapp_group_id);
    if (!ctx.ativo) return skip("bot_paused");
    if (!withinHours(d.now(), ctx.horario_inicio, ctx.horario_fim)) return skip("outside_hours");

    const parsed = parseOfferText(row.raw_text);
    if (parsed.urls.length === 0) return skip("no_link");

    let url: string | null = null;
    let mp: SourceMarketplace | null = null;
    for (const candidate of parsed.urls) {
      const expanded = await d.expand(candidate).catch(() => null);
      const found = expanded ? detectMarketplace(expanded) : null;
      if (expanded && found && found !== "other") {
        url = expanded;
        mp = found;
        break;
      }
    }
    if (!url || !mp) return skip("unsupported_marketplace");

    const dedupeKey = productKey(url, mp);
    const base = { marketplace: mp, dedupe_key: dedupeKey };
    if (await d.recentlyDispatched(row.user_id, dedupeKey)) return skip("duplicate", base);

    const channels = (ctx.routeChannelIds?.length ? ctx.routeChannelIds : ctx.defaultChannelIds)
      .filter((c) => c !== ctx.ownChannelId);
    if (channels.length === 0) return skip("no_destination", base);

    let affiliateLink: string;
    try {
      affiliateLink = await d.convert(url, mp, ctx.creds);
    } catch (e) {
      if (!(e instanceof ConversionError)) throw e;
      if (e.code === "ml_session_invalid") await d.markMlInvalid(row.user_id, e.message);
      if (mp === "mercadolivre") {
        await d.recordMlEvent(row.user_id, { outcome: "manual", reason: ML_REASON[e.code], product_name: parsed.title, source_url: url, short_url: null });
      }
      return skip(e.code, base);
    }
    if (mp === "mercadolivre") {
      await d.recordMlEvent(row.user_id, { outcome: "auto", reason: null, product_name: parsed.title, source_url: url, short_url: affiliateLink });
    }

    // Sempre consulta: além de completar título/preço, é a fonte principal da imagem.
    const extra: Enriched = await d.enrich(url).catch(() => ({}));
    const salePrice = parsed.salePrice ?? extra.salePrice ?? null;
    if (!salePrice) return skip("no_price", base);
    const image = extra.image ?? (await d.fetchMediaUrl(row).catch(() => null)) ?? undefined;

    const result = await d.dispatch(row.user_id, {
      channel_ids: channels,
      offer: {
        name: parsed.title ?? extra.title ?? "Oferta",
        affiliate_link: affiliateLink,
        marketplace: mp,
        sale_price: salePrice,
        original_price: parsed.originalPrice ?? extra.originalPrice ?? undefined,
        coupon: parsed.coupon ?? undefined,
        image,
        category: ctx.routeCategory ?? undefined,
      },
      source: { type: "whatsapp", key: ctx.groupId },
    });
    await d.finish(id, { status: "dispatched", reason: null, offer_id: result.offer_id, processed_at: d.now().toISOString(), ...base });
    return "dispatched" as const;
  } catch (e) {
    const last = row.attempts >= MAX_ATTEMPTS;
    await d.finish(id, {
      status: last ? "failed" : "pending",
      reason: String((e as Error)?.message ?? e).slice(0, 300),
      ...(last ? { processed_at: d.now().toISOString() } : {}),
    });
    return last ? "failed" as const : "retry" as const;
  }
}
