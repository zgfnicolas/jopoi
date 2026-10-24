import { Check, Clock3, CircleAlert } from "lucide-react";
import type { OperationState } from "@/shared/operation-contracts";
import type { PublicationSummary } from "@/shared/event-contracts";
import styles from "./ui.module.css";

const operations: Record<OperationState, string> = { DRAFT: "Borrador", PUBLISHED: "Lote publicado", APPROVED: "Lote aprobado", ASSIGNED: "Transporte asignado", PICKED_UP: "Retiro confirmado", RECEIVED: "Recepción conforme", REJECTED: "Lote rechazado", INCIDENT: "Incidencia de recepción" };
const publications: Record<PublicationSummary["state"], string> = { QUEUED: "Pendiente de envío", IN_FLIGHT: "Envío en curso", UNCERTAIN: "Resultado de red incierto", CONFIRMED: "Confirmado en testnet", FAILED: "Envío con error", PAUSED_QUOTA: "Envío pausado por cupo", PAUSED_CONFIG: "Envío pausado por configuración" };
const verifications: Record<PublicationSummary["verificationState"], string> = { NOT_CHECKED: "Sin contraste remoto", PENDING: "Contraste remoto pendiente", MATCHED: "Hash remoto coincidente", MISMATCH: "Discrepancia remota", UNAVAILABLE: "Contraste remoto no disponible" };
function Status({ text, kind }: { text: string; kind: "neutral" | "confirmed" | "warning" }) {
  const Icon = kind === "warning" ? CircleAlert : kind === "confirmed" ? Check : Clock3;
  return <span className={styles.status}><Icon size={18} strokeWidth={1.8} aria-hidden="true" />{text}</span>;
}
export const OperationalStatus = ({ state }: { state: OperationState }) => <Status text={operations[state]} kind={state === "INCIDENT" || state === "REJECTED" ? "warning" : "neutral"} />;
export const PublicationStatus = ({ state }: { state: PublicationSummary["state"] }) => <Status text={publications[state]} kind={state === "CONFIRMED" ? "confirmed" : ["FAILED", "PAUSED_QUOTA", "PAUSED_CONFIG", "UNCERTAIN"].includes(state) ? "warning" : "neutral"} />;
export const VerificationStatus = ({ state }: { state: PublicationSummary["verificationState"] }) => <Status text={verifications[state]} kind={state === "MATCHED" ? "confirmed" : state === "MISMATCH" ? "warning" : "neutral"} />;
export const IntegrityStatus = ({ state }: { state: "MATCHED" | "MISMATCH" }) => <Status text={state === "MATCHED" ? "Detalle íntegro en la aplicación" : "Discrepancia en el detalle local"} kind={state === "MATCHED" ? "neutral" : "warning"} />;
