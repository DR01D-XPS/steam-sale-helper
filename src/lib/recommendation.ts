import type {
  CartGame,
  CartRecommendationSummary,
  CurrencyCode,
  DiscountDatabaseEntry,
  GamePriceHistory,
  GameRecommendation,
  PriceHistoryPoint,
  SaleDiscountStats,
  SteamSaleEvent
} from "../types";
import { getFutureSales, isDateWithinRange } from "./dates";

export const SIGNIFICANT_DISCOUNT_DIFF_PP = 5;
export const SIGNIFICANT_PRICE_DIFF_RATIO = 0.1;

type RecommendationOptions = {
  now?: Date;
  insignificantPriceDiffRatio?: number;
  insignificantDiscountDiffPp?: number;
  discountDbEntries?: DiscountDatabaseEntry[];
  fallbackDiscountEntries?: DiscountDatabaseEntry[];
};

type Candidate = {
  sale: SteamSaleEvent;
  expectedPriceMinor: number;
  expectedDiscountPercent: number;
  confidence: "high" | "medium" | "low";
  reason: string;
  source: GameRecommendation["source"];
};

export function calculateSaleStats(history: GamePriceHistory, sales: SteamSaleEvent[]): SaleDiscountStats[] {
  const stats: SaleDiscountStats[] = [];
  for (const sale of sales) {
    const points = history.points.filter((point) => isDateWithinRange(point.date, sale.startDate, sale.endDate));
    if (points.length === 0) continue;
    const discounts = points.map((point) => point.discountPercent ?? 0).sort((a, b) => a - b);
    const best = points.reduce((winner, point) => (point.priceMinor < winner.priceMinor ? point : winner), points[0]);
    stats.push({
      saleId: sale.id,
      saleName: sale.name,
      bestPriceMinor: best.priceMinor,
      bestDiscountPercent: best.discountPercent ?? 0,
      averageDiscountPercent: Math.round(discounts.reduce((sum, value) => sum + value, 0) / discounts.length),
      medianDiscountPercent: discounts[Math.floor(discounts.length / 2)],
      observations: points.length
    });
  }
  return stats;
}

