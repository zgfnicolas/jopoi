import "server-only";
import { performance } from "node:perf_hooks";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApplicationError } from "../application-error";
import { bindBusinessTraceId, logDiagnostic } from "../diagnostics";
import { RateLimitError, requireRateLimit } from "../security/rate-limit";
import { publicTraceReader } from "./queries";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface SafePageOptions {
  status: 404 | 410 | 429 | 503;
  code: string;
  problemType: string;
  title: string;
  heading: string;
  message: string;
  detail?: string;
  actionLabel?: string;
  actionHref?: string;
  retryAfter?: number;
}

export function renderSafePageResponse(request: Request, options: SafePageOptions): Response {
  const accept = request.headers.get("accept") ?? "";
  const wantsJson =
    accept.includes("application/problem+json") ||
    (accept.includes("application/json") && !accept.includes("text/html"));

  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Accept");
  headers.set("X-Content-Type-Options", "nosniff");
  if (options.retryAfter) {
    headers.set("Retry-After", String(options.retryAfter));
  }

  if (wantsJson) {
    headers.set("Content-Type", "application/problem+json; charset=utf-8");
    return new Response(
      JSON.stringify({
        type: `https://jopoi.invalid/probs/${options.problemType}`,
        title: options.title,
        status: options.status,
        detail: options.message,
        code: options.code,
      }),
      {
        status: options.status,
        headers,
      },
    );
  }

  headers.set("Content-Type", "text/html; charset=utf-8");
  const html = `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(options.title)} · Jopói</title>
  <style>
    :root {
      color-scheme: light;
      --surface: #fafbf8; --panel: #ffffff; --subtle: #edf1eb; --ink: #192e2e; --muted: #526462;
      --line: #c8d2ca; --control-border: #6b7e76; --action: #145b58; --action-hover: #0c403e; --on-action: #ffffff;
      --space-3: .75rem; --space-4: 1rem; --space-5: 1.25rem; --space-6: 1.5rem; --space-8: 2rem;
      --content: 72rem;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --surface: #111c1b; --panel: #182826; --subtle: #203531; --ink: #edf4ef; --muted: #b6c7bf;
        --line: #3a5149; --control-border: #7f9d91; --action: #81d1bd; --action-hover: #a0e0d0; --on-action: #101f1c;
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--surface); color: var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 1rem; line-height: 1.6; }
    a { color: var(--action); text-underline-offset: .2em; text-decoration: underline; }
    header { border-bottom: 1px solid var(--line); }
    .header-content { max-width: var(--content); padding: var(--space-5) var(--space-6); margin: auto; display: flex; align-items: center; justify-content: space-between; }
    .wordmark { font-weight: 600; font-size: 2rem; color: var(--ink); text-decoration: none; }
    main { width: min(var(--content), calc(100% - 3rem)); margin: 0 auto; padding: var(--space-8) 0; min-height: 60vh; }
    .stack { display: flex; flex-direction: column; gap: var(--space-5); }
    h1 { font-size: 2rem; margin: 0; }
    p { max-width: 72ch; margin: 0; }
    .muted { color: var(--muted); }
    .action-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0 var(--space-6); background: var(--action); color: var(--on-action); text-decoration: none; border-radius: .25rem; font-weight: 600; }
    footer { border-top: 1px solid var(--line); padding: var(--space-6) 0; text-align: center; font-size: .875rem; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <a class="wordmark" href="/">Jopói</a>
    </div>
  </header>
  <main id="contenido">
    <div class="stack">
      <h1>${escapeHtml(options.heading)}</h1>
      <p>${escapeHtml(options.message)}</p>
      ${options.detail ? `<p class="muted">${escapeHtml(options.detail)}</p>` : ""}
      ${options.actionHref && options.actionLabel ? `<div><a class="action-btn" href="${escapeHtml(options.actionHref)}">${escapeHtml(options.actionLabel)}</a></div>` : ""}
    </div>
  </main>
  <footer>
    <p>Jopói es una demostración. Los registros no certifican una carga física ni resultados comerciales.</p>
  </footer>
</body>
</html>`;

  return new Response(html, {
    status: options.status,
    headers,
  });
}

