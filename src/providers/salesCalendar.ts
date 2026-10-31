import seedEvents from "../data/sales-calendar.seed.json";
import { setCachedSalesCalendar } from "../lib/storage";
import type { SteamSaleEvent } from "../types";

const GUIDE_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3412688383";

export class SalesCalendarProvider {
  async getSalesCalendar(): Promise<SteamSaleEvent[]> {
    const seed = this.getSeedCalendar();
    await setCachedSalesCalendar(seed);
    return seed;
  }

  getSeedCalendar(): SteamSaleEvent[] {
    return [...(seedEvents as SteamSaleEvent[])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  async refreshFromGuide(): Promise<SteamSaleEvent[]> {
    const seed = this.getSeedCalendar();
    await setCachedSalesCalendar(seed);
    return seed;
  }
}

export function parseSteamCommunityGuideCalendar(html: string): SteamSaleEvent[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.textContent?.replace(/\s+/g, " ") ?? "";
  const events: SteamSaleEvent[] = [];
  const monthMap = new Map([
    ["января", 1],
    ["февраля", 2],
    ["марта", 3],
    ["апреля", 4],
    ["мая", 5],
    ["июня", 6],
    ["июля", 7],
    ["августа", 8],
    ["сентября", 9],
    ["октября", 10],
    ["ноября", 11],
    ["декабря", 12]
  ]);

  const knownNames = [
    "Зимняя распродажа",
    "Весенняя распродажа",
    "Летняя распродажа",
    "Осенняя распродажа",
    "Фестиваль[^\\d]{2,80}?"
  ];
  const regex = new RegExp(`(${knownNames.join("|")})\\s+(\\d{1,2})\\s+([а-яё]+)\\s+[–-]\\s*(\\d{1,2})\\s+([а-яё]+)`, "giu");
  for (const match of text.matchAll(regex)) {
    const nameRu = match[1].trim();
    const startMonth = monthMap.get(match[3].toLowerCase());
    const endMonth = monthMap.get(match[5].toLowerCase());
    if (!startMonth || !endMonth) continue;
    const year = startMonth === 12 && endMonth === 1 ? 2025 : 2026;
    const endYear = endMonth < startMonth ? year + 1 : year;
    const name = translateSaleName(nameRu);
    events.push({
      id: slug(`${name}-${year}-${events.length}`),
      name,
      startDate: dateIso(year, startMonth, Number(match[2])),
      endDate: dateIso(endYear, endMonth, Number(match[4])),
      kind: /распродажа/i.test(nameRu) ? "seasonal" : "festival",
      tags: tagsForName(name)
    });
  }
  return dedupe(events);
}

function translateSaleName(nameRu: string): string {
  if (/зимняя/i.test(nameRu)) return "❄️ Зимняя распродажа";
  if (/весенняя/i.test(nameRu)) return "🌸 Весенняя распродажа";
  if (/летняя/i.test(nameRu)) return "☀️ Летняя распродажа";
  if (/осенняя/i.test(nameRu)) return "🍂 Осенняя распродажа";
  return nameRu.trim();
}

function tagsForName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/^steam\s+/, "")
    .replace(/\s+sale$/, "")
    .replace(/\s+fest$/, "")
    .split(/\s+/)
    .filter(Boolean);
}

function dateIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "");
}

function dedupe(events: SteamSaleEvent[]): SteamSaleEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.name}:${event.startDate}:${event.endDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
