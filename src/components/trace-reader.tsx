"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicTraceResponse } from "@/shared/trace-contracts";
import type { ReadError } from "@/frontend/api";
import { useReadResource } from "@/frontend/use-read-resource";
import { publicTraceExpiry, publicTraceSchema } from "@/frontend/trace-models";
import { useTraceVerification } from "@/frontend/use-trace-verification";
import { formatDate, formatDecimal, formatHumidity, formatKg } from "@/frontend/format";
import { ActionButton, Notice } from "./ui/primitives";
import { OperationalStatus } from "./ui/status";
import { ReadErrorView } from "./read-error";
import { TraceEventView } from "./trace-event";
import { TraceShare } from "./trace-share";
import styles from "./trace-reader.module.css";

export function TraceReader({ traceId, publicOrigin }: { traceId: string; publicOrigin: string | null }) {
  const { resource, refresh, invalidate } = useReadResource(`/api/traces/${traceId}`, publicTraceSchema, publicTraceExpiry, "TRACE_EXPIRED", "omit");
  const [notice, setNotice] = useState<{ traceId: string; text: string } | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const focusAfterRead = useRef(false);
  useEffect(() => {
    if (resource.status !== "loading" && focusAfterRead.current) {
      focusAfterRead.current = false;
      (notice?.traceId === traceId ? feedback.current : document.getElementById("trace-material") ?? feedback.current)?.focus();
    }
  }, [resource.status, notice, traceId]);
  function changed() { focusAfterRead.current = true; setNotice({ traceId, text: "El registro cambió. Actualizamos el historial y descartamos la observación anterior. Revisá el detalle antes de solicitar otro contraste." }); refresh(); }
  function manualRefresh() { focusAfterRead.current = true; setNotice(null); refresh(); }
  return <div className="stack" ref={feedback} tabIndex={-1}>
    {notice?.traceId === traceId && <Notice title="El historial necesita una nueva revisión" announce><p>{notice.text}</p></Notice>}
    {resource.status === "loading" ? <Notice title="Consultando el recorrido…" announce><p>Recuperamos el historial guardado. Esta lectura no contacta el mirror ni crea sesiones.</p></Notice>
      : resource.status === "error" ? <ReadErrorView error={resource.error} refresh={manualRefresh} />
      : resource.data.traceId !== traceId ? <ReadErrorView error={{ code: "INVALID_RESPONSE" }} refresh={manualRefresh} />
      : <TraceContent key={traceId} trace={resource.data} publicOrigin={publicOrigin} refresh={manualRefresh} invalidate={invalidate} changed={changed} />}
  </div>;
}
function TraceContent({ trace, publicOrigin, refresh, invalidate, changed }: { trace: PublicTraceResponse; publicOrigin: string | null; refresh: () => void;
  invalidate: (error: ReadError) => void; changed: () => void }) {
  const verification = useTraceVerification(trace, invalidate, changed);
  const rejection = trace.events.find(event => event.type === "LOT_REJECTED")?.event?.payload.detail.reason;
  return <div className="stack">
    <section className={`${styles.overview} content-section`} aria-labelledby="trace-material">
      <div className="stack"><h2 id="trace-material" tabIndex={-1}>{trace.scenario.material.label}</h2><OperationalStatus state={trace.state} />
        <p>{trace.scenario.material.description}</p><p>{trace.scenario.generator.name} → {trace.scenario.buyer.name}. Empresas ficticias.</p>
        <p>{trace.scenario.route.label}: {trace.scenario.route.origin} a {trace.scenario.route.destination}. Distancia ilustrativa: {formatDecimal(trace.scenario.route.distanceKm)} km.</p>
        {trace.scenario.trip && <p>Viaje asignado: {trace.scenario.trip.label}, por {trace.scenario.trip.carrier.name}. Transportista ficticio.</p>}
        <p className="muted">Consulta disponible hasta {formatDate(trace.expiresAt)}.</p>
      </div>
      <div className="stack">
        {trace.declaration ? <dl className="facts"><div><dt>Cantidad declarada y publicada</dt><dd>{formatKg(trace.declaration.quantityKg)}</dd></div><div><dt>Humedad declarada</dt><dd>{formatHumidity(trace.declaration.humidityPercent)}</dd></div></dl>
          : <Notice title={trace.state === "DRAFT" ? "Todavía no hay una declaración publicada" : "Declaración no disponible"}><p>{trace.state === "DRAFT" ? "La cantidad y humedad del borrador no son públicas." : "Revisá los avisos de integridad de los hitos. No reconstruimos un detalle inconsistente."}</p></Notice>}
        {trace.state === "REJECTED" && <Notice title="Recorrido cerrado por rechazo"><p>{rejection?.label ?? "El motivo no está disponible en un detalle íntegro. Consultá el hito de rechazo."}</p><p>Este resultado no es una recepción conforme ni un paso pendiente de completar.</p></Notice>}
        {trace.reception ? <dl className="facts"><div><dt>{trace.reception.outcome === "RECEIVED" ? "Peso recibido con conformidad" : "Peso recibido con incidencia"}</dt><dd>{formatKg(trace.reception.receivedKg)}</dd></div>{trace.reception.reason && <div><dt>Motivo de ejemplo</dt><dd>{trace.reception.reason.label}</dd></div>}</dl>
          : ["RECEIVED", "INCIDENT"].includes(trace.state) && <Notice title="Detalle de recepción no disponible"><p>El cierre operativo se conserva, pero no reconstruimos pesos o motivos desde un hito inconsistente.</p></Notice>}
        {trace.state === "INCIDENT" && <p>El recorrido cerró con una incidencia. El peso recibido permanece separado de la declaración; no se presenta como recepción conforme.</p>}
      </div>
    </section>
    <Notice title="Datos ilustrativos"><p>{trace.scenario.disclaimer}</p><p>El registro conserva declaraciones de la demo. No certifica peso, calidad ni una entrega física.</p></Notice>
    <section className="content-section stack" aria-labelledby="record-heading"><h2 id="record-heading">Historial y evidencia</h2>
      <p>La acción SQL, su confirmación en testnet y el contraste del hash son conceptos distintos. El resumen muestra la última lectura del historial; el contraste actual se solicita por hito.</p>
      {trace.events.length === 0 ? <Notice title="Sin hitos publicados"><p>Guardar un borrador no genera un registro en testnet. Actualizar la consulta no publica mensajes.</p></Notice> :
        <ol className={styles.timeline}>{trace.events.map(event => <TraceEventView key={event.eventId} event={event} current={verification.results[event.eventId]} busyEvent={verification.busyEvent} verify={() => { void verification.verify(event); }} />)}</ol>}
    </section>
    <section className="content-section stack" aria-labelledby="share-heading"><h2 id="share-heading">Compartir esta consulta</h2><TraceShare traceId={trace.traceId} expiresAt={trace.expiresAt} publicOrigin={publicOrigin} /></section>
    <div className="stack"><p>Actualizar vuelve a leer SQL y descarta las observaciones transitorias anteriores. No hay seguimiento continuo ni reintentos automáticos.</p><div><ActionButton type="button" variant="secondary" onClick={refresh}>Actualizar lectura</ActionButton></div></div>
  </div>;
}
