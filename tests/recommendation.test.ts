import { describe, expect, it } from "vitest";
import { buildCartSummary, buildGameRecommendation } from "../src/lib/recommendation";
import type { CartGame, DiscountDatabaseEntry, GamePriceHistory, SteamSaleEvent } from "../src/types";

const game: CartGame = {
  appId: "10",
  title: "Test Game",
  currentPriceMinor: 100000,
  currentDiscountPercent: 0,
  currency: "RUB",
  itemKind: "game"
};

const sales: SteamSaleEvent[] = [
  { id: "summer", name: "Steam Summer Sale", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] },
  { id: "winter", name: "Steam Winter Sale", startDate: "2026-12-17", endDate: "2027-01-04", kind: "seasonal", tags: ["major"] }
];

function history(summerPrice: number, winterPrice: number): GamePriceHistory {
  return {
    appId: "10",
    currency: "RUB",
    updatedAt: "2026-06-01T00:00:00.000Z",
    points: [
      { appId: "10", currency: "RUB", date: "2026-06-26", priceMinor: summerPrice, originalPriceMinor: 100000, discountPercent: 100 - summerPrice / 1000, source: "steamdb" },
      { appId: "10", currency: "RUB", date: "2026-12-18", priceMinor: winterPrice, originalPriceMinor: 100000, discountPercent: 100 - winterPrice / 1000, source: "steamdb" }
    ]
  };
}

