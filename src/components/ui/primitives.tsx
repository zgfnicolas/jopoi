import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import Link from "next/link";
import styles from "./ui.module.css";

export function ActionButton({ busy = false, busyLabel = "Procesando…", children, secondary = false, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyLabel?: string; secondary?: boolean }) {
  return <button {...props} disabled={busy || props.disabled} aria-busy={busy || undefined}
    className={`${styles.button} ${secondary ? styles.secondary : ""}`}>{busy ? busyLabel : children}</button>;
}
export function ActionLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <Link href={href} prefetch={false} className={`${styles.button} ${secondary ? styles.secondary : ""}`}>{children}</Link>;
}
export function Field({ id, label, help, error, ...props }: ComponentProps<"input"> & { id: string; label: string; help?: string; error?: string }) {
  const description = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return <div className={styles.field}>
    <label className={styles.label} htmlFor={id}>{label}</label>
    <input {...props} id={id} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={description || undefined} />
    {help && <p id={`${id}-help`} className={styles.help}>{help}</p>}
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
  </div>;
}
export type FeedbackState = "idle" | "editing" | "saving" | "saved" | "field-error" | "conflict" | "session-expired" | "quota-exhausted" | "unavailable";
export function Notice({ title, children, tone = "info", announce = false }: { title: string; children?: ReactNode; tone?: "info" | "error"; announce?: boolean }) {
  return <div className={styles.notice} data-tone={tone} role={announce ? tone === "error" ? "alert" : "status" : undefined}>
    <strong>{title}</strong>{children}
  </div>;
}
/** Presentation only: controlled values and submission intents stay with their feature. */
export function FormFeedback({ state, children }: { state: FeedbackState; children?: ReactNode }) {
  if (state === "idle" || state === "editing") return null;
  const titles = { saving: "Guardando…", saved: "Los datos quedaron guardados", "field-error": "Revisá los campos indicados",
    conflict: "La información cambió", "session-expired": "La sesión venció", "quota-exhausted": "Se alcanzó el cupo", unavailable: "El servicio no está disponible" };
  return <Notice title={titles[state]} announce tone={state === "saving" || state === "saved" ? "info" : "error"}>{children}</Notice>;
}
