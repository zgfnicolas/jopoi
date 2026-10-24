import type { Metadata } from "next";
import localFont from "next/font/local";
import { Navigation } from "@/components/navigation";
import "./globals.css";
const headingFont = localFont({ src: "./fonts/BarlowSemiCondensed-SemiBold.ttf", weight: "600", style: "normal", display: "swap", variable: "--font-heading" });
export const metadata: Metadata = { title: { default: "Jopói · prototipo", template: "%s · Jopói" }, description: "Prototipo personal para coordinar materiales, transporte y trazabilidad con datos ilustrativos." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es-AR" className={headingFont.variable}><body>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <Navigation />
    <p className="disclaimer">Prototipo personal · Datos y empresas ficticios · Registros disponibles en Hedera testnet</p>
    <main id="contenido" tabIndex={-1}>{children}</main>
    <footer><p>Jopói es una demostración. Los registros no certifican una carga física ni resultados comerciales.</p></footer>
  </body></html>;
}