export function buildGameRecommendation(
  game: CartGame,
  history: GamePriceHistory | null,
  sales: SteamSaleEvent[],
  options: RecommendationOptions = {}
): GameRecommendation {
  if (!game.currency) return fallback(game, "error", "Цена распознана не полностью. В расчете используется текущая цена.");
  if (game.currentPriceMinor === null) return fallback(game, "error", "Цена распознана не полностью. В расчете используется текущая цена.");

  const now = options.now ?? new Date();
  const currentDiscount = game.currentDiscountPercent ?? 0;
  const activeSeasonalSale = findActiveSeasonalSale(sales, now);
  const nextSeasonalSale = findNextSeasonalSale(sales, now);
  const nextAnySale = getFutureSales(sales, now)[0];

  if (game.currentPriceMinor <= 0) {
    return {
      appId: game.appId,
      title: game.title,
      state: "buy-now",
      currentPriceMinor: 0,
      expectedPriceMinor: 0,
      savingsMinor: 0,
      currency: game.currency,
      confidence: "high",
      reason: "Игра бесплатная, ждать распродажу не нужно.",
      source: "current-price",
      usedInCartTotal: true,
      statusMessage: "Игра бесплатная."
    };
  }

  const discountDbCandidate = chooseDiscountDatabaseCandidate(game, sales, options.discountDbEntries ?? [], now);
  if (discountDbCandidate) {
    return buildDiscountDatabaseRecommendation(game, discountDbCandidate, activeSeasonalSale, currentDiscount);
  }

  if (!game.appId) return fallback(game, "no-data", "По этому товару пока нет точного прогноза. В расчете используется текущая цена.");

  if (!history || history.points.length === 0) {
    const fallbackDiscountCandidate = chooseDiscountDatabaseCandidate(game, sales, options.fallbackDiscountEntries ?? [], now);
    if (fallbackDiscountCandidate) {
      return buildDiscountDatabaseRecommendation(game, fallbackDiscountCandidate, activeSeasonalSale, currentDiscount);
    }

    const sale = nextSeasonalSale ?? nextAnySale;
    const estimatedDiscountCandidate = sale ? estimateWithoutHistory(game, sale, currentDiscount) : null;
    if (estimatedDiscountCandidate) {
      return buildDiscountDatabaseRecommendation(game, estimatedDiscountCandidate, activeSeasonalSale, currentDiscount);
    }

    if (sale) {
      return {
        appId: game.appId,
        title: game.title,
        state: "no-data",
        sale,
        currentPriceMinor: game.currentPriceMinor,
        expectedPriceMinor: game.currentPriceMinor,
        expectedDiscountPercent: 0,
        savingsMinor: 0,
        currency: game.currency,
        confidence: "low",
        reason: `Ближайшая крупная распродажа: ${sale.name}. Точной цены пока нет, поэтому сейчас учитывается текущая цена.`,
        source: "unavailable",
        usedInCartTotal: true,
        statusMessage: "Показываем ближайшую распродажу."
      };
    }

    return fallback(game, "no-data", "Пока нет точного прогноза. В расчете используется текущая цена.");
  }

  const futureSales = getFutureSales(sales, now);
  if (futureSales.length === 0) {
    return fallback(game, "no-data", "Пока нет ближайшей распродажи. В расчете используется текущая цена.");
  }

  const candidates = preferReliableCandidates(
    futureSales.map((sale) => estimateForSale(sale, history, sales, game.currentPriceMinor ?? 0))
  );
  const best = chooseBestCandidate(candidates, game.currentPriceMinor, options);

  if (!best) {
    const sale = nextSeasonalSale ?? nextAnySale;
    return sale
      ? {
          appId: game.appId,
          title: game.title,
          state: "no-data",
          sale,
          currentPriceMinor: game.currentPriceMinor,
          expectedPriceMinor: game.currentPriceMinor,
          expectedDiscountPercent: currentDiscount,
          savingsMinor: 0,
          currency: game.currency,
          confidence: "low",
          reason: `Ближайшая крупная распродажа: ${sale.name}. Точной цены пока нет.`,
          source: "unavailable",
          usedInCartTotal: true
        }
      : fallback(game, "no-data", "Пока нет точного прогноза.");
  }

  if (best.source === "historical-best" && best.expectedPriceMinor < Math.round(game.currentPriceMinor * 0.35)) {
    return fallback(
      game,
      "no-data",
      "Пока нет надежной цены для ожидания. В расчете используется текущая цена."
    );
  }

  const closeToBest =
    best.expectedPriceMinor >= game.currentPriceMinor ||
    Math.abs(best.expectedDiscountPercent - currentDiscount) <= (options.insignificantDiscountDiffPp ?? SIGNIFICANT_DISCOUNT_DIFF_PP);

  if (activeSeasonalSale && currentDiscount > 0 && closeToBest) {
    return buyNowFromCurrentPrice(
      game,
      activeSeasonalSale,
      currentDiscount,
      `Сейчас идет ${activeSeasonalSale.name}, а текущая цена уже близка к лучшей исторической. Можно покупать без потери выгоды.`
    );
  }

  if (closeToBest && game.currentPriceMinor <= Math.round(best.expectedPriceMinor * 1.05)) {
    return buyNowFromCurrentPrice(
      game,
      best.sale,
      currentDiscount,
      "Сейчас цена уже близка к лучшей исторической. Можно покупать сейчас."
    );
  }

  return {
    appId: game.appId,
    title: game.title,
    state: "success",
    sale: best.sale,
    currentPriceMinor: game.currentPriceMinor,
    expectedPriceMinor: best.expectedPriceMinor,
    expectedDiscountPercent: best.expectedDiscountPercent,
    savingsMinor: Math.max(0, game.currentPriceMinor - best.expectedPriceMinor),
    currency: game.currency,
    confidence: best.confidence,
    reason: best.reason,
    source: best.source,
    usedInCartTotal: true
  };
}

export function buildCartSummary(items: GameRecommendation[]): CartRecommendationSummary {
  const currency = findDominantCurrency(items);
  const usedItems = items.filter((item) => item.currency === currency && item.usedInCartTotal);
  const currentTotalMinor = usedItems.reduce((sum, item) => sum + item.currentPriceMinor, 0);
  const recommendedTotalMinor = usedItems.reduce((sum, item) => sum + item.expectedPriceMinor, 0);
  return {
    currency,
    currentTotalMinor,
    recommendedTotalMinor,
    savingsMinor: Math.max(0, currentTotalMinor - recommendedTotalMinor),
    items,
    skippedCount: items.length - usedItems.length
  };
}

