"use client";
import { useEffect, useRef, useState } from "react";
import type { TraceEvent, TraceEvidence, TraceLinks } from "@/shared/trace-contracts";
import type { CurrentVerification } from "@/frontend/use-trace-verification";
import { API_ERROR_CATALOG } from "@/shared/api-errors";
import { canonicalJson } from "@/domain/canonical-json";
import { formatDate } from "@/frontend/format";
import { ActionButton, Notice } from "./ui/primitives";
import { IntegrityStatus, PublicationStatus, VerificationStatus } from "./ui/status";
import styles from "./trace-reader.module.css";

export const traceEventNames = { LOT_PUBLISHED: "Publicación del lote", LOT_APPROVED: "Aprobación del lote", LOT_REJECTED: "Rechazo del lote", TRANSPORT_ASSIGNED: "Asignación del transporte", PICKUP_CONFIRMED: "Confirmación de retiro", RECEIPT_ACCEPTED: "Recepción conforme", RECEIPT_ISSUE_REPORTED: "Incidencia de recepción" };
const roles = { generator: "Generador", coordinator: "Coordinador Jopói", carrier: "Transportista", buyer: "Comprador" };
export function TraceEventView({ event, current, busyEvent, verify }: { event: TraceEvent; current?: CurrentVerification; busyEvent: string | null; verify: () => void }) {
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (current && current.status !== "loading") feedback.current?.focus(); }, [current]);
  const payload = event.event?.payload;
  return <li className={styles.event}>
    <h3>{traceEventNames[event.type]}</h3><p>{roles[event.role]} · rol simulado · Aplicado en SQL el {formatDate(event.appliedAt)}</p>
    {payload?.detail.reason && <p>Motivo de ejemplo: {payload.detail.reason.label}</p>}
    <dl className="record-facts"><div><dt>Publicación según el historial</dt><dd><PublicationStatus state={event.publication.state} /></dd></div><div><dt>Integridad local</dt><dd><IntegrityStatus state={event.integrity.state} /></dd></div><div><dt>Contraste histórico guardado</dt><dd><VerificationStatus state={event.storedVerification.state} />{event.storedVerification.verifiedAt && <small>Registrado el {formatDate(event.storedVerification.verifiedAt)}</small>}</dd></div></dl>
    {event.publication.confirmedAt && <p>Confirmación de red registrada el {formatDate(event.publication.confirmedAt)}.</p>}
    {event.publication.consensusTimestamp && <p>Timestamp de consenso: <span className="identifier">{event.publication.consensusTimestamp}</span>.</p>}
    {event.publication.state === "CONFIRMED" && ["NOT_CHECKED", "PENDING", "UNAVAILABLE"].includes(event.storedVerification.state) && <p>La confirmación no acredita todavía una coincidencia del hash en el mirror.</p>}
    <details className={styles.details}><summary>Ver detalle y contrastar {traceEventNames[event.type].toLowerCase()}</summary><div className="stack">
      <p>Versión del payload: {event.payloadVersion}. Hito: <span className="identifier">{event.eventId}</span>.</p>
      <dl className={styles.digests}><Digest label="Hash guardado en SQL" value={event.integrity.storedDigest} /><Digest label="Hash recalculado por la aplicación" value={event.integrity.localDigest} /></dl>
      {event.integrity.storedDigest && <CopyText text={event.integrity.storedDigest} label="Copiar hash guardado" />}
      {payload ? <><p>Detalle público. El hash SHA-256 corresponde a su representación canónica JCS; el siguiente texto se muestra indentado para facilitar la lectura.</p>
        <pre className={styles.payload} tabIndex={0} aria-label="Payload público del hito"><code>{JSON.stringify(payload, null, 2)}</code></pre><CopyText text={canonicalJson(payload)} label="Copiar payload canónico JCS" />
      </> : <Notice title="El detalle no está disponible" tone="error"><p>La aplicación detectó una inconsistencia. Conservamos los metadatos y hashes disponibles, sin reconstruir ni sustituir el payload original.</p></Notice>}
      {event.storedVerification.evidence && <section className="stack" aria-label="Evidencia histórica"><h4 className={styles.subheading}>Evidencia histórica guardada</h4><p>Esta observación anterior no sustituye una consulta actual.</p><EvidenceView evidence={event.storedVerification.evidence} /></section>}
      <TestnetLinks links={event.links} />
      <section className="stack" aria-label="Contraste actual con testnet"><h4 className={styles.subheading}>Consultar el contraste actual</h4><p>Solo lee la evidencia disponible en testnet. No publica mensajes, no reintenta envíos y no modifica el estado guardado.</p>
        <div><ActionButton type="button" disabled={busyEvent !== null && busyEvent !== event.eventId} busy={busyEvent === event.eventId} busyLabel="Consultando testnet…" onClick={verify}>Contrastar con testnet</ActionButton></div>
        {busyEvent !== null && busyEvent !== event.eventId && <p>Esperá a que termine la consulta del otro hito.</p>}
        <div ref={feedback} tabIndex={-1} className="stack">
          {current?.status === "loading" && <Notice title="Consultando la evidencia de este hito…" announce><p>Una lectura acotada, sin reintentos automáticos.</p></Notice>}
          {current?.status === "error" && <Notice title="No pudimos obtener un contraste actual" tone="error" announce><p>{current.error.code in API_ERROR_CATALOG ? API_ERROR_CATALOG[current.error.code as keyof typeof API_ERROR_CATALOG].message : "No recibimos una respuesta válida. Podés volver a consultar manualmente."}</p><p>El historial guardado se conserva; esta respuesta no confirma una coincidencia actual.</p>{current.error.requestId && <p>Referencia: <span className="identifier">{current.error.requestId}</span></p>}</Notice>}
          {current?.status === "ready" && <><Notice title="Resultado de esta consulta" announce><VerificationStatus state={current.data.state} />
            {current.data.state === "NOT_CHECKED" && <p>No hay un intento verificable disponible. No se realizó un contraste remoto.</p>}
            {current.data.state === "PENDING" && <p>La evidencia todavía no está disponible para confirmar una coincidencia.</p>}
            {current.data.state === "MISMATCH" && <p>Hay una discrepancia local o remota. No se modificó el detalle original ni se confirmó su integridad.</p>}
            {current.data.state === "UNAVAILABLE" && <p>No se pudo comprobar la evidencia ahora. Una coincidencia histórica no sustituye este resultado.</p>}
            {current.data.state === "MATCHED" && <p>El mensaje y sus identificadores coinciden en esta observación. Esto no reconcilia el estado SQL ni certifica una entrega física.</p>}
          </Notice><p>Publicación guardada al obtener esta respuesta: <PublicationStatus state={current.data.publication.state} /></p>
            {current.data.observation && <EvidenceView evidence={current.data.observation.evidence} />}
            <TestnetLinks links={current.data.links} />
          </>}
        </div>
      </section>
    </div></details>
  </li>;
}
function Digest({ label, value }: { label: string; value: string | null }) { return <div><dt>{label}</dt><dd className="identifier">{value ?? "No disponible"}</dd></div>; }
function EvidenceView({ evidence }: { evidence: TraceEvidence }) {
  return <dl className={`record-facts ${styles.digests}`}><div><dt>Observado el</dt><dd>{formatDate(evidence.observedAt)}</dd></div><div><dt>Topic testnet</dt><dd className="identifier">{evidence.topicId}</dd></div><div><dt>Transacción</dt><dd className="identifier">{evidence.transactionId}</dd></div>
    <div><dt>Secuencia</dt><dd>{evidence.sequenceNumber ?? "No disponible"}</dd></div><div><dt>Timestamp de consenso</dt><dd>{evidence.consensusTimestamp ?? "No disponible"}</dd></div>
    <Digest label="Hash local de esta observación" value={evidence.localDigest} /><Digest label="Hash observado en testnet" value={evidence.remoteDigest} />
    <div><dt>Coincidencia de identificadores</dt><dd>{evidence.identifiersMatch ? "Coincidentes" : "No acreditada"}</dd></div><div><dt>Coincidencia de hash</dt><dd>{evidence.digestMatch ? "Coincidente" : "No acreditada"}</dd></div>
  </dl>;
}
function TestnetLinks({ links }: { links: TraceLinks }) {
  const available = [["Transacción en el mirror de testnet", links.transaction], ["Topic en el mirror de testnet", links.topic], ["Mensaje en el mirror de testnet", links.message]] as const;
  return <div className="stack">{available.some(([, url]) => url) ? <ul>{available.map(([label, url]) => url && <li key={label}><a href={url} target="_blank" rel="noopener noreferrer">{label} (abre otra pestaña)</a></li>)}</ul> : <p>No hay referencias de testnet disponibles para este hito.</p>}</div>;
}
function CopyText({ text, label }: { text: string; label: string }) {
  const [message, setMessage] = useState("");
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(text); if (active.current) setMessage("Contenido copiado."); }
    catch { if (active.current) setMessage("No pudimos copiarlo. Podés seleccionar el texto visible y copiarlo manualmente."); }
  }
  return <div className="stack"><div><ActionButton type="button" secondary onClick={copy}>{label}</ActionButton></div>{message && <p role="status">{message}</p>}</div>;
}
