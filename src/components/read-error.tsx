"use client";
import { API_ERROR_CATALOG } from "@/shared/api-errors";
import { retryAfterMessage } from "@/frontend/retry-after";
import type { ReadError } from "@/frontend/api";
import { ActionButton, ActionLink, Notice } from "./ui/primitives";
const explanations: Partial<Record<ReadError["code"], { title: string; text: string }>> = {
  SESSION_REQUIRED: { title: "No hay una sesión activa", text: "Esta base permite consultar recorridos existentes. El inicio del recorrido interactivo se habilitará en una etapa posterior." },
  SESSION_EXPIRED: { title: "Tu sesión venció", text: "La vista privada dejó de estar disponible. Un enlace público puede seguir vigente hasta el vencimiento de su recorrido." },
  TRACE_EXPIRED: { title: "La consulta venció", text: "Los datos operativos ya no están disponibles. La retención de la demo es de siete días." },
  NOT_FOUND: { title: "Recorrido no disponible", text: "Revisá el identificador compartido. El recorrido puede no existir o haber sido eliminado tras su vencimiento." },
  VERSION_CONFLICT: { title: "La información cambió", text: "Actualizá la consulta para recuperar el estado vigente." },
  STATE_CONFLICT: { title: "El estado cambió", text: "Actualizá la consulta antes de continuar." },
  IDEMPOTENCY_CONFLICT: { title: "La solicitud tiene un conflicto", text: "Conservá los datos y revisá la intención original antes de enviar otra solicitud." },
  RUN_LIMIT_REACHED: { title: "Se alcanzó el cupo de recorridos", text: "Podés seguir consultando los recorridos disponibles; actualizar no amplía el cupo." },
};
export function ReadErrorView({ error, refresh }: { error: ReadError; refresh: () => void }) {
  const custom = explanations[error.code];
  const message = error.code in API_ERROR_CATALOG ? API_ERROR_CATALOG[error.code as keyof typeof API_ERROR_CATALOG].message : "No pudimos recuperar los datos. Revisá tu conexión y volvé a consultar.";
  return <div className="stack"><Notice title={custom?.title ?? "La consulta no está disponible"} tone="error" announce>
    <p>{custom?.text ?? message}{retryAfterMessage(error.retryAfter)}</p>{error.requestId && <p>Referencia de consulta: <span className="identifier">{error.requestId}</span></p>}
  </Notice><div className="actions"><ActionButton onClick={refresh}>Actualizar consulta</ActionButton><ActionLink href="/" variant="secondary">Volver al inicio</ActionLink></div></div>;
}
