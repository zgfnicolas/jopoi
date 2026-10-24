"use client";
import "./globals.css";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="es-AR"><body><main><h1>Jopói no está disponible en este momento</h1><p>No pudimos cargar la página. Podés volver a intentarlo.</p><button type="button" onClick={reset}>Volver a cargar</button><p><a href="/">Ir al inicio</a></p></main></body></html>;
}
