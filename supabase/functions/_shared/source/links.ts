// Marketplace, id do produto, URL canônica e expansão de link curto.
import { assertPublicUrl } from "../ssrf.ts";

export type SourceMarketplace = "amazon" | "mercadolivre" | "shopee";

const HOSTS: Array<[RegExp, SourceMarketplace]> = [
  [/(^|\.)amazon\.com(\.br)?$|^amzn\.(to|com)$|^a\.co$/i, "amazon"],
  [/(^|\.)mercadoli(vre|bre)\.com(\.br)?$|^meli\.la$/i, "mercadolivre"],
  [/(^|\.)shopee\.com\.br$|^shope\.ee$/i, "shopee"],
];

export function detectMarketplace(url: string): SourceMarketplace | "other" | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? "other";
}

export function canonicalUrl(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}

export function productKey(url: string, mp: SourceMarketplace): string {
  const u = new URL(url);
  if (mp === "amazon") {
    const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) return `amazon:${asin.toUpperCase()}`;
  }
  if (mp === "mercadolivre") {
    const id = (u.pathname + u.search).match(/MLB-?(\d{6,})/i)?.[1];
    if (id) return `mercadolivre:MLB${id}`;
  }
  if (mp === "shopee") {
    const m = u.pathname.match(/-i\.(\d+)\.(\d+)/) ?? u.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (m) return `shopee:${m[1]}.${m[2]}`;
  }
  return `${mp}:${canonicalUrl(url)}`;
}

// Segue até 5 redirects sem seguir automático: cada hop passa pela guarda SSRF antes do fetch.
export async function expandUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
  guard: (u: string) => Promise<void> = assertPublicUrl,
): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await guard(current);
    const res = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(6000) });
    const loc = res.headers.get("location");
    await res.body?.cancel();
    if (res.status < 300 || res.status >= 400 || !loc) return current;
    current = new URL(loc, current).toString();
  }
  return current;
}
