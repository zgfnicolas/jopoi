/** Preserve canonical precision, including values beyond Number.MAX_SAFE_INTEGER. */
export function formatDecimal(value: string): string {
  const match = /^(-?)(\d+)\.(\d+)$/.exec(value);
  if (!match) return "Dato no disponible";
  return `${match[1]}${new Intl.NumberFormat("es-AR").format(BigInt(match[2]))},${match[3]}`;
}
export const formatKg = (value: string) => `${formatDecimal(value)} kg`;
export const formatHumidity = (value: string) => `${formatDecimal(value)} %`;
export const formatArs = (value: string) => `ARS ${formatDecimal(value)}`;
export function formatDate(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "Fecha no disponible";
  return `${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value))} · UTC−03:00`;
}
