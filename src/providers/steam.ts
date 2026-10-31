import { text } from "../lib/dom";
import { detectCurrency, normalizePriceToMinorUnits } from "../lib/price";
import type { CartGame, CartItemKind, CurrencyCode } from "../types";

const ITEM_SELECTOR = [
  ".cart_item",
  ".cart_row",
  "[data-ds-appid]",
  "[data-ds-packageid]",
  "[class*='cart'] [class*='line_item']",
  'a[href*="/app/"]',
  'a[href*="/bundle/"]',
  'a[href*="/sub/"]'
].join(",");

export function parseSteamCart(root: ParentNode = document): CartGame[] {
  const candidates = [
    ...root.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
    ...findRowsFromPriceNodes(root)
  ]
    .map((element) => findCartRow(element))
    .filter((element): element is HTMLElement => Boolean(element));

  return dedupeRows(candidates)
    .map(parseCartItem)
    .filter((item) => item.title || item.currentPriceMinor !== null);
}

function parseCartItem(element: HTMLElement): CartGame {
  const href =
    element.querySelector<HTMLAnchorElement>('a[href*="/app/"]')?.href ??
    element.querySelector<HTMLAnchorElement>('a[href*="/bundle/"]')?.href ??
    element.querySelector<HTMLAnchorElement>('a[href*="/sub/"]')?.href ??
    "";
  const appId = href.match(/\/app\/(\d+)/)?.[1] ?? element.dataset.dsAppid?.split(",")[0] ?? null;
  const discountText = text(element.querySelector(".discount_pct, [class*='discount']"));
  const currentDiscountPercent = Number(discountText.match(/-?(\d+)%/)?.[1] ?? "") || null;
  const priceInfo = getPriceInfo(element, currentDiscountPercent);

  return {
    appId,
    title: getTitle(element),
    currentPriceMinor: priceInfo.currentPriceMinor,
    originalPriceMinor: priceInfo.originalPriceMinor,
    currentDiscountPercent,
    currency: priceInfo.currency,
    rawPriceText: priceInfo.rawPriceText,
    cartItemElement: element,
    itemKind: detectKind(element, appId)
  };
}

function getTitle(element: HTMLElement): string {
  return (
    element
      .querySelector<HTMLElement>(".cart_item_desc a, .cart_item_name, [class*='item_name'], a[href*='/app/'], a[href*='/bundle/'], a[href*='/sub/']")
      ?.textContent?.trim() ??
    findLikelyTitle(element) ??
    "Steam item"
  );
}

function getPriceInfo(
  element: HTMLElement,
  discountPercent: number | null
): { currentPriceMinor: number | null; originalPriceMinor: number | null; currency: CurrencyCode | null; rawPriceText: string } {
  const priceTexts = collectPriceTexts(element);
  const currency = detectCurrency(priceTexts.join(" ")) ?? detectCurrency(text(element));
  if (!currency) {
    const raw = priceTexts[0] ?? "";
    return { currentPriceMinor: /free|бесплат/i.test(raw) ? 0 : null, originalPriceMinor: null, currency: null, rawPriceText: raw };
  }

  const prices = priceTexts
    .map((raw) => ({ raw, amountMinor: normalizePriceToMinorUnits(raw, currency) }))
    .filter((price): price is { raw: string; amountMinor: number } => price.amountMinor !== null)
    .filter((price) => price.amountMinor >= 0);

  if (prices.length === 0) {
    return { currentPriceMinor: null, originalPriceMinor: null, currency, rawPriceText: priceTexts[0] ?? "" };
  }

  const explicitFinal = element.querySelector<HTMLElement>(".discount_final_price, [class*='final_price']");
  const explicitFinalPrice = explicitFinal ? normalizePriceToMinorUnits(text(explicitFinal), currency) : null;
  const currentPriceMinor =
    explicitFinalPrice ??
    (discountPercent && prices.length > 1
      ? Math.min(...prices.map((price) => price.amountMinor))
      : prices[prices.length - 1].amountMinor);
  const originalPriceMinor =
    discountPercent && prices.length > 1
      ? Math.max(...prices.map((price) => price.amountMinor))
      : null;

  return {
    currentPriceMinor,
    originalPriceMinor,
    currency,
    rawPriceText: prices.find((price) => price.amountMinor === currentPriceMinor)?.raw ?? priceTexts[0] ?? ""
  };
}