export async function handleTraceProxyRequest(request: NextRequest): Promise<NextResponse | Response> {
  const startedAt = performance.now();
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/trazabilidad")) {
    return NextResponse.next();
  }

  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length !== 2) {
    return renderSafePageResponse(request, {
      status: 404,
      code: "NOT_FOUND",
      problemType: "not-found",
      title: "El enlace no está disponible",
      heading: "El enlace no está disponible",
      message: "Revisá la dirección. Si querés consultar trazabilidad, necesitás un identificador UUID válido.",
      actionLabel: "Consultar otro recorrido",
      actionHref: "/#consultar-trazabilidad",
    });
  }

  const rawTraceId = segments[1];
  const parsed = z.uuid().safeParse(rawTraceId);
  if (!parsed.success) {
    return renderSafePageResponse(request, {
      status: 404,
      code: "NOT_FOUND",
      problemType: "not-found",
      title: "El enlace no está disponible",
      heading: "El enlace no está disponible",
      message: "Revisá la dirección. Si querés consultar trazabilidad, necesitás un identificador UUID válido.",
      actionLabel: "Consultar otro recorrido",
      actionHref: "/#consultar-trazabilidad",
    });
  }

  const traceId = parsed.data.toLowerCase();
  bindBusinessTraceId(traceId);

  try {
    await requireRateLimit(request, "TRACE");
    const trace = await publicTraceReader().getTrace(traceId);
    const requestHeaders = new Headers(request.headers);
    const serialized = JSON.stringify(trace);
    if (serialized.length < 8000) {
      requestHeaders.set("x-jopoi-trace-payload", Buffer.from(serialized).toString("base64"));
    }
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError || (error instanceof ApplicationError && error.code === "RATE_LIMITED")) {
      const retryAfter = error instanceof RateLimitError ? error.retryAfter : (error.retryAfterSeconds ?? 60);
      return renderSafePageResponse(request, {
        status: 429,
        code: "RATE_LIMITED",
        problemType: "rate-limited",
        title: "Límite de consultas superado",
        heading: "Límite de consultas superado",
        message: "Alcanzaste el límite de consultas públicas por minuto. Podés reintentar en unos instantes.",
        retryAfter,
        actionLabel: "Ir al inicio",
        actionHref: "/",
      });
    }

    if (error instanceof ApplicationError && error.code === "TRACE_EXPIRED") {
      return renderSafePageResponse(request, {
        status: 410,
        code: "TRACE_EXPIRED",
        problemType: "trace-expired",
        title: "Recorrido vencido",
        heading: "Este recorrido ya no está disponible",
        message:
          "Este recorrido de demostración superó su período de retención y expiró. La consulta pública ya no está disponible.",
        actionLabel: "Consultar otro recorrido",
        actionHref: "/#consultar-trazabilidad",
      });
    }

    if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
      return renderSafePageResponse(request, {
        status: 404,
        code: "NOT_FOUND",
        problemType: "not-found",
        title: "Recorrido no encontrado",
        heading: "Recorrido no encontrado",
        message: "No encontramos un recorrido para este identificador. Verificá el enlace o consultá otro recorrido.",
        actionLabel: "Consultar otro recorrido",
        actionHref: "/#consultar-trazabilidad",
      });
    }

    logDiagnostic({
      event: "http.completed",
      outcome: "error",
      severity: "ERROR",
      code: "DATABASE_UNAVAILABLE",
      durationMs: Math.max(0, performance.now() - startedAt),
    });

    return renderSafePageResponse(request, {
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      problemType: "service-unavailable",
      title: "Servicio no disponible",
      heading: "Servicio no disponible",
      message:
        "El servicio de trazabilidad no está disponible en este momento. Por favor intentá nuevamente más tarde.",
      actionLabel: "Ir al inicio",
      actionHref: "/",
    });
  }
}
