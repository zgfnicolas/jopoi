/** Replaced only by the sealed, owned development test harness. */
export function clientIdentity(request: Request): string {
  return request.headers.get("x-s21-visitor")?.slice(0, 80) ?? "local-shared";
}
