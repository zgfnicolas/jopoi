"use client";
import { ActionButton, ActionLink, Notice } from "@/components/ui/primitives";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="stack"><h1>No pudimos mostrar esta página</h1><Notice title="Ocurrió un error inesperado" tone="error" announce><p>Volvé a cargar el contenido. Esta acción no envía datos ni inicia otro recorrido.</p></Notice><div className="actions"><ActionButton onClick={reset}>Volver a cargar</ActionButton><ActionLink href="/" variant="secondary">Ir al inicio</ActionLink></div></div>;
}
