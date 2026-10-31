export type Theme = "light" | "dark";

// Also read by the inline script in index.html, which applies a saved dark
// choice before first paint so the page doesn't flash light.
const STORAGE_KEY = "engage-estero:theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Apply a theme and remember it for the next visit. */
export function saveTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}
