"use client";
import { useEffect, useState } from "react";
import { THEME_KEY, themePreference, type ThemePreference } from "@/frontend/theme";
import { SelectField } from "./ui/primitives";

function apply(value: ThemePreference) {
  if (value === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
}

export function ThemeSelector() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // The bootstrap has already applied stored preferences before first paint.
    setPreference(themePreference(document.documentElement.dataset.theme ?? null));
    setReady(true);
    function sync(event: StorageEvent) {
      if (event.key !== THEME_KEY && event.key !== null) return;
      const value = themePreference(event.newValue);
      setPreference(value);
      apply(value);
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return <div className="theme-selector"><SelectField id="appearance" label="Apariencia" disabled={!ready} value={preference} onChange={event => {
    const value = themePreference(event.target.value);
    setPreference(value); apply(value);
    try { localStorage.setItem(THEME_KEY, value); } catch { /* Session choice still works. */ }
  }}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></SelectField><noscript>Se usa la apariencia del sistema.</noscript></div>;
}
