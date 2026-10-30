export function retryAfterSeconds(response: Response): number | undefined {
  const value=response.headers.get("retry-after");
  if(!value || !/^\d+$/.test(value))return undefined;
  const seconds=Number(value);
  return Number.isSafeInteger(seconds) && seconds>0 && seconds<=86400 ? seconds : undefined;
}
export function retryAfterMessage(seconds?:number):string {
  return seconds===undefined ? "" : ` Podés volver a intentar en ${seconds} segundos.`;
}
