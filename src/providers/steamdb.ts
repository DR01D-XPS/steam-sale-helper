import {
  getCachedPriceHistory,
  getLastSteamDbAttempt,
  getSettings,
  markSteamDbAttempt,
  setCachedPriceHistory
} from "../lib/storage";
import type { GamePriceHistory, PriceHistoryPoint, SteamDbProvider } from "../types";

export class SteamDbHtmlProvider implements SteamDbProvider {
  async getPriceHistory(appId: string, currency: string): Promise<GamePriceHistory | null> {
    try {
      const response = await fetch(`https://steamdb.info/app/${encodeURIComponent(appId)}/`, {
        credentials: "omit",
        headers: { accept: "text/html" }
      });
      if (!response.ok) return null;
      const html = await response.text();
      const points = parseSteamDbPriceHistory(appId, currency, html);
      return points.length > 0 ? { appId, currency, points, updatedAt: new Date().toISOString() } : null;
    } catch {
      return null;
    }
  }
}

export class CachedSteamDbProvider implements SteamDbProvider {
  constructor(private readonly inner: SteamDbProvider) {}

  async getPriceHistory(appId: string, currency: string): Promise<GamePriceHistory | null> {
    const settings = await getSettings();
    const cached = await getCachedPriceHistory(appId, currency, settings.steamDbCacheTtlHours);
    if (cached?.points.length) return cached;

    const lastAttempt = await getLastSteamDbAttempt(appId, currency);
    if (lastAttempt && Date.now() - Date.parse(lastAttempt) < settings.steamDbCacheTtlHours * 3_600_000) {
      return cached;
    }

    await markSteamDbAttempt(appId, currency);
    const fresh = await this.inner.getPriceHistory(appId, currency);
    if (fresh) await setCachedPriceHistory(fresh);
    return fresh ?? cached;
  }
}

export class MockSteamDbProvider implements SteamDbProvider {
  async getPriceHistory(appId: string, currency: string): Promise<GamePriceHistory> {
    const base = Number(appId.slice(-2)) || 49;
    const original = (base + 10) * 1000;
    const summer = Math.round(original * 0.4);
    const winter = Math.round(original * 0.35);
    const autumn = Math.round(original * 0.5);
    return {
      appId,
      currency,
      updatedAt: new Date().toISOString(),
      points: [
        point(appId, currency, "2026-03-20", Math.round(original * 0.6), original),
        point(appId, currency, "2026-06-27", summer, original),
        point(appId, currency, "2026-10-02", autumn, original),
        point(appId, currency, "2026-12-20", winter, original)
      ]
    };
  }
}

export function parseSteamDbPriceHistory(appId: string, currency: string, html: string): PriceHistoryPoint[] {
  const points: PriceHistoryPoint[] = [];
  const datePattern = /(\d{4}-\d{2}-\d{2})/g;
  for (const match of html.matchAll(datePattern)) {
    const start = Math.max(0, match.index - 240);
    const end = Math.min(html.length, match.index + 240);
      const chunk = stripHtml(html.slice(start, end));
      if (!new RegExp(currency, "i").test(chunk) && !/[₽$€₸₴₺£₹¥₩]|R\$|zł|TL/.test(chunk)) continue;
    const price = normalizeSteamDbPriceToMinorUnits(chunk, currency);
    if (price === null) continue;
    const original = findOriginalPrice(chunk, currency, price);
    points.push({
      appId,
      currency,
      date: match[1],
      priceMinor: price,
      originalPriceMinor: original,
      discountPercent: original ? calculateDiscountPercent(original, price) : undefined,
      source: "steamdb"
    });
  }
  return dedupePoints(points).sort((a, b) => a.date.localeCompare(b.date));
}

function point(appId: string, currency: string, date: string, priceMinor: number, originalPriceMinor: number): PriceHistoryPoint {
  return {
    appId,
    currency,
    date,
    priceMinor,
    originalPriceMinor,
    discountPercent: calculateDiscountPercent(originalPriceMinor, priceMinor),
    source: "steamdb"
  };
}

function findOriginalPrice(text: string, currency: string, price: number): number | undefined {
  const numbers = [...text.matchAll(/[₽$€₸₴₺£₹¥₩]?\s*[\d\s.,]+\s*(?:R\$|zł|TL|₽|\$|€|₸|₴|₺|£|₹|¥|₩)?/g)]
    .map((match) => normalizeSteamDbPriceToMinorUnits(match[0], currency))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a);
  return numbers.find((value) => value > price);
}

function normalizeSteamDbPriceToMinorUnits(text: string, currency: string): number | null {
  const normalized = text.replace(/\s+/g, " ").replace(/[^\d.,]/g, "");
  if (!normalized) return null;
  const digitsOnly = normalized.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  if (currency === "JPY" || currency === "KRW") return Number.parseInt(digitsOnly, 10);

  const lastDot = normalized.lastIndexOf(".");
  const lastComma = normalized.lastIndexOf(",");
  const lastSeparator = Math.max(lastDot, lastComma);
  if (lastSeparator === -1) return Number.parseInt(digitsOnly, 10) * 100;

  const digitsAfter = normalized.slice(lastSeparator + 1).replace(/[^\d]/g, "").length;
  if (digitsAfter === 0 || digitsAfter > 2) return Number.parseInt(digitsOnly, 10) * 100;

  const integerPart = normalized.slice(0, lastSeparator).replace(/[^\d]/g, "") || "0";
  const fractionPart = normalized.slice(lastSeparator + 1).replace(/[^\d]/g, "").padEnd(2, "0").slice(0, 2);
  return Number.parseInt(integerPart, 10) * 100 + Number.parseInt(fractionPart, 10);
}

function calculateDiscountPercent(originalPriceMinor: number, salePriceMinor: number): number {
  if (originalPriceMinor <= 0 || salePriceMinor >= originalPriceMinor) return 0;
  return Math.round(((originalPriceMinor - salePriceMinor) * 100) / originalPriceMinor);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function dedupePoints(points: PriceHistoryPoint[]): PriceHistoryPoint[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.date}:${point.priceMinor}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
