export const THEME_STORAGE_KEY = "wiki-icm-theme-v1";

type Theme = "light" | "dark";

// Run in the document head before painting. No browser access at module scope.
export const themeInitializationScript = `(() => {
  let theme = null;
  try {
    const stored = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    if (stored === "light" || stored === "dark") theme = stored;
  } catch {}
  if (theme === null) {
    theme = "light";
    try {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
    } catch {}
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
})();`;

let preference: Theme | null | undefined;
const listeners = new Set<() => void>();

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function readPreference(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  listeners.forEach((listener) => listener());
}

export function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function getThemeServerSnapshot(): boolean {
  return false;
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  if (preference === undefined) preference = readPreference();
  applyTheme(preference ?? systemTheme());

  const onSystemChange = () => {
    if (preference === null) applyTheme(systemTheme());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    preference = isTheme(event.newValue) ? event.newValue : null;
    applyTheme(preference ?? systemTheme());
  };

  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onSystemChange);
  } catch {
    // System preference is optional; manual switching remains available.
  }
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    media?.removeEventListener?.("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function toggleTheme(): void {
  preference = getThemeSnapshot() ? "light" : "dark";
  applyTheme(preference);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Keep the current-session choice even if persistence is unavailable.
  }
}
