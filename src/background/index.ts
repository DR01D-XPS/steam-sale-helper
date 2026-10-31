import { SalesCalendarProvider } from "../providers/salesCalendar";
import { CheapSharkFallbackProvider } from "../providers/cheapshark";
import { CachedSteamDbProvider, MockSteamDbProvider, SteamDbHtmlProvider } from "../providers/steamdb";
import { clearCaches, debugLog, getSettings, setSettings } from "../lib/storage";
import type { BackgroundRequest, ProviderResponse } from "../types";

const calendarProvider = new SalesCalendarProvider();
const cheapSharkProvider = new CheapSharkFallbackProvider();

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  handleMessage(request)
    .then(sendResponse)
    .catch(async (error: unknown) => {
      await debugLog("background request failed", { request, error: String(error) });
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

async function handleMessage(request: BackgroundRequest): Promise<ProviderResponse<unknown>> {
  switch (request.type) {
    case "settings:get":
      return { ok: true, data: await getSettings() };
    case "settings:set":
      return { ok: true, data: await setSettings(request.settings) };
    case "cache:clear":
      await clearCaches();
      return { ok: true, data: true };
    case "calendar:get":
      return { ok: true, data: await calendarProvider.getSalesCalendar() };
    case "calendar:refresh":
      return { ok: true, data: await calendarProvider.refreshFromGuide() };
    case "steamdb:getPriceHistory": {
      const settings = await getSettings();
      const provider = settings.provider === "steamdb" ? new CachedSteamDbProvider(new SteamDbHtmlProvider()) : new MockSteamDbProvider();
      return { ok: true, data: await provider.getPriceHistory(request.appId, request.currency) };
    }
    case "priceFallback:get":
      return { ok: true, data: await cheapSharkProvider.getDiscountEntry(request.appId, request.currency, request.title) };
  }
}
