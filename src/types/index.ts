export type CurrencyCode =
  | "RUB"
  | "USD"
  | "EUR"
  | "KZT"
  | "UAH"
  | "TRY"
  | "BRL"
  | "GBP"
  | "PLN"
  | "INR"
  | "CNY"
  | "JPY"
  | "KRW";

export type SteamRegion =
  | "ru"
  | "us"
  | "eu"
  | "kz"
  | "ua"
  | "tr"
  | "br"
  | "gb"
  | "pl"
  | "in"
  | "cn"
  | "jp"
  | "kr";

export type Money = {
  amountMinor: number;
  currency: CurrencyCode;
  raw?: string;
};

export type CartItemKind = "game" | "dlc" | "bundle" | "package" | "unknown";

export type CartGame = {
  appId: string | null;
  title: string;
  currentPriceMinor: number | null;
  originalPriceMinor?: number | null;
  currentDiscountPercent?: number | null;
  currency: CurrencyCode | null;
  rawPriceText?: string;
  cartItemElement?: HTMLElement;
  itemKind: CartItemKind;
};

export type PriceHistoryPoint = {
  appId: string;
  currency: string;
  date: string;
  priceMinor: number;
  originalPriceMinor?: number;
  discountPercent?: number;
  source: "steamdb";
};

export type GamePriceHistory = {
  appId: string;
  currency: string;
  points: PriceHistoryPoint[];
  updatedAt: string;
};

export interface SteamDbProvider {
  getPriceHistory(appId: string, currency: string): Promise<GamePriceHistory | null>;
}

export type SteamSaleEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  kind: "seasonal" | "festival" | "publisher" | "other";
  tags?: string[];
};

export type SaleDiscountStats = {
  saleId: string;
  saleName: string;
  bestPriceMinor: number;
  bestDiscountPercent: number;
  averageDiscountPercent?: number;
  medianDiscountPercent?: number;
  observations: number;
};

export type RecommendationState = "success" | "no-data" | "error" | "buy-now";
export type Confidence = "high" | "medium" | "low";

export type DiscountDatabaseEntry = {
  id: string;
  appId?: string;
  titleIncludes?: string;
  currency: CurrencyCode;
  saleId?: string;
  saleName?: string;
  expectedPriceMinor?: number;
  expectedDiscountPercent?: number;
  confidence?: Confidence;
  note?: string;
  updatedAt?: string;
};

export type DiscountDatabase = {
  version: number;
  updatedAt: string;
  entries: DiscountDatabaseEntry[];
};

export type GameRecommendation = {
  appId: string | null;
  title: string;
  state: RecommendationState;
  sale?: SteamSaleEvent;
  expectedPriceMinor: number;
  expectedDiscountPercent?: number;
  currentPriceMinor: number;
  savingsMinor: number;
  currency: CurrencyCode;
  confidence: Confidence;
  reason: string;
  source: "sale-name" | "sale-kind" | "historical-best" | "current-price" | "discount-database" | "estimated-discount" | "unavailable";
  usedInCartTotal: boolean;
  statusMessage?: string;
};

export type CartRecommendationSummary = {
  currency: CurrencyCode | null;
  currentTotalMinor: number;
  recommendedTotalMinor: number;
  savingsMinor: number;
  items: GameRecommendation[];
  skippedCount: number;
};

export type ExtensionSettings = {
  enabled: boolean;
  insignificantPriceDiffRatio: number;
  insignificantDiscountDiffPp: number;
  steamDbCacheTtlHours: number;
  debug: boolean;
  provider: "mock" | "steamdb";
};

export type ProviderResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;
};

export type BackgroundRequest =
  | { type: "settings:get" }
  | { type: "settings:set"; settings: Partial<ExtensionSettings> }
  | { type: "steamdb:getPriceHistory"; appId: string; currency: string }
  | { type: "priceFallback:get"; appId: string; currency: CurrencyCode; title: string }
  | { type: "calendar:get" }
  | { type: "calendar:refresh" }
  | { type: "cache:clear" };
