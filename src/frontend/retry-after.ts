export function retryAfterSeconds(response: Response, now = Date.now()): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  let seconds: number;
  if (/^\d+$/.test(value)) seconds = Number(value);
  else {
    // Aceptá IMF-fixdate sin normalizar fechas inválidas; Date del servidor evita depender del reloj del visitante.
    const at = Date.parse(value);
    if (!Number.isFinite(at) || new Date(at).toUTCString() !== value) return undefined;
    const serverDate = Date.parse(response.headers.get("date") ?? "");
    seconds = Math.max(0, Math.ceil((at - (Number.isFinite(serverDate) ? serverDate : now)) / 1000));
  }
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : undefined;
}
export function retryAfterMessage(seconds?:number):string {
  return seconds===undefined ? "" : ` Podés volver a intentar en ${seconds} segundos.`;
}
