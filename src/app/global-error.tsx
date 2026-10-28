"use client";
import "./globals.css";
import { ThemeSelector } from "@/components/theme-selector";
import { THEME_BOOTSTRAP } from "@/frontend/theme";
import { ActionButton } from "@/components/ui/primitives";
import { headingFont } from "./heading-font";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="es-AR" className={headingFont.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} /></head><body><main className="stack"><h1>Jopói no está disponible en este momento</h1><p>No pudimos cargar la página. Podés volver a intentarlo.</p><div><ActionButton type="button" onClick={reset}>Volver a cargar</ActionButton></div><p><a href="/">Ir al inicio</a></p><ThemeSelector /></main></body></html>;
}
