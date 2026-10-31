import type { CurrencyCode, Money, SteamRegion } from "../types";

const CURRENCY_PATTERNS: Array<[CurrencyCode, RegExp]> = [
  ["BRL", /R\$/i],
  ["RUB", /₽|руб\.?|pуб\.?/i],
  ["USD", /\$|USD/i],
  ["EUR", /€|EUR/i],
  ["KZT", /₸|KZT/i],
  ["UAH", /₴|UAH/i],
  ["TRY", /₺|\bTL\b|TRY/i],
  ["GBP", /£|GBP/i],
  ["PLN", /zł|PLN/i],
  ["INR", /₹|INR/i],
  ["CNY", /元|CNY|CN¥/i],
  ["JPY", /¥|JPY/i],
  ["KRW", /₩|KRW/i]
];

const SYMBOLS: Record<CurrencyCode, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  KZT: "₸",
  UAH: "₴",
  TRY: "₺",
  BRL: "R$",
  GBP: "£",
  PLN: "zł",
  INR: "₹",
  CNY: "¥",
  JPY: "¥",
  KRW: "₩"
};

const ZERO_DECIMAL = new Set<CurrencyCode>(["JPY", "KRW"]);

export function detectCurrency(text: string): CurrencyCode | null {
  const normalized = normalizeCurrencyGlyphs(text);
  return CURRENCY_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

export function parsePrice(text: string): Money | null {
  const currency = detectCurrency(text);
  if (!currency) return null;
  const amountMinor = normalizePriceToMinorUnits(text, currency);
  return amountMinor === null ? null : { amountMinor, currency, raw: text };
}

export function normalizePriceToMinorUnits(text: string, currency = detectCurrency(text)): number | null {
  if (!currency) return null;
  const normalized = normalizeCurrencyGlyphs(text)
    .replace(/\s+/g, " ")
    .replace(/[^\d.,]/g, "");

  if (!normalized) return null;
  const decimalSeparator = findDecimalSeparator(normalized);
  const digitsOnly = normalized.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;

  if (ZERO_DECIMAL.has(currency)) {
    return Number.parseInt(digitsOnly, 10);
  }

  if (!decimalSeparator) {
    return Number.parseInt(digitsOnly, 10) * 100;
  }

  const lastSeparatorIndex = Math.max(normalized.lastIndexOf("."), normalized.lastIndexOf(","));
  const integerPart = normalized.slice(0, lastSeparatorIndex).replace(/[^\d]/g, "") || "0";
  const fractionPart = normalized.slice(lastSeparatorIndex + 1).replace(/[^\d]/g, "").padEnd(2, "0").slice(0, 2);
  return Number.parseInt(integerPart, 10) * 100 + Number.parseInt(fractionPart, 10);
}

export function formatMoney(amountMinor: number, currency: CurrencyCode): string {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  const symbol = SYMBOLS[currency];
  if (ZERO_DECIMAL.has(currency)) {
    return `${sign}${new Intl.NumberFormat("ru-RU").format(absolute)} ${symbol}`;
  }

  const major = Math.floor(absolute / 100);
  const cents = absolute % 100;
  const hasCents = cents > 0;
  const formatted = new Intl.NumberFormat("ru-RU").format(major);
  const value = hasCents ? `${formatted},${String(cents).padStart(2, "0")}` : formatted;
  return currency === "USD" || currency === "GBP" || currency === "BRL" ? `${sign}${symbol}${value}` : `${sign}${value} ${symbol}`;
}

export function detectRegionByCurrency(currency: CurrencyCode): SteamRegion | null {
  const map: Record<CurrencyCode, SteamRegion> = {
    RUB: "ru",
    USD: "us",
    EUR: "eu",
    KZT: "kz",
    UAH: "ua",
    TRY: "tr",
    BRL: "br",
    GBP: "gb",
    PLN: "pl",
    INR: "in",
    CNY: "cn",
    JPY: "jp",
    KRW: "kr"
  };
  return map[currency] ?? null;
}

export function calculateDiscountPercent(originalPriceMinor: number, salePriceMinor: number): number {
  if (originalPriceMinor <= 0 || salePriceMinor >= originalPriceMinor) return 0;
  return Math.round(((originalPriceMinor - salePriceMinor) * 100) / originalPriceMinor);
}

function normalizeCurrencyGlyphs(text: string): string {
  return text.replace(/₽/g, "₽").replace(/₸/g, "₸").replace(/₴/g, "₴").replace(/₺/g, "₺");
}

function findDecimalSeparator(value: string): "." | "," | null {
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  const last = Math.max(lastDot, lastComma);
  if (last === -1) return null;
  const digitsAfter = value.slice(last + 1).replace(/[^\d]/g, "").length;
  return digitsAfter > 0 && digitsAfter <= 2 ? (value[last] as "." | ",") : null;
}
