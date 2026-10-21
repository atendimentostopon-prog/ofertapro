// Converte o link do produto para o link de afiliado DO USUÁRIO.
// Regra: sem credencial ou com falha, lança ConversionError. Nunca devolve o link original
// (ele pode carregar a comissão de outra pessoa).
import { canonicalUrl, type SourceMarketplace } from "./links.ts";

export type ConversionCode = "missing_credentials" | "ml_session_invalid" | "conversion_failed";

export class ConversionError extends Error {
  constructor(public code: ConversionCode, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
  }
}

export interface AffiliateCreds {
  amazon_tag: string | null;
  shopee_app_id: string | null;
  shopee_app_secret: string | null;
  mercadolivre_tag: string | null;
  ml_session: { cookies: { name: string; value: string }[] } | null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function amazon(url: string, tag: string | null): string {
  if (!tag?.trim()) throw new ConversionError("missing_credentials");
  const u = new URL(url);
  const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1];
  // Sem ASIN não dá para garantir que a tag de terceiro saiu (ex.: link curto não expandido).
  if (!asin) throw new ConversionError("conversion_failed", "ASIN não encontrado");
  const out = new URL(`${u.origin}/dp/${asin.toUpperCase()}`);
  out.searchParams.set("tag", tag.trim());
  return out.toString();
}

// Shopee Affiliate Open API (generateShortLink), assinatura SHA256(appId + ts + payload + secret).
async function shopee(url: string, c: AffiliateCreds, f: typeof fetch): Promise<string> {
  if (!c.shopee_app_id?.trim() || !c.shopee_app_secret?.trim()) throw new ConversionError("missing_credentials");
  const appId = c.shopee_app_id.trim();
  const payload = JSON.stringify({
    query: `mutation{generateShortLink(input:{originUrl:${JSON.stringify(canonicalUrl(url))},subIds:["aflyo"]}){shortLink}}`,
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await sha256Hex(`${appId}${ts}${payload}${c.shopee_app_secret.trim()}`);
  const res = await f("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sig}` },
    body: payload,
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({}));
  const link = j?.data?.generateShortLink?.shortLink;
  if (!link) throw new ConversionError("conversion_failed", j?.errors?.[0]?.message ?? `HTTP ${res.status}`);
  return link;
}

// Mesmo contrato da extensão v1.2 (browser-extension/mercadolivre/background.js, pageGenerate).
async function mercadoLivre(url: string, c: AffiliateCreds, f: typeof fetch): Promise<string> {
  const cookies = c.ml_session?.cookies ?? [];
  if (!c.mercadolivre_tag?.trim() || !cookies.some((k) => k.name === "ssid")) throw new ConversionError("missing_credentials");
  const res = await f("https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      Cookie: cookies.map((k) => `${k.name}=${k.value}`).join("; "),
      "x-csrf-token": cookies.find((k) => k.name === "_csrf")?.value ?? "",
      Origin: "https://www.mercadolivre.com.br",
      Referer: "https://www.mercadolivre.com.br/affiliate-program",
    },
    body: JSON.stringify({ url: canonicalUrl(url), tag: c.mercadolivre_tag.trim() }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) throw new ConversionError("ml_session_invalid", "HTTP 401");
  // 403: o ML recusa cliente que não imita o TLS do Chrome mesmo com cookie válido (o bot usa
  // curl_cffi por isso). Não é prova de sessão vencida: não marca ml_session.health.
  if (res.status === 403) throw new ConversionError("conversion_failed", "HTTP 403 (cliente recusado pelo ML)");
  const j = await res.json().catch(() => ({}));
  if (!j?.short_url) throw new ConversionError("conversion_failed", `HTTP ${res.status}`);
  return j.short_url;
}

export function convertLink(url: string, mp: SourceMarketplace, creds: AffiliateCreds, f: typeof fetch = fetch): Promise<string> {
  if (mp === "amazon") return Promise.resolve().then(() => amazon(url, creds.amazon_tag));
  if (mp === "shopee") return shopee(url, creds, f);
  return mercadoLivre(url, creds, f);
}
