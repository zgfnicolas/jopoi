"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSelector } from "./theme-selector";
export function Navigation() {
  const path = usePathname();
  return <header className="site-header"><div className="header-content">
    <Link className="wordmark" href="/" aria-label="Jopói, inicio">Jopói</Link>
    <nav aria-label="Navegación principal">
      <Link href="/" aria-current={path === "/" ? "page" : undefined}>Inicio</Link>
      <Link href="/demo" prefetch={false} aria-current={path === "/demo" ? "page" : undefined}>Demo</Link>
      <Link href="/#consultar-trazabilidad" aria-current={path.startsWith("/trazabilidad/") ? "location" : undefined}>Consultar trazabilidad</Link>
      <Link href="/#book-a-demo">Solicitar una demostración</Link>
    </nav>
    <ThemeSelector />
  </div></header>;
}
