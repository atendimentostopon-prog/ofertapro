// Parse do texto de uma mensagem de oferta (grupos de WhatsApp de origem).
export interface ParsedOffer {
  urls: string[];
  title: string | null;
  salePrice: number | null;
  originalPrice: number | null;
  coupon: string | null;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const HAS_URL = /https?:\/\//i;
const PRICE_RE = /R\$\s*([\d.]+(?:,\d{1,2})?)/gi;

export function parseBRL(raw: string): number | null {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseOfferText(text: string): ParsedOffer {
  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?*_~]+$/, "")))];
  const prices = [...text.matchAll(PRICE_RE)]
    .map((m) => parseBRL(m[1]))
    .filter((n): n is number => n !== null);
  let salePrice: number | null = null;
  let originalPrice: number | null = null;
  if (prices.length === 1) salePrice = prices[0];
  if (prices.length >= 2) {
    // shortcut: assume que os 2 primeiros preços são "de/por"; frete e parcela costumam vir depois.
    // Se errar, o enrich-product e o template do usuário ainda mostram o produto certo.
    const [a, b] = prices;
    salePrice = Math.min(a, b);
    originalPrice = Math.max(a, b) > salePrice ? Math.max(a, b) : null;
  }
  const coupon = text.match(/cupom\s*[:\-]?\s*([A-Z0-9_-]{3,30})/i)?.[1]?.toUpperCase() ?? null;
  const title = text
    .split("\n")
    .map((l) => l.replace(/[*_~]/g, "").replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .find((l) => l.length >= 6 && !HAS_URL.test(l) && !/R\$/.test(l) && !/cupom/i.test(l)) ?? null;
  return { urls, title, salePrice, originalPrice, coupon };
}
