// Light or dark mode. The choice is remembered in this browser; with no choice, light mode is used.
export type Theme = "light" | "dark";

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("theme", t); } catch { /* storage blocked: the choice lasts for this page only */ }
}
