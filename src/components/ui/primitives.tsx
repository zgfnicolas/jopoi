import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import styles from "./ui.module.css";

type ActionStyle = { variant?: "primary" | "secondary" | "quiet"; size?: "default" | "large" };
function actionClass(variant: ActionStyle["variant"], size: ActionStyle["size"], className?: string) {
  return [styles.button, variant && styles[variant], size === "large" && styles.large, className].filter(Boolean).join(" ");
}
export function ActionButton({ busy = false, busyLabel = "Procesando…", children, variant = "primary", size = "default", className, ...props }:
  ComponentProps<"button"> & ActionStyle & { busy?: boolean; busyLabel?: string }) {
  return <button {...props} disabled={busy || props.disabled} aria-busy={busy || undefined}
    className={actionClass(variant, size, className)}>{busy ? busyLabel : children}</button>;
}
export function ActionLink({ children, variant = "primary", size = "default", className, ...props }: ComponentProps<typeof Link> & ActionStyle) {
  return <Link prefetch={false} {...props} className={actionClass(variant, size, className)}>{children}</Link>;
}
// En props de presentación, undefined significa que todavía no hay ayuda o error para mostrar.
type FieldDescription = { id: string; label: string; help?: string | undefined; error?: string | undefined };
function descriptions(id: string, help?: string, error?: string, existing?: string) {
  return [existing, help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}
function FieldNotes({ id, help, error }: Pick<FieldDescription, "id" | "help" | "error">) {
  return <>{help && <p id={`${id}-help`} className={styles.help}>{help}</p>}{error && <p id={`${id}-error`} className={styles.error}>{error}</p>}</>;
}
export function Field({ id, label, help, error, className, ...props }: ComponentProps<"input"> & FieldDescription) {
  return <div className={styles.field}>
    <label className={styles.label} htmlFor={id}>{label}</label>
    <input {...props} id={id} className={[styles.input, className].filter(Boolean).join(" ")} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptions(id, help, error, props["aria-describedby"])} />
    <FieldNotes id={id} help={help} error={error} />
  </div>;
}
export function TextAreaField({ id, label, help, error, className, ...props }: ComponentProps<"textarea"> & FieldDescription) {
  return <div className={styles.field}><label className={styles.label} htmlFor={id}>{label}</label>
    <textarea {...props} id={id} className={[styles.input, className].filter(Boolean).join(" ")} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptions(id, help, error, props["aria-describedby"])} />
    <FieldNotes id={id} help={help} error={error} />
  </div>;
}
export function SelectField({ id, label, help, error, className, children, ...props }: ComponentProps<"select"> & FieldDescription) {
  return <div className={styles.field}><label className={styles.label} htmlFor={id}>{label}</label>
    <select {...props} id={id} className={[styles.input, className].filter(Boolean).join(" ")} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptions(id, help, error, props["aria-describedby"])}>{children}</select>
    <FieldNotes id={id} help={help} error={error} />
  </div>;
}
export type FeedbackState = "idle" | "editing" | "saving" | "saved" | "field-error" | "conflict" | "session-expired" | "quota-exhausted" | "unavailable";
export function ErrorSummary({ errors, ...props }: ComponentProps<"div"> & { errors: Array<{ href: string; message: string }> }) {
  if (!errors.length) return null;
  return <div {...props} tabIndex={-1}><Notice title="Revisá los campos indicados" tone="error"><ul>{errors.map(error => <li key={error.href}><a href={error.href}>{error.message}</a></li>)}</ul></Notice></div>;
}
export function Notice({ title, children, tone = "info", announce = false }: { title: string; children?: ReactNode; tone?: "info" | "success" | "warning" | "error"; announce?: boolean }) {
  return <div className={styles.notice} data-tone={tone} role={announce ? tone === "error" ? "alert" : "status" : undefined}>
    <strong>{title}</strong>{children}
  </div>;
}
/** Presentation only: controlled values and submission intents stay with their feature. */
export function FormFeedback({ state, children }: { state: FeedbackState; children?: ReactNode }) {
  if (state === "idle" || state === "editing") return null;
  const titles = { saving: "Guardando…", saved: "Los datos quedaron guardados", "field-error": "Revisá los campos indicados",
    conflict: "La información cambió", "session-expired": "La sesión venció", "quota-exhausted": "Se alcanzó el cupo", unavailable: "El servicio no está disponible" };
  return <Notice title={titles[state]} announce tone={state === "saving" ? "info" : state === "saved" ? "success" : state === "quota-exhausted" || state === "conflict" || state === "session-expired" ? "warning" : "error"}>{children}</Notice>;
}
