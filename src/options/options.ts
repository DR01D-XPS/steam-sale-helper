import type { BackgroundRequest, ExtensionSettings, ProviderResponse } from "../types";
import "./options.css";

const enabled = byId<HTMLInputElement>("enabled");
const priceRatio = byId<HTMLInputElement>("priceRatio");
const discountPp = byId<HTMLInputElement>("discountPp");
const cacheTtl = byId<HTMLInputElement>("cacheTtl");
const debug = byId<HTMLInputElement>("debug");
const provider = byId<HTMLSelectElement>("provider");
const status = byId<HTMLParagraphElement>("status");

void load();

byId<HTMLButtonElement>("save").addEventListener("click", () => void save());
byId<HTMLButtonElement>("clearCache").addEventListener("click", () => void action({ type: "cache:clear" }, "Кэш очищен."));
byId<HTMLButtonElement>("refreshCalendar").addEventListener("click", () =>
  void action({ type: "calendar:refresh" }, "Календарь обновлен.")
);

async function load(): Promise<void> {
  const settings = await sendMessage<ExtensionSettings>({ type: "settings:get" });
  if (!settings) return;
  enabled.checked = settings.enabled;
  priceRatio.value = String(Math.round(settings.insignificantPriceDiffRatio * 100));
  discountPp.value = String(settings.insignificantDiscountDiffPp);
  cacheTtl.value = String(settings.steamDbCacheTtlHours);
  debug.checked = settings.debug;
  provider.value = settings.provider;
}

async function save(): Promise<void> {
  await sendMessage<ExtensionSettings>({
    type: "settings:set",
    settings: {
      enabled: enabled.checked,
      insignificantPriceDiffRatio: Number(priceRatio.value) / 100,
      insignificantDiscountDiffPp: Number(discountPp.value),
      steamDbCacheTtlHours: Number(cacheTtl.value),
      debug: debug.checked,
      provider: provider.value as ExtensionSettings["provider"]
    }
  });
  setStatus("Настройки сохранены.");
}

async function action(request: BackgroundRequest, message: string): Promise<void> {
  await sendMessage(request);
  setStatus(message);
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function setStatus(message: string): void {
  status.textContent = message;
  window.setTimeout(() => {
    status.textContent = "";
  }, 3500);
}

function sendMessage<T>(request: BackgroundRequest): Promise<T | null> {
  return chrome.runtime.sendMessage(request).then((response: ProviderResponse<T>) => {
    if (!response?.ok) throw new Error(response?.error ?? "Background request failed");
    return response.data ?? null;
  });
}
