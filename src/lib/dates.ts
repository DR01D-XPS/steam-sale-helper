import type { SteamSaleEvent } from "../types";

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isDateWithinRange(dateIso: string, startIso: string, endIso: string): boolean {
  return dateIso >= startIso && dateIso <= endIso;
}

export function daysUntil(dateIso: string, now = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.parse(`${dateIso}T00:00:00Z`);
  return Math.ceil((target - start) / 86_400_000);
}

export function getFutureSales(events: SteamSaleEvent[], now = new Date()): SteamSaleEvent[] {
  const today = toDateOnly(now);
  return events
    .filter((event) => event.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function formatSaleDateRange(event: SteamSaleEvent): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  return `${formatter.format(new Date(`${event.startDate}T00:00:00Z`))} - ${formatter.format(new Date(`${event.endDate}T00:00:00Z`))}`;
}
