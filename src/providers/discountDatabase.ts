import discountDatabaseSeed from "../data/discounts.seed.json";
import type { CartGame, DiscountDatabase, DiscountDatabaseEntry } from "../types";

const discountDatabase = discountDatabaseSeed as DiscountDatabase;

export function getDiscountDatabaseEntries(game: Pick<CartGame, "appId" | "title" | "currency">): DiscountDatabaseEntry[] {
  if (!game.currency) return [];

  const title = normalizeTitle(game.title);
  return discountDatabase.entries
    .filter((entry) => entry.currency === game.currency)
    .filter((entry) => {
      const appIdMatches = Boolean(entry.appId && game.appId && entry.appId === game.appId);
      const titleMatches = Boolean(entry.titleIncludes && title.includes(normalizeTitle(entry.titleIncludes)));
      return appIdMatches || titleMatches;
    })
    .sort((left, right) => scoreEntry(right, game) - scoreEntry(left, game));
}

export function getDiscountDatabase(): DiscountDatabase {
  return discountDatabase;
}

function scoreEntry(entry: DiscountDatabaseEntry, game: Pick<CartGame, "appId" | "title">): number {
  let score = 0;
  if (entry.appId && game.appId && entry.appId === game.appId) score += 20;
  if (entry.titleIncludes && normalizeTitle(game.title).includes(normalizeTitle(entry.titleIncludes))) score += 10;
  if (entry.expectedPriceMinor !== undefined) score += 5;
  if (entry.confidence === "high") score += 3;
  if (entry.confidence === "medium") score += 2;
  return score;
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
