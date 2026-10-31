# Steam Sale Helper

Steam Sale Helper is a Chromium Manifest V3 extension for the Steam cart. It adds a Steam-like recommendation card under each cart item and a green calculated cart total above the regular Steam total.

## How It Works

The content script parses cart items locally, detects AppID, title, current price, discount, currency and item type. The background script loads price history through a provider and the Steam sale calendar. The recommendation logic compares historical SteamDB-style price points with sale windows and chooses the best practical sale: if the nearest sale is almost as good as a later sale, the nearest sale wins.

All money is stored and calculated in minor units. The price shown as "Учитываемая цена" in a game card is exactly the price used in the green cart total.

## External Requests

The extension can request:

- `https://steamdb.info/app/{appId}/` when the `steamdb` provider is selected.
- `https://www.cheapshark.com/api/1.0/*` as a fallback discount source when SteamDB history is unavailable.
- `https://steamcommunity.com/sharedfiles/filedetails/?id=3412688383` when the sale calendar is refreshed.
- Steam cart pages where the content script runs.

The cart is not sent to third-party servers. Requests are per AppID and currency only. SteamDB has no stable public API for this use case, HTML can change, CORS can block requests, and data may be unavailable. In those cases the extension falls back to cache or current Steam prices.

## Development

```bash
npm install
npm run dev
npm run build
npm run test
```

Load `dist` as an unpacked extension in Chrome: open `chrome://extensions`, enable Developer mode, choose "Load unpacked", then select the `dist` folder.

Open the options page from the extension details page. You can enable/disable the extension, choose `mock` or `steamdb`, tune thresholds, clear cache, refresh the sale calendar and enable debug logs.

## Calendar

`src/data/sales-calendar.seed.json` contains the local calendar. It was seeded from the Steam Community guide "Даты распродаж Steam 2026", updated on 15 June 2026, with events such as Steam Summer Sale 2026 from 25 June to 9 July and Steam Winter Sale 2026 from 17 December to 4 January. Dates can change; update the JSON manually if the guide changes or automatic parsing fails.

## Discount Database

`src/data/discounts.seed.json` contains manual discount hints. Each entry can match by `appId` or by `titleIncludes`, so bundles without a normal App ID can still get a recommendation. Use `expectedPriceMinor` for an exact price in minor units (`1982300` means `19 823,00 ₸`) or `expectedDiscountPercent` when only the expected discount is known. Manual entries have priority over external fallback data.

## Supported Currencies

RUB, USD, EUR, KZT, UAH, TRY, BRL, GBP, PLN, INR, CNY, JPY and KRW.

## Privacy

The extension does not collect personal data, does not click purchase buttons, does not change cart contents and stores settings/cache only in `chrome.storage.local`.

## Current Limits

Steam can change cart DOM selectors. If cards disappear or prices are parsed incorrectly, inspect the cart markup and update `src/providers/steam.ts`. SteamDB HTML parsing is best-effort; use the mock provider for development and tests.
