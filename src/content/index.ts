import { debounce, ready } from "../lib/dom";
import { buildCartSummary, buildGameRecommendation } from "../lib/recommendation";
import { getDiscountDatabaseEntries } from "../providers/discountDatabase";
import { parseSteamCart } from "../providers/steam";
import type {
  BackgroundRequest,
  DiscountDatabaseEntry,
  ExtensionSettings,
  GamePriceHistory,
  GameRecommendation,
  ProviderResponse,
  SteamSaleEvent
} from "../types";
import {
  renderCartSummary,
  renderErrorCard,
  renderGameRecommendationCard,
  renderLoadingCard,
  renderPageStatus,
  removePageStatus
} from "./ui";
import "../styles/cart.css";

const processedKey = "steamSaleHelperProcessed";
let observer: MutationObserver | null = null;

void bootstrap();

async function bootstrap(): Promise<void> {
  if (!location.href.startsWith("https://store.steampowered.com/cart")) return;
  await ready();
  await analyzeCart();
  observer = new MutationObserver(debounce(() => void analyzeCart(), 600));
  observer.observe(document.body, { childList: true, subtree: true });
}

async function analyzeCart(): Promise<void> {
  const settings = await sendMessage<ExtensionSettings>({ type: "settings:get" });
  if (!settings?.enabled) {
    document.querySelectorAll("[data-steam-sale-helper-card], #steam-sale-helper-summary, #steam-sale-helper-status").forEach((node) => node.remove());
    return;
  }

  const cartItems = parseSteamCart();
  if (cartItems.length === 0) {
    renderPageStatus("Товары в корзине не найдены.", "warning");
    return;
  }
  renderPageStatus(`Проверяем корзину: ${cartItems.length} шт.`, "ok");
  const sales = (await sendMessage<SteamSaleEvent[]>({ type: "calendar:get" })) ?? [];

  const recommendations: GameRecommendation[] = [];
  for (const item of cartItems) {
    const target = item.cartItemElement;
    if (!target || target.dataset[processedKey] === "pending") continue;
    if (target.dataset[processedKey] === "done" && target.querySelector("[data-steam-sale-helper-card]")) {
      const existing = target.querySelector("[data-steam-sale-helper-card]");
      if (existing) continue;
    }
    target.dataset[processedKey] = "pending";
    renderLoadingCard(target);
    try {
      const manualDiscountEntries = getDiscountDatabaseEntries(item);
      const fallbackDiscountEntries = await getFallbackDiscountEntries(item.appId, item.currency, item.title);
      const recommendationOptions = {
        ...settings,
        discountDbEntries: manualDiscountEntries,
        fallbackDiscountEntries
      };

      if (!item.appId) {
        const recommendation = buildGameRecommendation(item, null, sales, recommendationOptions);
        recommendations.push(recommendation);
        renderGameRecommendationCard(target, recommendation);
        continue;
      }
      if (!item.currency) {
        const recommendation = buildGameRecommendation(item, null, sales, recommendationOptions);
        recommendations.push(recommendation);
        renderErrorCard(target, recommendation.statusMessage);
        continue;
      }
      const history = await sendMessage<GamePriceHistory | null>({
        type: "steamdb:getPriceHistory",
        appId: item.appId,
        currency: item.currency
      });
      const recommendation = buildGameRecommendation(item, history ?? null, sales, recommendationOptions);
      recommendations.push(recommendation);
      renderGameRecommendationCard(target, recommendation);
    } catch {
      renderErrorCard(target);
      const manualDiscountEntries = getDiscountDatabaseEntries(item);
      const recommendation = buildGameRecommendation(item, null, sales, {
        ...settings,
        discountDbEntries: manualDiscountEntries,
        fallbackDiscountEntries: []
      });
      recommendations.push(recommendation);
    } finally {
      target.dataset[processedKey] = "done";
    }
  }

  if (recommendations.length > 0) {
    renderCartSummary(buildCartSummary(recommendations));
    removePageStatus();
  }
}

async function getFallbackDiscountEntries(
  appId: string | null,
  currency: DiscountDatabaseEntry["currency"] | null,
  title: string
): Promise<DiscountDatabaseEntry[]> {
  if (!appId || !currency) return [];
  try {
    const entry = await sendMessage<DiscountDatabaseEntry | null>({
      type: "priceFallback:get",
      appId,
      currency,
      title
    });
    return entry ? [entry] : [];
  } catch {
    return [];
  }
}

function sendMessage<T>(request: BackgroundRequest): Promise<T | null> {
  if (!globalThis.chrome?.runtime?.sendMessage) return Promise.resolve(null);
  return chrome.runtime.sendMessage(request).then((response: ProviderResponse<T>) => {
    if (!response?.ok) throw new Error(response?.error ?? "Extension background request failed");
    return response.data ?? null;
  });
}

window.addEventListener("pagehide", () => observer?.disconnect(), { once: true });