function chooseDiscountDatabaseCandidate(
  game: CartGame,
  sales: SteamSaleEvent[],
  entries: DiscountDatabaseEntry[],
  now: Date
): Candidate | null {
  const candidates = entries
    .map((entry) => candidateFromDiscountDatabaseEntry(game, sales, entry, now))
    .filter((candidate): candidate is Candidate => Boolean(candidate));

  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => (candidate.expectedPriceMinor < best.expectedPriceMinor ? candidate : best), candidates[0]);
}

function candidateFromDiscountDatabaseEntry(
  game: CartGame,
  sales: SteamSaleEvent[],
  entry: DiscountDatabaseEntry,
  now: Date
): Candidate | null {
  const sale = findSaleForDiscountDatabaseEntry(entry, sales, now);
  const expectedPriceMinor = getExpectedPriceFromDiscountEntry(game, entry);
  if (!sale || expectedPriceMinor === null) return null;

  return {
    sale,
    expectedPriceMinor,
    expectedDiscountPercent: getExpectedDiscountFromDiscountEntry(game, entry, expectedPriceMinor),
    confidence: entry.confidence ?? "medium",
    reason: `Лучше дождаться ${sale.name}.`,
    source: "discount-database"
  };
}

function buildDiscountDatabaseRecommendation(
  game: CartGame,
  candidate: Candidate,
  activeSeasonalSale: SteamSaleEvent | undefined,
  currentDiscount: number
): GameRecommendation {
  const currentPriceMinor = game.currentPriceMinor ?? 0;
  const currentIsGood = currentPriceMinor <= Math.round(candidate.expectedPriceMinor * 1.03);
  const sale = activeSeasonalSale ?? candidate.sale;

  if (currentIsGood) {
    return {
      appId: game.appId,
      title: game.title,
      state: "buy-now",
      sale,
      currentPriceMinor,
      expectedPriceMinor: currentPriceMinor,
      expectedDiscountPercent: currentDiscount,
      savingsMinor: 0,
      currency: game.currency ?? "USD",
      confidence: candidate.confidence,
      reason: activeSeasonalSale
        ? `Сейчас идет ${activeSeasonalSale.name}, и текущая цена уже выглядит выгодно. Можно покупать без потери выгоды.`
        : `Текущая цена почти совпадает с ожидаемой на ${candidate.sale.name}. Можно покупать без потери выгоды.`,
      source: candidate.source,
      usedInCartTotal: true,
      statusMessage: "Сейчас выгодная цена. Можно покупать без потери выгоды."
    };
  }

  return {
    appId: game.appId,
    title: game.title,
    state: "success",
    sale: candidate.sale,
    currentPriceMinor,
    expectedPriceMinor: candidate.expectedPriceMinor,
    expectedDiscountPercent: candidate.expectedDiscountPercent,
    savingsMinor: Math.max(0, currentPriceMinor - candidate.expectedPriceMinor),
    currency: game.currency ?? "USD",
    confidence: candidate.confidence,
    reason: candidate.reason,
    source: candidate.source,
    usedInCartTotal: true
  };
}

function findSaleForDiscountDatabaseEntry(
  entry: DiscountDatabaseEntry,
  sales: SteamSaleEvent[],
  now: Date
): SteamSaleEvent | undefined {
  const byId = entry.saleId ? sales.find((sale) => sale.id === entry.saleId) : undefined;
  if (byId) return byId;

  const saleName = entry.saleName?.toLowerCase();
  const byName = saleName ? sales.find((sale) => sale.name.toLowerCase() === saleName || sale.name.toLowerCase().includes(saleName)) : undefined;
  if (byName) return byName;

  return findNextSeasonalSale(sales, now) ?? getFutureSales(sales, now)[0];
}

