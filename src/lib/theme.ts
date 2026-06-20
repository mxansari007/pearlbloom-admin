// src/lib/theme.ts
// Admin theme handling. Two modes:
//   - "light"  : the default light admin theme (unchanged)
//   - "colour" : a warm deep-plum + gold dark theme (NOT plain black)
// The actual colours live in index.css, scoped to :root[data-theme="colour"].
// We only flip the data-theme attribute + remember the choice in localStorage.

export type AdminTheme = "light" | "colour";

const STORAGE_KEY = "pb-admin-theme";

export function getTheme(): AdminTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "colour" ? "colour" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: AdminTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme: AdminTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — still apply for this session */
  }
  applyTheme(theme);
}
