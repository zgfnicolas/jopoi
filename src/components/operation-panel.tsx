"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { DemoRunDetail } from "@/shared/run-contracts";
import type { SimulatedRole } from "@/shared/operation-contracts";
import type { PublicEventType } from "@/shared/event-contracts";
import { eventRole } from "@/domain/event-schemas";
import { useOperationPanel } from "@/frontend/use-operation-panel";
import { formatArs, formatDate, formatHumidity, formatKg } from "@/frontend/format";
import { ActionButton, Notice, SelectField } from "./ui/primitives";
import { OperationalStatus, PublicationStatus, VerificationStatus } from "./ui/status";
import { nextRoles, OperationTask, roleLabels } from "./operation-task";
import { TraceShare } from "./trace-share";
import styles from "./operation-panel.module.css";

const eventLabels: Record<PublicEventType, string> = { LOT_PUBLISHED: "Lote publicado", LOT_APPROVED: "Lote aprobado", LOT_REJECTED: "Lote rechazado",
  TRANSPORT_ASSIGNED: "Transporte asignado", PICKUP_CONFIRMED: "Retiro confirmado", RECEIPT_ACCEPTED: "Recepción conforme", RECEIPT_ISSUE_REPORTED: "Incidencia de recepción" };
const progressLabels = ["Declaración", "Revisión", "Transporte", "Retiro", "Recepción"];
const progressIndex = { DRAFT: 0, PUBLISHED: 1, APPROVED: 2, ASSIGNED: 3, PICKED_UP: 4, RECEIVED: 5, REJECTED: 1, INCIDENT: 4 };
export function OperationPanel({ publicOrigin }: { publicOrigin: string | null }) {
  const panel = useOperationPanel();
  const [role, setRole] = useState<SimulatedRole>("generator");
  const [confirmReset, setConfirmReset] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const run = panel.data?.run;
  useEffect(() => { if (!panel.busy && (panel.message || panel.error || panel.conflict)) feedback.current?.focus(); }, [panel.busy, panel.message, panel.error, panel.conflict]);
  useEffect(() => { setConfirmReset(false); }, [run?.traceId]);
  const fields = panel.error && "fields" in panel.error ? panel.error.fields : {};
  const requiredRole = run ? nextRoles[run.operation.state] : null;
  const startAllowed = !panel.data && (panel.error?.code === "SESSION_REQUIRED" || panel.error?.code === "SESSION_EXPIRED") || panel.data?.run === null;
  return <div className="stack">
    <div ref={feedback} tabIndex={-1} className="stack">
      {panel.busy && <Notice title="Procesando…" announce><p>Esperamos la respuesta del servidor. No cierres la página si querés conservar una intención pendiente.</p></Notice>}
      {panel.message && <Notice title={panel.message} tone={panel.stale ? "warning" : "success"} announce>{panel.stale && <p>Falta actualizar el detalle. El guardado confirmado no se volverá a enviar por este fallo de lectura.</p>}</Notice>}
      {panel.error && <Notice title={panel.uncertain ? "La acción sigue sin confirmar" : panel.conflict ? "El estado guardado cambió" : panel.error.code === "SESSION_EXPIRED" ? "Tu sesión venció" : panel.error.code === "SESSION_REQUIRED" ? "Comenzá tu exploración" : "No pudimos completar la consulta o acción"} tone={startAllowed && panel.error.code === "SESSION_REQUIRED" ? "info" : panel.uncertain || panel.conflict || ["SESSION_EXPIRED", "RUN_LIMIT_REACHED"].includes(panel.error.code) ? "warning" : "error"} announce>
        <p>{panel.errorText}</p>{Object.entries(fields).map(([key, value]) => <p key={key}>{value.join(" ")}</p>)}
        {panel.error.requestId && <p>Referencia: <span className="identifier">{panel.error.requestId}</span></p>}
        {panel.error.code === "SESSION_EXPIRED" && <p>Retiramos la vista privada. Los enlaces públicos pueden seguir disponibles hasta su propio vencimiento. Una nueva sesión no será propietaria de la anterior.</p>}
      </Notice>}
      {panel.uncertain && <Notice title="Conservamos la intención original"><p>La edición y las demás escrituras están bloqueadas. Reintentar enviará el mismo contenido y la misma clave; actualizar solo consulta y no resuelve por sí solo el guardado incierto.</p><p>El borrador y esta intención viven en memoria y se pierden al salir o recargar. Una sesión inicial cuya cookie nunca llegó no puede recuperarse con garantía.</p>
        <div><ActionButton type="button" disabled={panel.busy} onClick={panel.retryIntent}>Reintentar la misma acción</ActionButton></div></Notice>}
    </div>
    {startAllowed && !panel.uncertain && <section className="stack" aria-labelledby="start-title"><h2 id="start-title">Un lote y tres resultados para explorar</h2><p>Vas a representar generador, coordinador, transportista y comprador con empresas ficticias. Cada sesión dura 24 horas y permite hasta tres recorridos, incluido el primero.</p><p>Las acciones se guardan realmente; los hitos se envían a Hedera testnet cuando la red y las cuotas lo permiten.</p><div><ActionButton type="button" disabled={panel.busy} onClick={panel.start}>{panel.error?.code === "SESSION_EXPIRED" ? "Comenzar una nueva sesión" : "Comenzar"}</ActionButton></div></section>}
    {panel.data && <Notice title="Tu sesión de demostración"><p>Recorridos usados: {panel.data.session.runCount} de 3. Disponibles: {panel.data.session.remainingRuns}. Vigente hasta {formatDate(panel.data.session.expiresAt)}.</p><p>Los cambios de rol son simulados; no representan firmas independientes de empresas.</p></Notice>}
    {run && <>
      <div className={styles.statusHeader}><OperationalStatus state={run.operation.state} /><span>Versión guardada {run.version} · Datos disponibles hasta {formatDate(run.expiresAt)}</span></div>
      <ol className={styles.progress} aria-label="Progreso del recorrido">{progressLabels.map((label, index) => {
        const terminal = ["RECEIVED", "REJECTED", "INCIDENT"].includes(run.operation.state), current = progressIndex[run.operation.state];
        return <li key={label} aria-current={!terminal && index === current ? "step" : undefined}><strong>{label}</strong><span>{index < current ? "Completado" : index === current ? terminal ? "Cierre alternativo" : "Paso actual" : terminal ? "No aplica" : "Por realizar"}</span></li>;
      })}</ol>
      <div className={styles.workspace}>
        <section className={`${styles.task} stack`} aria-labelledby="task-title"><h2 id="task-title" tabIndex={-1}>Tu siguiente acción</h2>
          <SelectField label="Rol que estás representando" id="simulated-role" value={role} disabled={panel.blocked} onChange={event => {
            const parsed = eventRole.safeParse(event.target.value);
            if (parsed.success) setRole(parsed.data);
          }}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          {requiredRole && requiredRole !== role && <div><ActionButton type="button" variant="secondary" disabled={panel.blocked} onClick={() => { setRole(requiredRole); requestAnimationFrame(() => document.getElementById("task-title")?.focus()); }}>Representar a {roleLabels[requiredRole]}</ActionButton></div>}
          <OperationTask key={`${run.traceId}:${panel.draftRevision}`} run={run} role={role} blocked={panel.blocked} conflict={panel.conflict} reviewBlocked={panel.busy || panel.stale || panel.uncertain} reviewed={panel.acknowledgeConflict} submit={panel.command} />
        </section>
        <aside className="stack" aria-label="Contexto guardado del recorrido"><h2>El lote guardado</h2><h3>{run.scenario.material.label}</h3>
          {panel.stale && <p>Estos datos corresponden a la última lectura; actualizalos antes de otra acción.</p>}
          <dl className="facts"><div><dt>Cantidad declarada</dt><dd>{formatKg(run.operation.quantityKg)}</dd></div><div><dt>Humedad</dt><dd>{formatHumidity(run.operation.humidityPercent)}</dd></div><div><dt>Generador ficticio</dt><dd>{run.scenario.generator.name}</dd></div><div><dt>Comprador ficticio</dt><dd>{run.scenario.buyer.name}</dd></div>{run.operation.receivedKg !== null && <div><dt>Peso recibido, separado de la declaración</dt><dd>{formatKg(run.operation.receivedKg)}</dd></div>}</dl>
          <p>{run.scenario.route.label}</p>
          <details className={styles.detail}><summary>Ver economía ilustrativa</summary><dl className={styles.economics}>{([
            ["Material", run.economics.materialCost], ["Flete de retorno", run.economics.returnFreight], ["Coordinación supuesta", run.economics.jopoiFee], ["Total con retorno", run.economics.jopoiTotal], ["Alternativa dedicada", run.economics.alternativeTotal], ["Diferencia (alternativa menos retorno)", run.economics.difference],
          ] satisfies readonly (readonly [string, string])[]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatArs(value)}</dd></div>)}</dl><p>{run.economics.disclaimer} El peso recibido no sustituye la cantidad declarada para este cálculo.</p></details>
          <Evidence run={run} />
        </aside>
      </div>
      <section className="content-section stack" aria-labelledby="history-title"><h2 id="history-title">Historial y estado de red</h2><p>Guardar en SQL, confirmar el envío y contrastar el hash son estados distintos. Un pendiente de red no impide continuar la operación.</p>
        <p>Cupo global HCS: {run.quota.limit === null ? "configuración no disponible" : `${run.quota.used} de ${run.quota.limit} envíos usados; ${run.quota.remaining ?? "—"} disponibles`}. Se restablece a partir de {formatDate(run.quota.resetsAt)}.</p>
        <p>Las próximas fechas indican elegibilidad, no ejecución garantizada. Actualizá para consultar el estado; no hay seguimiento continuo desde esta página.</p>
        <details className={styles.detail}><summary>Ver {run.events.length} hitos y su publicación</summary>
        {run.events.length === 0 ? <Notice title="Todavía no hay hitos"><p>El borrador y la navegación no generan transacciones.</p></Notice> : <ol className={styles.history}>{run.events.map(({ event, publication }) => <li key={event.payload.eventId}>
          <h3>{eventLabels[event.payload.type]}</h3><p>{roleLabels[event.payload.role]} · Aplicado en SQL el {formatDate(event.payload.appliedAt)}</p>
          {event.payload.detail.reason && <p>Motivo: {event.payload.detail.reason.label}</p>}
          <div className={styles.networkStates}><PublicationStatus state={publication.state} /><VerificationStatus state={publication.verificationState} /></div>
          {publication.confirmedAt && <p>Confirmación de red registrada el {formatDate(publication.confirmedAt)}.</p>}
          {publication.consensusTimestamp && <p>Timestamp de consenso: <span className="identifier">{publication.consensusTimestamp}</span>.</p>}
          {publication.verifiedAt && <p>Contraste histórico del {formatDate(publication.verifiedAt)}; esta vista no consultó nuevamente el mirror.</p>}
          <p>Intentos automáticos: {publication.automaticAttempts} de 3. Adicional manual: {publication.manualAttempts} de 1{publication.manualAuthorized ? " (autorizado)" : ""}.</p>
          {publication.blockedBy && <p>Espera la confirmación de un hito anterior del historial.</p>}
          {publication.nextAttemptAt && <p>Próxima elegibilidad: {formatDate(publication.nextAttemptAt)}.</p>}
          {publication.state === "PAUSED_QUOTA" && <p>El cupo está agotado. La acción SQL sigue guardada; el envío espera recursos disponibles.</p>}
          {publication.state === "PAUSED_CONFIG" && <p>El envío está pausado por configuración. La acción SQL sigue guardada.</p>}
          {(publication.manualAvailable || publication.state === "UNCERTAIN" && !publication.blockedBy) && <div><ActionButton type="button" variant="secondary" disabled={panel.blocked} onClick={() => panel.retryPublication(event.payload.eventId)}>{publication.state === "UNCERTAIN" ? "Comprobar envío incierto" : "Autorizar intento adicional"}</ActionButton></div>}
          {publication.state === "FAILED" && publication.manualAttempts >= 1 && <p>Intentos de envío agotados. El cierre operativo permanece registrado.</p>}
        </li>)}</ol>}</details>
      </section>
      <section className="content-section stack" aria-labelledby="share-title"><h2 id="share-title">Consultar y compartir</h2><TraceShare key={run.traceId} traceId={run.traceId} expiresAt={run.expiresAt} publicOrigin={publicOrigin} /></section>
      <section className="content-section stack" aria-labelledby="reset-title"><h2 id="reset-title">Explorar otro resultado</h2><p>Crear otro recorrido consume una exploración. El anterior conserva su historial y su fecha de vencimiento. Los cambios locales sin guardar se perderán.</p>
        {panel.data && panel.data.session.remainingRuns > 0 ? confirmReset ? <Notice title="¿Crear otro recorrido?" announce><p>Quedan {panel.data.session.remainingRuns} exploraciones. Esta acción no reabre ni modifica el recorrido anterior.</p><div className="actions"><ActionButton type="button" disabled={panel.blocked} onClick={() => { setConfirmReset(false); panel.reset(); }}>Confirmar nuevo recorrido</ActionButton><ActionButton type="button" variant="secondary" disabled={panel.busy} onClick={() => setConfirmReset(false)}>Cancelar</ActionButton></div></Notice> : <div><ActionButton type="button" variant="secondary" disabled={panel.blocked} onClick={() => setConfirmReset(true)}>Nuevo recorrido</ActionButton></div> : <Notice title="Usaste las tres exploraciones"><p>Podés consultar los recorridos existentes. Recargar no renueva el cupo.</p></Notice>}
      </section>
    </>}
    {panel.links.filter(link => link.traceId !== run?.traceId).length > 0 && <section className="content-section stack"><h2>Consultas conservadas en esta visita</h2><p>Solo conservamos estos enlaces en memoria. Su consulta pública puede seguir disponible al vencer la sesión privada.</p><ul>{panel.links.filter(link => link.traceId !== run?.traceId).map(link => <li key={link.traceId}><a href={`/trazabilidad/${link.traceId}`}>Consultar recorrido <span className="identifier">{link.traceId}</span></a></li>)}</ul></section>}
    <div className="actions"><ActionButton type="button" variant="secondary" disabled={panel.busy} onClick={panel.refresh}>Actualizar lectura</ActionButton>{panel.error?.code === "NOT_FOUND" && <ActionButton type="button" variant="secondary" disabled={panel.busy} onClick={panel.recoverCurrent}>Consultar el recorrido actual</ActionButton>}</div>
  </div>;
}
function Evidence({ run }: { run: DemoRunDetail }) {
  const knownAssets = new Set(["/demo/chips-v1/chips-pile.jpg", "/demo/chips-v1/chips-texture.jpg", "/demo/chips-v1/pesaje-ejemplo.svg"]);
  return <details className={styles.detail}><summary>Ver evidencia ficticia de referencia</summary><p>No hace falta subir archivos ni documentos personales.</p>{run.scenario.assets.filter(asset => knownAssets.has(asset.localPath)).map(asset => <figure key={asset.id} className={styles.evidence}>
    <Image src={asset.localPath} alt={asset.alt} width={asset.width} height={asset.height} sizes="(max-width: 52rem) calc(100vw - 2rem), 24rem" unoptimized={asset.mediaType === "image/svg+xml"} />
    <figcaption><p>{asset.caption}</p>{asset.referenceQuantityKg && <p>Referencia estática de {formatKg(asset.referenceQuantityKg)}; no acredita la cantidad editada ni el peso recibido.</p>}<p>{asset.attribution}</p>
      {asset.sourceUrl && /^https:\/\/commons\.wikimedia\.org\//.test(asset.sourceUrl) && <a href={asset.sourceUrl}>Ver fuente de la fotografía</a>}{" "}
      {asset.licenseUrl && /^https:\/\/creativecommons\.org\//.test(asset.licenseUrl) && <a href={asset.licenseUrl}>Licencia {asset.license}</a>}
    </figcaption>
  </figure>)}</details>;
}
