export function ready(): Promise<void> {
  if (document.readyState === "loading") {
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
  }
  return Promise.resolve();
}

export function debounce<T extends (...args: never[]) => void>(fn: T, delayMs: number): T {
  let timeoutId: number | undefined;
  return ((...args: never[]) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delayMs);
  }) as T;
}

export function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  content?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

export function removeChildren(element: Element): void {
  while (element.firstChild) element.firstChild.remove();
}
