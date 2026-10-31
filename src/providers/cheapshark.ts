import type { CurrencyCode, DiscountDatabaseEntry } from "../types";

const API_ROOT = "https://www.cheapshark.com/api/1.0";
const STEAM_STORE_ID = "1";

type CheapSharkLookupGame = {
  gameID?: string;
  steamAppID?: string;
  external?: string;
};

type CheapSharkGameDetails = {
  cheapestPriceEver?: {
    price?: string;
    date?: number;
  };
  deals?: Array<{
    storeID?: string;
    price?: string;
    retailPrice?: string;
    savings?: string;
  }>;
};

export class CheapSharkFallbackProvider {
  async getDiscountEntry(appId: string, currency: CurrencyCode, title: string): Promise<DiscountDatabaseEntry | null> {
    try {
      const lookup = await this.fetchJson<CheapSharkLookupGame[]>(`${API_ROOT}/games?steamAppID=${encodeURIComponent(appId)}`);
      const match = lookup.find((game) => game.steamAppID === appId) ?? lookup[0];
      if (!match?.gameID) return null;

      const details = await this.fetchJson<CheapSharkGameDetails>(`${API_ROOT}/games?id=${encodeURIComponent(match.gameID)}`);
      const discount = getBestDiscount(details);
      if (!discount || discount.percent < 15) return null;

      return {
        id: `cheapshark-${appId}-${discount.source}`,
        appId,
        currency,
        expectedDiscountPercent: discount.percent,
        confidence: discount.source === "steam-current-deal" ? "medium" : "low",
        note: `Fallback discount for ${title}.`
      };
    } catch {
      return null;
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      credentials: "omit",
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error(`CheapShark request failed: ${response.status}`);
    return (await response.json()) as T;
  }
}

function getBestDiscount(details: CheapSharkGameDetails): { percent: number; source: "steam-current-deal" | "external-current-deal" | "historical-low" } | null {
  const deals = details.deals ?? [];
  const steamDeal = bestSavings(deals.filter((deal) => deal.storeID === STEAM_STORE_ID));
  if (steamDeal >= 15) return { percent: steamDeal, source: "steam-current-deal" };

  const externalDeal = bestSavings(deals);
  const historicalLow = historicalLowDiscount(details);
  const best = Math.max(externalDeal, historicalLow);
  if (best < 15) return null;

  return {
    percent: clampPercent(best),
    source: historicalLow >= externalDeal ? "historical-low" : "external-current-deal"
  };
}

function bestSavings(deals: CheapSharkGameDetails["deals"]): number {
  return Math.max(0, ...(deals ?? []).map((deal) => clampPercent(Number.parseFloat(deal.savings ?? "0"))));
}

function historicalLowDiscount(details: CheapSharkGameDetails): number {
  const cheapest = Number.parseFloat(details.cheapestPriceEver?.price ?? "0");
  const retail = Math.max(0, ...(details.deals ?? []).map((deal) => Number.parseFloat(deal.retailPrice ?? "0")));
  if (!Number.isFinite(cheapest) || !Number.isFinite(retail) || cheapest <= 0 || retail <= cheapest) return 0;
  return clampPercent(((retail - cheapest) * 100) / retail);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(90, Math.round(value)));
}