describe("recommendation", () => {
  it("chooses nearest sale when difference is insignificant", () => {
    const result = buildGameRecommendation(game, history(60000, 55000), sales, { now: new Date("2026-06-19T00:00:00Z") });
    expect(result.sale?.id).toBe("summer");
    expect(result.expectedPriceMinor).toBe(60000);
  });

  it("chooses later sale when difference is significant", () => {
    const result = buildGameRecommendation(game, history(70000, 40000), sales, { now: new Date("2026-06-19T00:00:00Z") });
    expect(result.sale?.id).toBe("winter");
    expect(result.expectedPriceMinor).toBe(40000);
  });

  it("uses a low-confidence estimate when no history is available", () => {
    const result = buildGameRecommendation(game, null, sales);
    expect(result.state).toBe("success");
    expect(result.source).toBe("estimated-discount");
    expect(result.expectedPriceMinor).toBe(50000);
  });

  it("shows an estimated price for the next local seasonal sale when history is unavailable", () => {
    const result = buildGameRecommendation(
      game,
      null,
      [
        { id: "next-fest", name: "Фестиваль «Играм быть» 2026", startDate: "2026-06-15", endDate: "2026-06-22", kind: "festival", tags: ["next-fest"] },
        { id: "summer", name: "☀️ Летняя распродажа", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] }
      ],
      { now: new Date("2026-06-19T00:00:00Z") }
    );

    expect(result.state).toBe("success");
    expect(result.sale?.name).toBe("☀️ Летняя распродажа");
    expect(result.expectedPriceMinor).toBe(50000);
  });

  it("uses current discounted price when SteamDB history is unavailable", () => {
    const result = buildGameRecommendation(
      { ...game, currentPriceMinor: 300000, originalPriceMinor: 600000, currentDiscountPercent: 50 },
      null,
      [{ id: "summer", name: "☀️ Летняя распродажа", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] }],
      { now: new Date("2026-06-26T00:00:00Z") }
    );

    expect(result.state).toBe("buy-now");
    expect(result.expectedPriceMinor).toBe(300000);
    expect(result.currentPriceMinor).toBe(300000);
    expect(result.sale?.name).toBe("☀️ Летняя распродажа");
  });

  it("uses discount database entries for bundles without App ID", () => {
    const discountDbEntries: DiscountDatabaseEntry[] = [
      {
        id: "red-dead-bundle-kzt",
        titleIncludes: "Red Dead Redemption",
        currency: "KZT",
        saleId: "summer",
        expectedPriceMinor: 1982300,
        expectedDiscountPercent: 41,
        confidence: "medium"
      }
    ];

    const result = buildGameRecommendation(
      {
        appId: null,
        title: "Red Dead Redemption & Red Dead Redemption 2 Bundle",
        currentPriceMinor: 2585000,
        currentDiscountPercent: 0,
        currency: "KZT",
        itemKind: "bundle"
      },
      null,
      [{ id: "summer", name: "☀️ Летняя распродажа", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] }],
      { now: new Date("2026-06-19T00:00:00Z"), discountDbEntries }
    );

    expect(result.state).toBe("success");
    expect(result.source).toBe("discount-database");
    expect(result.sale?.name).toBe("☀️ Летняя распродажа");
    expect(result.expectedPriceMinor).toBe(1982300);
  });

  it("allows buying now when the current discounted price is close to the discount database price", () => {
    const discountDbEntries: DiscountDatabaseEntry[] = [
      {
        id: "red-dead-bundle-kzt",
        titleIncludes: "Red Dead Redemption",
        currency: "KZT",
        saleId: "summer",
        expectedPriceMinor: 1982300,
        expectedDiscountPercent: 41,
        confidence: "medium"
      }
    ];

    const result = buildGameRecommendation(
      {
        appId: null,
        title: "Red Dead Redemption & Red Dead Redemption 2 Bundle",
        currentPriceMinor: 1997500,
        originalPriceMinor: 2585000,
        currentDiscountPercent: 23,
        currency: "KZT",
        itemKind: "bundle"
      },
      null,
      [{ id: "summer", name: "☀️ Летняя распродажа", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] }],
      { now: new Date("2026-06-19T00:00:00Z"), discountDbEntries }
    );

    expect(result.state).toBe("buy-now");
    expect(result.expectedPriceMinor).toBe(1997500);
    expect(result.reason).toContain("Можно покупать");
  });

  it("uses fallback discount entries when price history is unavailable", () => {
    const fallbackDiscountEntries: DiscountDatabaseEntry[] = [
      {
        id: "cheapshark-1145360-historical-low",
        appId: "10",
        currency: "RUB",
        expectedDiscountPercent: 75,
        confidence: "low"
      }
    ];

    const result = buildGameRecommendation(
      game,
      null,
      [{ id: "summer", name: "Steam Summer Sale", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] }],
      { now: new Date("2026-06-19T00:00:00Z"), fallbackDiscountEntries }
    );

    expect(result.state).toBe("success");
    expect(result.source).toBe("discount-database");
    expect(result.expectedPriceMinor).toBe(25000);
    expect(result.expectedDiscountPercent).toBe(75);
  });

  it("returns buy-now state", () => {
    const result = buildGameRecommendation({ ...game, currentPriceMinor: 40000, currentDiscountPercent: 60 }, history(39000, 38000), sales, {
      now: new Date("2026-06-19T00:00:00Z")
    });
    expect(result.state).toBe("buy-now");
  });

  it("calculates cart total from the same expected price shown in cards", () => {
    const one = buildGameRecommendation(game, history(60000, 55000), sales, { now: new Date("2026-06-19T00:00:00Z") });
    const two = buildGameRecommendation({ ...game, appId: "20" }, history(30000, 25000), sales, { now: new Date("2026-06-19T00:00:00Z") });
    const summary = buildCartSummary([one, two]);
    expect(summary.recommendedTotalMinor).toBe(one.expectedPriceMinor + two.expectedPriceMinor);
  });

  it("uses the nearest seasonal sale for generic historical data instead of current Next Fest", () => {
    const result = buildGameRecommendation(
      { ...game, currentPriceMinor: 2585000, currency: "KZT" },
      {
        appId: "10",
        currency: "KZT",
        updatedAt: "2026-06-19T00:00:00.000Z",
        points: [
          {
            appId: "10",
            currency: "KZT",
            date: "2026-05-11",
            priceMinor: 1982300,
            originalPriceMinor: 3354800,
            discountPercent: 41,
            source: "steamdb"
          }
        ]
      },
      [
        { id: "next-fest", name: "Фестиваль «Играм быть» 2026", startDate: "2026-06-15", endDate: "2026-06-22", kind: "festival", tags: ["next-fest"] },
        { id: "summer", name: "☀️ Летняя распродажа", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] }
      ],
      { now: new Date("2026-06-19T00:00:00Z") }
    );

    expect(result.sale?.name).toBe("☀️ Летняя распродажа");
    expect(result.expectedPriceMinor).toBe(1982300);
  });

  it("does not use implausibly tiny low-confidence historical-best prices", () => {
    const result = buildGameRecommendation(
      { ...game, currentPriceMinor: 2585000, currency: "KZT" },
      {
        appId: "10",
        currency: "KZT",
        updatedAt: "2026-06-19T00:00:00.000Z",
        points: [
          {
            appId: "10",
            currency: "KZT",
            date: "2026-05-11",
            priceMinor: 7000,
            originalPriceMinor: 20000,
            discountPercent: 65,
            source: "steamdb"
          }
        ]
      },
      [{ id: "summer", name: "☀️ Летняя распродажа", startDate: "2026-06-25", endDate: "2026-07-09", kind: "seasonal", tags: ["major"] }],
      { now: new Date("2026-06-19T00:00:00Z") }
    );

    expect(result.state).toBe("no-data");
    expect(result.expectedPriceMinor).toBe(2585000);
  });
});
