import { describe, expect, it } from "vitest";
import { detectCurrency, formatMoney, normalizePriceToMinorUnits, parsePrice } from "../src/lib/price";

describe("price helpers", () => {
  it.each([
    ["999 ₽", "RUB", 99900],
    ["$19.99", "USD", 1999],
    ["19,99€", "EUR", 1999],
    ["1 499 ₸", "KZT", 149900],
    ["₺249,50", "TRY", 24950],
    ["R$ 39,99", "BRL", 3999]
  ] as const)("parses %s", (text, currency, amountMinor) => {
    expect(parsePrice(text)).toMatchObject({ currency, amountMinor });
  });

  it("detects supported currencies", () => {
    expect(detectCurrency("zł 49,99")).toBe("PLN");
    expect(detectCurrency("₹ 799")).toBe("INR");
    expect(detectCurrency("₩ 12000")).toBe("KRW");
  });

  it("formats money without floats", () => {
    expect(formatMoney(39900, "RUB")).toBe("399 ₽");
    expect(formatMoney(1999, "USD")).toBe("$19,99");
  });

  it("normalizes text to minor units", () => {
    expect(normalizePriceToMinorUnits("1 234,56 ₽", "RUB")).toBe(123456);
    expect(normalizePriceToMinorUnits("¥ 1200", "JPY")).toBe(1200);
  });
});
