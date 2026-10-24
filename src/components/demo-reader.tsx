"use client";
import { useReadResource } from "@/frontend/use-read-resource";
import { demoExpiry, demoViewSchema } from "@/frontend/read-models";
import { formatDate, formatHumidity, formatKg } from "@/frontend/format";
import { ActionButton, ActionLink, Notice } from "./ui/primitives";
import { OperationalStatus } from "./ui/status";
import { ReadErrorView } from "./read-error";
export function DemoReader() {
  const { resource, refresh } = useReadResource("/api/demo/runs/current", demoViewSchema, demoExpiry, "SESSION_EXPIRED");
  if (resource.status === "loading") return <Notice title="Recuperando tu recorrido…" announce><p>Esta lectura no crea una sesión ni consume una exploración.</p></Notice>;
  if (resource.status === "error") return <ReadErrorView error={resource.error} refresh={refresh} />;
  const { session, run } = resource.data;
  return <div className="stack">
    <Notice title={session.remainingRuns === 0 ? "Cupo de recorridos alcanzado" : "Sesión recuperada"} announce>
      <p>Recorridos usados: {session.runCount}. Disponibles: {session.remainingRuns}.</p><p>Sesión vigente hasta {formatDate(session.expiresAt)}.</p>
    </Notice>
    {run === null ? <Notice title="No hay un recorrido activo"><p>La sesión existe, pero no tiene un recorrido disponible para recuperar.</p></Notice> : <section className="stack" aria-labelledby="lot-heading">
      <h2 id="lot-heading">{run.scenario.material.label}</h2><OperationalStatus state={run.operation.state} />
      <dl className="facts"><div><dt>Cantidad declarada</dt><dd>{formatKg(run.operation.quantityKg)}</dd></div><div><dt>Humedad</dt><dd>{formatHumidity(run.operation.humidityPercent)}</dd></div><div><dt>Datos disponibles hasta</dt><dd>{formatDate(run.expiresAt)}</dd></div></dl>
      <div><ActionLink href={`/trazabilidad/${run.traceId}`}>Abrir consulta pública</ActionLink></div>
    </section>}
    <div><ActionButton onClick={refresh} secondary>Actualizar lectura</ActionButton></div>
  </div>;
}
