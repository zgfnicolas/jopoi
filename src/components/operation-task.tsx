"use client";
import { useEffect, useState, type FormEvent } from "react";
import { decideOperation, normalizeOperationCommand } from "@/domain/operations";
import type { DemoRunDetail } from "@/shared/run-contracts";
import type { OperationAction, OperationCommand, OperationState, SimulatedRole } from "@/shared/operation-contracts";
import { formatHumidity, formatKg } from "@/frontend/format";
import { ActionButton, Field, Notice, SelectField } from "./ui/primitives";
import styles from "./operation-panel.module.css";

export const roleLabels: Record<SimulatedRole, string> = { generator: "Generador", coordinator: "Coordinador Jopói", carrier: "Transportista", buyer: "Comprador" };
export const nextRoles: Readonly<Record<OperationState, SimulatedRole | null>> = {
  DRAFT: "generator", PUBLISHED: "coordinator", APPROVED: "coordinator", ASSIGNED: "carrier", PICKED_UP: "buyer",
  RECEIVED: null, REJECTED: null, INCIDENT: null,
};
const separator = (value: string) => value.replace(",", ".");
function decimalInput(value: string) { return /^\d+(?:[.,]\d+)?$/.test(value) ? separator(value) : value; }
function pickupTime(minute: number) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }

export function OperationTask({ run, role, blocked, conflict, reviewBlocked, reviewed, submit }: { run: DemoRunDetail; role: SimulatedRole; blocked: boolean; reviewBlocked: boolean;
  conflict: boolean; reviewed: () => void; submit: (command: OperationCommand) => void }) {
  const [quantity, setQuantity] = useState(run.operation.quantityKg), [humidity, setHumidity] = useState(run.operation.humidityPercent);
  const [received, setReceived] = useState("");
  const [reason, setReason] = useState("");
  const [base, setBase] = useState({ version: run.version, quantity: run.operation.quantityKg, humidity: run.operation.humidityPercent });
  const [errors, setErrors] = useState<Record<string, readonly string[]>>({});
  const changed = decimalInput(quantity) !== base.quantity || decimalInput(humidity) !== base.humidity || received !== "" || reason !== "";
  const outdated = base.version !== run.version;
  useEffect(() => {
    if (!changed && outdated) { setQuantity(run.operation.quantityKg); setHumidity(run.operation.humidityPercent); setBase({ version: run.version, quantity: run.operation.quantityKg, humidity: run.operation.humidityPercent }); }
  }, [changed, outdated, run.version, run.operation.quantityKg, run.operation.humidityPercent]);
  const needsReview = conflict || outdated && changed;
  const disabled = blocked || needsReview;
  function choose(action: OperationAction, extra?: { tripId: string }) {
    let command: OperationCommand;
    if (action === "save" || action === "publish") command = { action, role, quantityKg: decimalInput(quantity), humidityPercent: decimalInput(humidity) };
    else if (action === "receive") command = { action, role, receivedKg: decimalInput(received) };
    else if (action === "incident") command = { action, role, receivedKg: decimalInput(received), reasonCode: reason };
    else if (action === "reject") command = { action, role, reasonCode: reason };
    else if (action === "assign") command = { action, role, tripId: extra?.tripId ?? "" };
    else command = { action, role };
    return command;
  }
  function decision(command: OperationCommand) { return decideOperation(run.operation, command, run.scenario); }
  function send(action: OperationAction, extra?: { tripId: string }) {
    if (disabled) return;
    const input = choose(action, extra), result = decision(input);
    if (!result.ok) {
      setErrors(result.error.fields);
      const name = ["quantityKg", "humidityPercent", "receivedKg", "reasonCode"].find(key => result.error.fields[key]);
      requestAnimationFrame(() => { (name ? document.getElementById(`operation-${name}`) ?? document.getElementById("task-errors") : document.getElementById("task-errors"))?.focus(); });
      return;
    }
    const normalized = normalizeOperationCommand(input, run.scenario);
    if (normalized.ok) { setErrors({}); submit(normalized.value); }
  }
  function resolve(keep: boolean) {
    if (!keep) { setQuantity(run.operation.quantityKg); setHumidity(run.operation.humidityPercent); setReceived(""); setReason(""); }
    setBase({ version: run.version, quantity: run.operation.quantityKg, humidity: run.operation.humidityPercent }); setErrors({}); reviewed();
  }
  const state = run.operation.state;
  const requiredRole = nextRoles[state];
  const approval = decision({ role: "coordinator", action: "approve" });
  const reception = decision({ role: "buyer", action: "receive", receivedKg: decimalInput(received) });
  function formSubmit(event: FormEvent) { event.preventDefault(); if (state === "DRAFT" && role === "generator") send("publish"); }
  const terminalReason = [...run.scenario.rejectionReasons, ...run.scenario.incidentReasons].find(item => item.code === (run.operation.rejectionReasonCode ?? run.operation.incidentReasonCode));
  return <div className="stack">
    {needsReview && <Notice title="Revisá los datos actualizados" announce><p>Conservamos tu edición. El estado guardado se muestra en el resumen; ninguna corrección se enviará automáticamente.</p><div className="actions">
      <ActionButton type="button" disabled={reviewBlocked} onClick={() => resolve(false)}>Usar datos guardados</ActionButton>
      {state === "DRAFT" && <ActionButton type="button" variant="secondary" disabled={reviewBlocked} onClick={() => resolve(true)}>Conservar edición para volver a enviar</ActionButton>}
    </div></Notice>}
    {requiredRole === null ? <Notice title={state === "RECEIVED" ? "Recorrido cerrado con recepción conforme" : state === "REJECTED" ? "Recorrido cerrado por rechazo" : "Recorrido cerrado con incidencia"}>
      {terminalReason && <p>{terminalReason.label}</p>}<p>Este recorrido no se puede editar ni reabrir. Podés consultar su historial o explorar otro resultado dentro del cupo.</p>
    </Notice> : <>
      <h3>{state === "DRAFT" ? "Declarar el lote" : state === "PUBLISHED" ? "Revisar el lote" : state === "APPROVED" ? "Asignar un viaje" : state === "ASSIGNED" ? "Confirmar el retiro" : "Registrar la recepción"}</h3>
      {role !== requiredRole && <p>Esta tarea corresponde a {roleLabels[requiredRole]}. Elegí ese rol para actuar; tu selección actual solo permite consultar esta etapa.</p>}
      <form method="post" action={`/api/demo/runs/${run.traceId}/commands`} noValidate onSubmit={formSubmit} className="stack">
        <fieldset disabled={disabled || role !== requiredRole} className={styles.fields}>
          <legend className={styles.legend}>Acciones de {roleLabels[requiredRole]} · rol simulado</legend>
          {state === "DRAFT" && <>
            <Field id="operation-quantityKg" name="quantityKg" label="Cantidad declarada (kg)" inputMode="decimal" autoComplete="off" value={quantity} maxLength={24} onChange={e => setQuantity(e.target.value)} error={errors.quantityKg?.[0]} help="Sin separadores de miles. Por ejemplo: 12000,125 o 12000.125. Hasta tres decimales." />
            <Field id="operation-humidityPercent" name="humidityPercent" label="Humedad (%)" inputMode="decimal" autoComplete="off" value={humidity} maxLength={8} onChange={e => setHumidity(e.target.value)} error={errors.humidityPercent?.[0]} help="De 0 a 100; hasta dos decimales, con coma o punto." />
            <p className="muted">{changed ? "Cambios sin guardar. Publicar guarda los valores visibles y declara el lote." : "Valores del último guardado."} Guardar borrador no envía mensajes a Hedera. Al salir o recargar se pierde la edición local y se recupera lo guardado.</p>
            <div className="actions"><ActionButton type="submit">Publicar lote</ActionButton><ActionButton type="button" variant="secondary" onClick={() => send("save")}>Guardar borrador</ActionButton></div>
          </>}
          {state === "PUBLISHED" && <>
            <p>{run.scenario.buyer.name} admite hasta {formatHumidity(run.scenario.buyer.maximumHumidityPercent)} de humedad y el material {run.scenario.material.label}.</p>
            {!approval.ok && <p id="approval-reason">{Object.values(approval.error.fields).flat().join(" ")}</p>}
            <div><ActionButton type="button" disabled={!approval.ok} aria-describedby={!approval.ok ? "approval-reason" : undefined} onClick={() => send("approve")}>Aprobar lote</ActionButton></div>
            <ReasonSelect reasons={run.scenario.rejectionReasons} value={reason} change={setReason} error={errors.reasonCode?.[0]} />
            <div><ActionButton type="button" variant="secondary" onClick={() => send("reject")}>Rechazar lote y cerrar recorrido</ActionButton></div>
          </>}
          {state === "APPROVED" && <>
            <p>El viaje debe cumplir material, capacidad, carrocería, ruta y ventana de retiro.</p>
            {run.compatibility.every(trip => !trip.isCompatible) && <Notice title="No hay un viaje compatible"><p>Revisá las condiciones incumplidas y la cantidad declarada: {formatKg(run.operation.quantityKg)}. El lote ya publicado no se puede editar; podés explorar otro recorrido con una cantidad diferente.</p></Notice>}
            {run.scenario.trips.map(trip => {
              const match = run.compatibility.find(item => item.tripId === trip.id);
              return <div key={trip.id} className={styles.trip}><h4>{trip.label}</h4><p>{trip.carrier.name} · Capacidad disponible: {formatKg(trip.availableCapacityKg)}</p>
                <p>{trip.bodyType === "BULK_TIPPER" ? "Volcadora para granel" : "Furgón cerrado"} · Día ilustrativo {trip.pickupWindow.dayOffset + 1}, {pickupTime(trip.pickupWindow.startMinute)}–{pickupTime(trip.pickupWindow.endMinute)} (UTC−03:00)</p>
                <ul id={`checks-${trip.id}`}>{match?.checks.map(check => <li key={check.code}><strong>{check.isCompatible ? "Cumple" : "No cumple"}:</strong> {check.message}</li>)}</ul>
                <ActionButton type="button" disabled={!match?.isCompatible} aria-describedby={`checks-${trip.id}`} onClick={() => send("assign", { tripId: trip.id })}>Asignar {trip.label}</ActionButton>
              </div>;
            })}
          </>}
          {state === "ASSIGNED" && <><p>Viaje: {run.scenario.trips.find(trip => trip.id === run.operation.assignedTripId)?.label}. Confirmá el retiro de {formatKg(run.operation.quantityKg)}.</p><p>Esta es una acción separada de consultar un QR o abrir el historial.</p><div><ActionButton type="button" onClick={() => send("pickup")}>Confirmar retiro</ActionButton></div></>}
          {state === "PICKED_UP" && <>
            <p>Declarado: {formatKg(run.operation.quantityKg)}. Tolerancia de peso cero: simplificación de esta demo, no estándar industrial.</p>
            <Field id="operation-receivedKg" name="receivedKg" label="Peso recibido (kg)" inputMode="decimal" autoComplete="off" maxLength={24} value={received} onChange={e => setReceived(e.target.value)} error={errors.receivedKg?.[0]} help="Ingresá un peso positivo con hasta tres decimales. Una diferencia requiere incidencia y conserva el peso declarado." />
            {!reception.ok && received !== "" && <p id="reception-reason">{Object.values(reception.error.fields).flat().join(" ")}</p>}
            <div><ActionButton type="button" disabled={!reception.ok} aria-describedby={!reception.ok && received !== "" ? "reception-reason" : undefined} onClick={() => send("receive")}>Confirmar recepción conforme</ActionButton></div>
            <ReasonSelect reasons={run.scenario.incidentReasons} value={reason} change={setReason} error={errors.reasonCode?.[0]} />
            <div><ActionButton type="button" variant="secondary" onClick={() => send("incident")}>Registrar incidencia y cerrar recorrido</ActionButton></div>
          </>}
        </fieldset>
      </form>
    </>}
    {Object.keys(errors).length > 0 && <div id="task-errors" tabIndex={-1}><Notice title="Revisá la acción" tone="error" announce>{Object.entries(errors).map(([key, value]) => <p key={key}>{value.join(" ")}</p>)}</Notice></div>}
  </div>;
}
function ReasonSelect({ reasons, value, change, error }: { reasons: readonly { code: string; label: string }[]; value: string; change: (value: string) => void; error: string | undefined }) {
  return <SelectField label="Motivo de ejemplo" id="operation-reasonCode" name="reasonCode" value={value} onChange={e => change(e.target.value)} error={error}>
    <option value="">Elegí un motivo</option>{reasons.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</SelectField>;
}