function getExpectedPriceFromDiscountEntry(game: CartGame, entry: DiscountDatabaseEntry): number | null {
  if (typeof entry.expectedPriceMinor === "number" && Number.isFinite(entry.expectedPriceMinor)) {
    return Math.max(0, Math.round(entry.expectedPriceMinor));
  }

  if (typeof entry.expectedDiscountPercent !== "number" || !Number.isFinite(entry.expectedDiscountPercent)) return null;
  const currentPriceMinor = game.currentPriceMinor ?? 0;
  const basePriceMinor =
    game.originalPriceMinor && game.originalPriceMinor > currentPriceMinor
      ? game.originalPriceMinor
      : currentPriceMinor;
  return Math.max(0, Math.round((basePriceMinor * (100 - entry.expectedDiscountPercent)) / 100));
}

function getExpectedDiscountFromDiscountEntry(game: CartGame, entry: DiscountDatabaseEntry, expectedPriceMinor: number): number {
  if (typeof entry.expectedDiscountPercent === "number" && Number.isFinite(entry.expectedDiscountPercent)) {
    return Math.max(0, Math.round(entry.expectedDiscountPercent));
  }

  const basePriceMinor = game.originalPriceMinor ?? game.currentPriceMinor ?? 0;
  if (basePriceMinor <= 0 || expectedPriceMinor >= basePriceMinor) return 0;
  return Math.round(((basePriceMinor - expectedPriceMinor) * 100) / basePriceMinor);
}

function estimateWithoutHistory(game: CartGame, sale: SteamSaleEvent, currentDiscount: number): Candidate | null {
  const currentPriceMinor = game.currentPriceMinor ?? 0;
  if (currentPriceMinor <= 0) return null;

  const expectedDiscountPercent = Math.max(currentDiscount, defaultDiscountPercent(game));
  const basePriceMinor =
    game.originalPriceMinor && game.originalPriceMinor > currentPriceMinor
      ? game.originalPriceMinor
      : currentPriceMinor;
  const expectedPriceMinor = Math.min(currentPriceMinor, Math.max(0, Math.round((basePriceMinor * (100 - expectedDiscountPercent)) / 100)));
  if (expectedPriceMinor <= 0 || (expectedPriceMinor >= currentPriceMinor && currentDiscount <= 0)) return null;

  return {
    sale,
    expectedPriceMinor,
    expectedDiscountPercent,
    confidence: "low",
    reason: `Ориентир по типичной скидке на ${sale.name}.`,
    source: "estimated-discount"
  };
}

function defaultDiscountPercent(game: CartGame): number {
  const title = game.title.toLowerCase();
  if (/ultimate|complete|definitive|deluxe|collection|anthology/.test(title)) return 75;
  if (game.itemKind === "bundle" || game.itemKind === "package") return 40;
  return 50;
}

function buyNowFromCurrentPrice(
  game: CartGame,
  sale: SteamSaleEvent | undefined,
  discountPercent: number,
  reason: string
): GameRecommendation {
  return {
    appId: game.appId,
    title: game.title,
    state: "buy-now",
    sale,
    currentPriceMinor: game.currentPriceMinor ?? 0,
    expectedPriceMinor: game.currentPriceMinor ?? 0,
    expectedDiscountPercent: discountPercent,
    savingsMinor: 0,
    currency: game.currency ?? "USD",
    confidence: sale ? "high" : "medium",
    reason,
    source: "current-price",
    usedInCartTotal: true,
    statusMessage: "Сейчас выгодная цена. Можно покупать без потери выгоды."
  };
}

function estimateForSale(sale: SteamSaleEvent, history: GamePriceHistory, allSales: SteamSaleEvent[], currentPriceMinor: number): Candidate {
  const saleNamePoints = pointsForSale(history.points, sale);
  if (saleNamePoints.length > 0) {
    return candidateFromPoints(sale, saleNamePoints, "high", `Выбрана ${sale.name}: в истории есть наблюдения по этой распродаже.`, "sale-name");
  }

  const similarSales = allSales.filter((candidate) => candidate.kind === sale.kind || hasSharedTags(candidate, sale));
  const similarPoints = similarSales.flatMap((similarSale) => pointsForSale(history.points, similarSale));
  if (similarPoints.length > 0) {
    return candidateFromPoints(sale, similarPoints, "medium", `Выбрана ${sale.name}: использованы похожие распродажи по типу или тегам.`, "sale-kind");
  }

  const discounted = history.points.filter((point) => (point.discountPercent ?? 0) > 0);
  if (discounted.length > 0) {
    return candidateFromPoints(sale, discounted, "low", `Выбрана ${sale.name}: использована лучшая общая историческая скидка.`, "historical-best");
  }

  return {
    sale,
    expectedPriceMinor: currentPriceMinor,
    expectedDiscountPercent: 0,
    confidence: "low",
    reason: "Исторических скидок не найдено, используется текущая цена.",
    source: "current-price"
  };
}

