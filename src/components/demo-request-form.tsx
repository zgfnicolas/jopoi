"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DEMO_REQUEST_LIMITS, type DemoRequestConfirmation } from "@/shared/contact-contracts";
import { demoRequestFieldErrors, demoRequestSchema } from "@/shared/demo-request-schema";
import { API_ERROR_CATALOG } from "@/shared/api-errors";
import { postDemoRequest, type ContactFailure } from "@/frontend/demo-request";
import { formatDate } from "@/frontend/format";
import { ActionButton, Field, Notice, TextAreaField } from "./ui/primitives";
import styles from "./demo-request-form.module.css";

const emptyDraft = { name: "", email: "", company: "", message: "" };
type Phase = "editing" | "sending" | "uncertain" | "conflict" | "expired" | "saved";
export function DemoRequestForm() {
  const [draft, setDraft] = useState(emptyDraft);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("editing");
  const [fields, setFields] = useState<Record<string, readonly string[]>>({});
  const [error, setError] = useState<ContactFailure | null>(null);
  const [saved, setSaved] = useState<DemoRequestConfirmation | null>(null);
  const intent = useRef<string | null>(null), busy = useRef(false), active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null), feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { active.current = true; setReady(true); return () => { active.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (phase !== "sending" && phase !== "editing") feedback.current?.focus(); }, [phase]);
  function focusField(name: string) {
    const element = form.current?.elements.namedItem(name);
    if (element instanceof HTMLElement) element.focus();
  }
  function focusInvalid(nextFields: Record<string, readonly string[]>) {
    const name = ["name", "email", "company", "message"].find(key => nextFields[key]?.length);
    if (name) requestAnimationFrame(() => focusField(name));
  }
  function newIntent(clear: boolean) {
    if (busy.current) return;
    intent.current = null; setSaved(null); setError(null); setFields({}); setPhase("editing");
    if (clear) setDraft(emptyDraft);
    requestAnimationFrame(() => focusField("name"));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || phase === "saved" || phase === "conflict" || phase === "expired") return;
    busy.current = true;
    let body = intent.current;
    if (body === null) {
      let requestId: string;
      try { requestId = crypto.randomUUID(); }
      catch { busy.current = false; setError({ code: "INVALID_RESPONSE", status: null, fields: {} }); return; }
      const parsed = demoRequestSchema.safeParse({ ...draft, requestId });
      if (!parsed.success) {
        const errors = demoRequestFieldErrors(parsed.error.issues);
        setFields(errors); setError(null); busy.current = false; focusInvalid(errors); return;
      }
      const normalized = parsed.data;
      body = JSON.stringify({ requestId: normalized.requestId, name: normalized.name, email: normalized.email, company: normalized.company,
        ...(normalized.message === null ? {} : { message: normalized.message }) });
      if (new TextEncoder().encode(body).byteLength > DEMO_REQUEST_LIMITS.bodyBytes) {
        setFields({ form: ["La solicitud es demasiado extensa. Acortá el mensaje y volvé a intentar."] }); busy.current = false; return;
      }
      intent.current = body;
      setDraft({ name: normalized.name, email: normalized.email, company: normalized.company, message: normalized.message ?? "" });
    }
    setFields({}); setError(null); setPhase("sending");
    const currentController = new AbortController(); controller.current = currentController;
    const result = await postDemoRequest(body, currentController.signal);
    if (!active.current || currentController.signal.aborted) return;
    busy.current = false; controller.current = null;
    if (result.ok) { intent.current = null; setSaved(result.confirmation); setDraft(emptyDraft); setPhase("saved"); return; }
    setError(result.error); setFields(result.error.fields);
    if ((result.error.status === 400 && result.error.code === "INVALID_INPUT") || (result.error.status === 403 && result.error.code === "REQUEST_FORBIDDEN")) {
      intent.current = null; setPhase("editing"); focusInvalid(result.error.fields);
    } else if (result.error.code === "DEMO_REQUEST_EXPIRED") setPhase("expired");
    else if (result.error.code === "IDEMPOTENCY_CONFLICT") setPhase("conflict");
    else setPhase("uncertain");
  }
  const knownMessage = error && error.code in API_ERROR_CATALOG ? API_ERROR_CATALOG[error.code as keyof typeof API_ERROR_CATALOG].message
    : "No recibimos una confirmación de guardado. Revisá tu conexión y reintentá esta misma solicitud.";
  return <div className={styles.wrapper}>
    {phase === "saved" && saved ? <div ref={feedback} tabIndex={-1} className="stack"><Notice title={saved.message} announce>
      <p>Guardada el {formatDate(saved.createdAt)}.</p><p>No se reservó un horario ni se envió un correo automático.</p>
    </Notice><div><ActionButton type="button" secondary onClick={() => newIntent(true)}>Enviar otra solicitud</ActionButton></div></div> :
      <form ref={form} method="post" action="/api/demo-requests" noValidate onSubmit={submit} className="stack" aria-busy={!ready || phase === "sending"}>
        <fieldset disabled={!ready || phase !== "editing"} className={styles.fields}><legend>Datos para conocer el prototipo</legend>
          <Field id="contact-name" name="name" label="Nombre" autoComplete="name" required maxLength={DEMO_REQUEST_LIMITS.name} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} error={fields.name?.[0]} />
          <Field id="contact-email" name="email" label="Email" type="email" inputMode="email" autoComplete="email" required maxLength={DEMO_REQUEST_LIMITS.email} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} help="No hace falta un dominio empresarial." error={fields.email?.[0]} />
          <Field id="contact-company" name="company" label="Empresa" autoComplete="organization" required maxLength={DEMO_REQUEST_LIMITS.company} value={draft.company} onChange={e => setDraft({ ...draft, company: e.target.value })} error={fields.company?.[0]} />
          <TextAreaField id="contact-message" name="message" label="Mensaje (opcional)" maxLength={DEMO_REQUEST_LIMITS.message} rows={4} value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} help="Podés contarnos qué te interesa conocer. Hasta 2.000 caracteres." error={fields.message?.[0]} />
        </fieldset>
        <p className={styles.privacy}>Usaremos estos datos para conocer tu interés en el prototipo. La solicitud vence a los 90 días y se elimina en la siguiente limpieza diaria exitosa. Lo escrito se conserva en esta página ante un error, pero se pierde al recargarla o cerrarla.</p>
        {fields.form && <Notice title="Revisá la solicitud" tone="error" announce><p>{fields.form[0]}</p></Notice>}
        {error && <div ref={feedback} tabIndex={-1}><Notice title={phase === "uncertain" ? "El guardado sigue sin confirmar" : phase === "expired" ? "La intención anterior venció" : phase === "conflict" ? "La clave corresponde a otra solicitud" : "No pudimos guardar la solicitud"} tone="error" announce>
          <p>{knownMessage}</p>{phase === "uncertain" && <p>Conservamos los datos y bloqueamos su edición para reintentar exactamente el mismo guardado. No crearemos una solicitud nueva.</p>}
          {phase === "conflict" && <p>Esta respuesta no confirma estos datos. Iniciar otra solicitud no modifica la que pueda existir y podría duplicar tu pedido.</p>}
          {error.diagnosticId && <p>Referencia: <span className="identifier">{error.diagnosticId}</span></p>}
        </Notice></div>}
        <div>{phase === "expired" || phase === "conflict" ? <ActionButton type="button" onClick={() => newIntent(false)}>Iniciar otra solicitud</ActionButton> :
          <ActionButton type="submit" disabled={!ready} busy={phase === "sending"} busyLabel="Guardando solicitud…">{phase === "uncertain" ? "Reintentar guardado" : "Solicitar conocer el prototipo"}</ActionButton>}</div>
      </form>}
  </div>;
}
