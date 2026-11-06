let token: string | undefined = undefined;

export function getCsrfToken(): string | undefined {
  return token;
}

export function setCsrfToken(value: string | undefined): void {
  token = value && value.trim().length > 0 ? value.trim() : undefined;
}

export function clearCsrfToken(): void {
  token = undefined;
}