function chooseBestCandidate(candidates: Candidate[], currentPriceMinor: number, options: RecommendationOptions): Candidate | null {
  if (candidates.length === 0) return null;
  const nearest = candidates[0];
  const cheapest = candidates.reduce((best, candidate) => (candidate.expectedPriceMinor < best.expectedPriceMinor ? candidate : best), nearest);
  const priceDiff = nearest.expectedPriceMinor - cheapest.expectedPriceMinor;
  const discountDiff = cheapest.expectedDiscountPercent - nearest.expectedDiscountPercent;
  const ratio = currentPriceMinor > 0 ? priceDiff / currentPriceMinor : 0;
  if (
    ratio <= (options.insignificantPriceDiffRatio ?? SIGNIFICANT_PRICE_DIFF_RATIO) &&
    discountDiff <= (options.insignificantDiscountDiffPp ?? SIGNIFICANT_DISCOUNT_DIFF_PP)
  ) {
    return nearest;
  }
  return cheapest;
}

function preferReliableCandidates(candidates: Candidate[]): Candidate[] {
  const direct = candidates.filter((candidate) => candidate.source === "sale-name");
  if (direct.length > 0) return direct;

  const similar = candidates.filter((candidate) => candidate.source === "sale-kind");
  if (similar.length > 0) return similar;

  const seasonalFallbacks = candidates.filter(
    (candidate) => candidate.source === "historical-best" && candidate.sale.kind === "seasonal"
  );
  if (seasonalFallbacks.length > 0) return seasonalFallbacks;

  return candidates.filter((candidate) => candidate.source !== "current-price");
}

function candidateFromPoints(
  sale: SteamSaleEvent,
  points: PriceHistoryPoint[],
  confidence: Candidate["confidence"],
  reason: string,
  source: Candidate["source"]
): Candidate {
  const best = points.reduce((winner, point) => (point.priceMinor < winner.priceMinor ? point : winner), points[0]);
  return {
    sale,
    expectedPriceMinor: best.priceMinor,
    expectedDiscountPercent: best.discountPercent ?? 0,
    confidence: points.length < 2 && confidence === "high" ? "medium" : confidence,
    reason,
    source
  };
}

function findActiveSeasonalSale(sales: SteamSaleEvent[], now: Date): SteamSaleEvent | undefined {
  const today = now.toISOString().slice(0, 10);
  return sales.find((sale) => sale.kind === "seasonal" && isDateWithinRange(today, sale.startDate, sale.endDate));
}

function findNextSeasonalSale(sales: SteamSaleEvent[], now: Date): SteamSaleEvent | undefined {
  return getFutureSales(sales, now).find((sale) => sale.kind === "seasonal");
}

function pointsForSale(points: PriceHistoryPoint[], sale: SteamSaleEvent): PriceHistoryPoint[] {
  return points.filter((point) => isDateWithinRange(point.date, sale.startDate, sale.endDate));
}

function hasSharedTags(left: SteamSaleEvent, right: SteamSaleEvent): boolean {
  return Boolean(left.tags?.some((tag) => right.tags?.includes(tag)));
}

function fallback(game: CartGame, state: GameRecommendation["state"], message: string): GameRecommendation {
  const currency = game.currency ?? "USD";
  const currentPriceMinor = game.currentPriceMinor ?? 0;
  return {
    appId: game.appId,
    title: game.title,
    state,
    currentPriceMinor,
    expectedPriceMinor: currentPriceMinor,
    savingsMinor: 0,
    currency,
    confidence: "low",
    reason: message,
    source: "unavailable",
    usedInCartTotal: true,
    statusMessage: message
  };
}

function findDominantCurrency(items: GameRecommendation[]): CurrencyCode | null {
  const counts = new Map<CurrencyCode, number>();
  for (const item of items) counts.set(item.currency, (counts.get(item.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
