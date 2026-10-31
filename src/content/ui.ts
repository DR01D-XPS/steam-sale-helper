import { createElement, removeChildren } from "../lib/dom";
import { formatSaleDateRange } from "../lib/dates";
import { formatMoney } from "../lib/price";
import type { CartRecommendationSummary, CurrencyCode, GameRecommendation } from "../types";

const CARD_ATTR = "data-steam-sale-helper-card";
const SUMMARY_ID = "steam-sale-helper-summary";
const STATUS_ID = "steam-sale-helper-status";

export function renderLoadingCard(target: HTMLElement): void {
  renderStateCard(target, "loading", "Проверяем скидки...", "Сверяем текущую цену и календарь распродаж.");
}

export function renderNoDataCard(target: HTMLElement, message = "Пока нет точного прогноза. В расчете используется текущая цена."): void {
  renderStateCard(target, "no-data", "Прогноз недоступен", message);
}

export function renderErrorCard(target: HTMLElement, message = "Не удалось обновить прогноз. В расчете используется текущая цена."): void {
  renderStateCard(target, "error", "Прогноз временно недоступен", message);
}

export function renderBuyNowCard(target: HTMLElement, recommendation: GameRecommendation): void {
  renderGameRecommendationCard(target, recommendation);
}

export function renderGameRecommendationCard(target: HTMLElement, recommendation: GameRecommendation): void {
  const card = baseCard(recommendation.state);
  const header = createElement("div", "steam-sale-helper__header");
  header.append(createElement("span", "steam-sale-helper__sale-name", getCardTitle(recommendation)), confidenceBadge(recommendation.confidence));

  const dates = createElement(
    "div",
    "steam-sale-helper__dates",
    recommendation.sale ? formatSaleDateRange(recommendation.sale) : getFallbackDatesText(recommendation)
  );
  const row = createElement("div", "steam-sale-helper__price-row");
  row.append(
    metric("Учитываемая цена", formatMoney(recommendation.expectedPriceMinor, recommendation.currency), "steam-sale-helper__expected-price"),
    metric("Сейчас", formatMoney(recommendation.currentPriceMinor, recommendation.currency), "steam-sale-helper__current-price"),
    createElement("div", "steam-sale-helper__discount-badge", `-${recommendation.expectedDiscountPercent ?? 0}%`)
  );

  card.append(
    header,
    dates,
    row,
    createElement("div", "steam-sale-helper__saving", `Экономия: ${formatMoney(recommendation.savingsMinor, recommendation.currency)}`),
    createElement("div", "steam-sale-helper__reason", recommendation.reason)
  );
  mountCard(target, card);
}

export function updateGameRecommendationCard(target: HTMLElement, recommendation: GameRecommendation): void {
  renderGameRecommendationCard(target, recommendation);
}

export function removeGameRecommendationCard(target: HTMLElement): void {
  target.querySelector(`[${CARD_ATTR}]`)?.remove();
}

export function renderCartSummary(summary: CartRecommendationSummary): void {
  const host = findSummaryHost();
  if (!host || !summary.currency) return;
  let container = document.getElementById(SUMMARY_ID);
  if (!container) {
    container = createElement("div", "steam-sale-helper__summary");
    container.id = SUMMARY_ID;
    host.prepend(container);
  }
  removeChildren(container);
  container.append(
    createElement("div", "steam-sale-helper__summary-label", "Лучшая расчетная цена"),
    createElement("div", "steam-sale-helper__summary-price", formatMoney(summary.recommendedTotalMinor, summary.currency)),
    createElement("div", "steam-sale-helper__summary-saving", `Возможная экономия: ${formatMoney(summary.savingsMinor, summary.currency)}`)
  );
  if (summary.skippedCount > 0) {
    container.append(createElement("div", "steam-sale-helper__summary-note", `Не учтено товаров с другой валютой: ${summary.skippedCount}`));
  }
}

export function renderPageStatus(message: string, tone: "ok" | "warning" = "ok"): void {
  const host = findSummaryHost() ?? document.querySelector<HTMLElement>("#cart_status_data") ?? document.querySelector<HTMLElement>(".cart") ?? document.body;
  let container = document.getElementById(STATUS_ID);
  if (!container) {
    container = createElement("div", "steam-sale-helper__status");
    container.id = STATUS_ID;
    host.prepend(container);
  }
  container.className = `steam-sale-helper__status steam-sale-helper__status--${tone}`;
  container.textContent = message;
}

export function removePageStatus(): void {
  document.getElementById(STATUS_ID)?.remove();
}

function renderStateCard(target: HTMLElement, state: string, title: string, message: string): void {
  const card = baseCard(state);
  card.append(createElement("div", "steam-sale-helper__state-title", title), createElement("div", "steam-sale-helper__reason", message));
  if (state === "loading") card.append(createElement("div", "steam-sale-helper__skeleton"));
  mountCard(target, card);
}

function getCardTitle(recommendation: GameRecommendation): string {
  if (recommendation.sale) return recommendation.sale.name;
  if (recommendation.state === "buy-now") return "Сейчас выгодная цена";
  if (recommendation.state === "no-data") return "Прогноз недоступен";
  if (recommendation.state === "error") return "Ошибка прогноза";
  return "Рекомендация";
}

function getFallbackDatesText(recommendation: GameRecommendation): string {
  if (recommendation.state === "buy-now") return "Текущая скидка уже действует";
  if (recommendation.state === "no-data") return "Ближайшая дата пока неизвестна";
  return "Дата пока неизвестна";
}

function baseCard(state: string): HTMLDivElement {
  const card = createElement("div", `steam-sale-helper__game-card steam-sale-helper__game-card--${state}`);
  card.setAttribute(CARD_ATTR, "true");
  return card;
}

function metric(label: string, value: string, valueClass: string): HTMLDivElement {
  const wrapper = createElement("div", "steam-sale-helper__metric");
  wrapper.append(createElement("div", "steam-sale-helper__label", label), createElement("div", valueClass, value));
  return wrapper;
}

function confidenceBadge(confidence: GameRecommendation["confidence"]): HTMLSpanElement {
  const labels = { high: "Высокая уверенность", medium: "Средняя уверенность", low: "Низкая уверенность" };
  return createElement("span", `steam-sale-helper__confidence steam-sale-helper__confidence--${confidence}`, labels[confidence]);
}

function mountCard(target: HTMLElement, card: HTMLElement): void {
  removeGameRecommendationCard(target);
  target.append(card);
}

function findSummaryHost(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(".cart_totals_area") ??
    document.querySelector<HTMLElement>("#cart_estimated_total")?.parentElement ??
    document.querySelector<HTMLElement>(".cart_status_message") ??
    document.querySelector<HTMLElement>(".cart")
  );
}

export function formatRecommendationPriceForUi(amountMinor: number, currency: CurrencyCode): string {
  return formatMoney(amountMinor, currency);
}