function detectKind(element: HTMLElement, appId: string | null): CartItemKind {
  const value = `${element.dataset.dsItemtype ?? ""} ${element.className} ${text(element)}`.toLowerCase();
  if (value.includes("bundle")) return "bundle";
  if (value.includes("package") || element.dataset.dsPackageid) return "package";
  if (value.includes("dlc")) return "dlc";
  return appId ? "game" : "unknown";
}

function findCartRow(start: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = start;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (isLikelyCartItemRow(current)) return current;
    if (isCartPageRoot(current)) break;
    current = current.parentElement;
  }
  return null;
}

function isLikelyCartItemRow(element: HTMLElement): boolean {
  if (element.id === "cart_estimated_total") return false;
  if (element.closest("[data-steam-sale-helper-card], #steam-sale-helper-summary")) return false;
  const value = text(element);
  if (!hasPrice(value)) return false;
  if (value.length < 8 || value.length > 900) return false;
  const hasStoreLink = Boolean(element.querySelector('a[href*="/app/"], a[href*="/bundle/"], a[href*="/sub/"]'));
  const hasCartActions = /Удалить|Добавить|Remove|Add|Для моего аккаунта|For my account/i.test(value);
  const hasImage = Boolean(element.querySelector("img"));
  const rect = element.getBoundingClientRect();
  return (rect.width === 0 || rect.width > 260) && (hasStoreLink || hasCartActions || hasImage);
}

function isCartPageRoot(element: HTMLElement): boolean {
  return element === document.body || element.id === "cart_status_data" || element.className.toString().toLowerCase().includes("cart_page");
}

function findRowsFromPriceNodes(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("div, span")]
    .filter((element) => hasPrice(text(element)) && text(element).length <= 80)
    .map((element) => findCartRow(element))
    .filter((element): element is HTMLElement => Boolean(element));
}

function dedupeRows(rows: HTMLElement[]): HTMLElement[] {
  const compact = rows.filter((row, index) => rows.findIndex((other) => other === row || other.contains(row)) === index);
  return compact.filter((row, index) => compact.findIndex((other) => other.textContent === row.textContent) === index);
}

function findLikelyTitle(element: HTMLElement): string | null {
  const candidates = [...element.querySelectorAll<HTMLElement>("a, div, span")]
    .map((node) => text(node))
    .filter((value) => value.length >= 2 && value.length <= 120)
    .filter((value) => !hasPrice(value))
    .filter((value) => !/Удалить|Добавить|Для моего аккаунта|товаров|Remove|Add|account|Windows|Mac|Linux/i.test(value));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function collectPriceTexts(element: HTMLElement): string[] {
  const nodes = [
    ...element.querySelectorAll<HTMLElement>(
      ".discount_final_price, [class*='final_price'], .price, [class*='price'], .discount_original_price, .original_price, [class*='original']"
    )
  ];
  const fromNodes = nodes.map((node) => text(node)).filter(hasPrice);
  const fromText = [...text(element).matchAll(priceRegex())].map((match) => match[0]);
  return [...fromNodes, ...fromText].filter((value, index, all) => all.indexOf(value) === index);
}

function hasPrice(value: string): boolean {
  return priceRegex().test(value);
}

function priceRegex(): RegExp {
  return /(?:R\$|\$|€|₽|₸|₴|₺|TL|£|zł|₹|¥|₩)\s*[\d\s.,]+|[\d\s.,]+\s*(?:₽|₸|₴|₺|TL|zł|€|£|₹|¥|₩)/g;
}
