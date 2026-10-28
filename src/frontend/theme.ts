export type ThemePreference = "system" | "light" | "dark";
export const THEME_KEY = "jopoi.theme";
export function themePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
// Static, user-independent source: keep this exact string when computing a CSP hash.
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("jopoi.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})();`;
