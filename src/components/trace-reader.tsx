"use client";
import { useReadResource } from "@/frontend/use-read-resource";
import { traceExpiry, traceViewSchema } from "@/frontend/read-models";
import { formatDate, formatHumidity, formatKg } from "@/frontend/format";
import { ActionButton, Notice } from "./ui/primitives";
import { IntegrityStatus, OperationalStatus, PublicationStatus, VerificationStatus } from "./ui/status";
import { ReadErrorView } from "./read-error";
const eventNames = { LOT_PUBLISHED: "Publicación del lote", LOT_APPROVED: "Aprobación del lote", LOT_REJECTED: "Rechazo del lote", TRANSPORT_ASSIGNED: "Asignación del transporte", PICKUP_CONFIRMED: "Confirmación de retiro", RECEIPT_ACCEPTED: "Recepción conforme", RECEIPT_ISSUE_REPORTED: "Incidencia de recepción" };
export function TraceReader({ traceId }: { traceId: string }) {
  const { resource, refresh } = useReadResource(`/api/traces/${traceId}`, traceViewSchema, traceExpiry, "TRACE_EXPIRED");
  if (resource.status === "loading") return <Notice title="Consultando el recorrido…" announce><p>Solo vamos a recuperar su historial guardado en la aplicación.</p></Notice>;
  if (resource.status === "error") return <ReadErrorView error={resource.error} refresh={refresh} />;
  const trace = resource.data;
  return <div className="stack">
    <section className="stack" aria-labelledby="trace-material"><h2 id="trace-material">{trace.scenario.material.label}</h2>
      <OperationalStatus state={trace.state} />
      <p>{trace.scenario.generator.name} → {trace.scenario.buyer.name}. Empresas ficticias.</p>
      <p>{trace.scenario.route.label}: {trace.scenario.route.origin} a {trace.scenario.route.destination}.</p>
      <p className="muted">Disponible hasta {formatDate(trace.expiresAt)}.</p>
      {trace.declaration ? <dl className="facts"><div><dt>Cantidad declarada</dt><dd>{formatKg(trace.declaration.quantityKg)}</dd></div><div><dt>Humedad declarada</dt><dd>{formatHumidity(trace.declaration.humidityPercent)}</dd></div></dl>
        : <Notice title={trace.state === "DRAFT" ? "Todavía no hay una declaración publicada" : "Declaración no disponible"}><p>{trace.state === "DRAFT" ? "La cantidad y humedad del borrador no son públicas." : "Revisá los avisos de integridad de los hitos. No reconstruimos un detalle inconsistente."}</p></Notice>}
      {trace.reception && <dl className="facts"><div><dt>{trace.reception.outcome === "RECEIVED" ? "Recepción conforme" : "Incidencia de recepción"}</dt><dd>{formatKg(trace.reception.receivedKg)}</dd></div>{trace.reception.reason && <div><dt>Motivo de ejemplo</dt><dd>{trace.reception.reason.label}</dd></div>}</dl>}
    </section>
    <section className="stack" aria-labelledby="record-heading"><h2 id="record-heading">Estados de los registros</h2>
      <p>La operación, la confirmación en testnet y el contraste del hash son cosas distintas. Los estados siguientes corresponden a evidencia guardada; esta página no realiza una verificación remota nueva.</p>
      {trace.events.length === 0 ? <Notice title="Sin hitos publicados"><p>Guardar un borrador no genera un registro en testnet.</p></Notice> :
        <ul className="record-list">{trace.events.map(event => <li key={event.eventId}><h3>{eventNames[event.type]}</h3>
          <dl className="record-facts"><div><dt>Publicación</dt><dd><PublicationStatus state={event.publication.state} /></dd></div><div><dt>Integridad local</dt><dd><IntegrityStatus state={event.integrity.state} /></dd></div><div><dt>Contraste histórico</dt><dd><VerificationStatus state={event.storedVerification.state} />{event.storedVerification.verifiedAt && <small>Última consulta: {formatDate(event.storedVerification.verifiedAt)}</small>}</dd></div></dl>
        </li>)}</ul>}
    </section>
    <Notice title="Datos ilustrativos"><p>{trace.scenario.disclaimer}</p><p>El registro conserva declaraciones de la demo; no certifica el peso ni una entrega física.</p></Notice>
    <div><ActionButton onClick={refresh} secondary>Actualizar lectura</ActionButton></div>
  </div>;
}
