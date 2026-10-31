import type { ExtensionSettings, GamePriceHistory, SteamSaleEvent } from "../types";

const SETTINGS_KEY = "steamSaleHelper:settings";
const STEAMDB_CACHE_KEY = "steamSaleHelper:steamdbCache";
const SALES_CACHE_KEY = "steamSaleHelper:salesCalendar";
const DEBUG_LOG_KEY = "steamSaleHelper:debugLogs";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  insignificantPriceDiffRatio: 0.1,
  insignificantDiscountDiffPp: 5,
  steamDbCacheTtlHours: 12,
  debug: false,
  provider: "steamdb"
};

type SteamDbCacheEntry = {
  history: GamePriceHistory;
  updatedAt: string;
  lastAttemptAt: string;
};

type StorageShape = {
  [SETTINGS_KEY]?: Partial<ExtensionSettings>;
  [STEAMDB_CACHE_KEY]?: Record<string, SteamDbCacheEntry>;
  [SALES_CACHE_KEY]?: { events: SteamSaleEvent[]; updatedAt: string };
  [DEBUG_LOG_KEY]?: string[];
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await storageGet<StorageShape>(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] ?? {}) };
  if (!settings.debug && settings.provider === "mock") {
    settings.provider = "steamdb";
  }
  return settings;
}

export async function setSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await getSettings()), ...settings };
  await storageSet({ [SETTINGS_KEY]: next });
  return next;
}

export async function getCachedPriceHistory(appId: string, currency: string, ttlHours: number): Promise<GamePriceHistory | null> {
  const cache = await getSteamDbCache();
  const entry = cache[cacheKey(appId, currency)];
  if (!entry) return null;
  const ageMs = Date.now() - Date.parse(entry.updatedAt);
  return ageMs <= ttlHours * 3_600_000 ? entry.history : null;
}

export async function getLastSteamDbAttempt(appId: string, currency: string): Promise<string | null> {
  const entry = (await getSteamDbCache())[cacheKey(appId, currency)];
  return entry?.lastAttemptAt ?? null;
}

export async function setCachedPriceHistory(history: GamePriceHistory): Promise<void> {
  const cache = await getSteamDbCache();
  const key = cacheKey(history.appId, history.currency);
  const now = new Date().toISOString();
  cache[key] = { history: { ...history, updatedAt: now }, updatedAt: now, lastAttemptAt: now };
  await storageSet({ [STEAMDB_CACHE_KEY]: cache });
}

export async function markSteamDbAttempt(appId: string, currency: string): Promise<void> {
  const cache = await getSteamDbCache();
  const key = cacheKey(appId, currency);
  cache[key] = {
    history: cache[key]?.history ?? { appId, currency, points: [], updatedAt: new Date().toISOString() },
    updatedAt: cache[key]?.updatedAt ?? new Date().toISOString(),
    lastAttemptAt: new Date().toISOString()
  };
  await storageSet({ [STEAMDB_CACHE_KEY]: cache });
}

export async function clearCaches(): Promise<void> {
  await storageSet({ [STEAMDB_CACHE_KEY]: {}, [SALES_CACHE_KEY]: undefined });
}

export async function getCachedSalesCalendar(): Promise<SteamSaleEvent[] | null> {
  const stored = await storageGet<StorageShape>(SALES_CACHE_KEY);
  return stored[SALES_CACHE_KEY]?.events ?? null;
}

export async function setCachedSalesCalendar(events: SteamSaleEvent[]): Promise<void> {
  await storageSet({ [SALES_CACHE_KEY]: { events, updatedAt: new Date().toISOString() } });
}

export async function debugLog(message: string, data?: unknown): Promise<void> {
  const settings = await getSettings();
  if (!settings.debug) return;
  const stored = await storageGet<StorageShape>(DEBUG_LOG_KEY);
  const logs = stored[DEBUG_LOG_KEY] ?? [];
  logs.push(`${new Date().toISOString()} ${message}${data === undefined ? "" : ` ${JSON.stringify(data)}`}`);
  await storageSet({ [DEBUG_LOG_KEY]: logs.slice(-200) });
}

async function getSteamDbCache(): Promise<Record<string, SteamDbCacheEntry>> {
  const stored = await storageGet<StorageShape>(STEAMDB_CACHE_KEY);
  return stored[STEAMDB_CACHE_KEY] ?? {};
}

function cacheKey(appId: string, currency: string): string {
  return `${appId}:${currency.toUpperCase()}`;
}

function storageGet<T>(keys: string | string[]): Promise<T> {
  if (!globalThis.chrome?.storage?.local) return Promise.resolve({} as T);
  return chrome.storage.local.get(keys) as Promise<T>;
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return Promise.resolve();
  return chrome.storage.local.set(items);
}
