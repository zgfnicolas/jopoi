import type { Metadata } from "next";
import { headingFont } from "./heading-font";
import { Navigation } from "@/components/navigation";
import { THEME_BOOTSTRAP } from "@/frontend/theme";
import { siteMetadata } from "@/server/seo";
import "./globals.css";
export const metadata: Metadata = siteMetadata();
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es-AR" className={headingFont.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} /></head><body>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <Navigation />
    <p className="disclaimer">Prototipo personal · Datos y empresas ficticios · Registros disponibles en Hedera testnet</p>
    <main id="contenido" tabIndex={-1}>{children}</main>
    <footer><p>Jopói es una demostración. Los registros no certifican una carga física ni resultados comerciales.</p></footer>
  </body></html>;
}
