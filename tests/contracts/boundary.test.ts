import assert from "node:assert/strict";
import { test } from "node:test";
import { apiBoundary, readJsonBody, requireBrowserMutation } from "../../src/server/http";
import { ApplicationError } from "../../src/server/application-error";
import { DEFAULT_DEADLINE_POLICY, mirrorVerificationBudgetMs, raceWithReadAbort, sqlStepBudget } from "../../src/server/deadlines";
import { csrfToken, csrfTokenMatches, HOST_SESSION_COOKIE, newSessionToken, SESSION_COOKIE, sessionCookiePolicy } from "../../src/server/sessions/credentials";
import { isSessionActive } from "../../src/server/sessions/service";
import { computeOperationEtag, computeRunEtag, computeTraceEtag, matchesIfMatch, matchesIfNoneMatch } from "../../src/server/operations/etag";
import type { OperationResource } from "../../src/shared/run-contracts";
import { PROBLEM_MEDIA_TYPE, problemDetailsSchema } from "../../src/shared/problem-details";
import { buildContentSecurityPolicy, getSecurityHeaders, THEME_BOOTSTRAP_HASH, STATIC_SCRIPT_HASHES } from "../../src/server/security/headers";
import { renderSafePageResponse } from "../../src/server/traces/page-boundary";
import { publicTraceEventSelect, publicVerificationEventSelect, publicTracePublicationSelect, publicVerificationPublicationSelect } from "../../src/server/traces/projection";
import { publicationSummarySelect } from "../../src/server/hedera/summary";

test("S22-12: boundary conserva privacidad, referencias y Retry-After conocido de 503", async () => {
  const response = await apiBoundary("contacts.create", new Request("https://example.invalid/api/demo-requests", { headers: { Accept: PROBLEM_MEDIA_TYPE } }), async () => {
    throw new ApplicationError("DATABASE_UNAVAILABLE", { email: ["PRIVATE email SQL"], PRIVATE: ["PRIVATE"] }, { cause: new Error("PRIVATE"), retryAfterSeconds: 20 });
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "20");
  assert.equal(response.headers.get("content-type"), PROBLEM_MEDIA_TYPE);
  const body: unknown = await response.json();
  const parsed = problemDetailsSchema.parse(body);
  assert.equal(parsed.requestId, response.headers.get("x-request-id"));
  assert.equal(parsed.fields, undefined);
  assert.ok(!JSON.stringify(body).includes("PRIVATE"));
});

test("S22-13: readJsonBody acota bytes sin Content-Length o con Content-Length falso y cancela el stream", async () => {
  for (const headers of [{ "Content-Type": "application/json" }, { "Content-Type": "application/json", "Content-Length": "2" }] as const) {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(3000))); },
      cancel() { canceled = true; },
    });
    const request = new Request("https://example.invalid/api/demo/runs", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit);
    await assert.rejects(() => readJsonBody(request, 4096), (error: unknown) => error instanceof ApplicationError && error.code === "INVALID_INPUT");
    assert.equal(canceled, true);
  }
});

test("S22-13: readJsonBody corta cuerpos lentos o abortados y libera el lector del stream", async () => {
  let slowCanceled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slowStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"requestId":'));
      timer = setTimeout(() => controller.enqueue(new TextEncoder().encode('"00000000-0000-4000-8000-000000000001"}')), 500);
    },
    cancel() {
      slowCanceled = true;
      if (timer) clearTimeout(timer);
    },
  });
  const slowRequest = new Request("https://example.invalid/api/demo/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: slowStream, duplex: "half" } as RequestInit);
  const started = Date.now();
  await assert.rejects(() => readJsonBody(slowRequest, 4096, 40), (error: unknown) => error instanceof ApplicationError && error.code === "INVALID_INPUT");
  assert.ok(Date.now() - started < 250);
  assert.equal(slowCanceled, true);

  let abortedCanceled = false;
  const abortController = new AbortController();
  const abortStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"requestId":'));
      setTimeout(() => abortController.abort(), 15);
    },
    cancel() { abortedCanceled = true; },
  });
  const abortedRequest = new Request("https://example.invalid/api/demo/runs", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: abortStream, signal: abortController.signal, duplex: "half",
  } as RequestInit);
  await assert.rejects(() => readJsonBody(abortedRequest, 4096, 1000), (error: unknown) => error instanceof ApplicationError && error.code === "INVALID_INPUT");
  assert.equal(abortedCanceled, true);
});

test("S22-13: presupuestos por paso SQL y Mirror Node respetan el deadline total del request", async () => {
  assert.ok(DEFAULT_DEADLINE_POLICY.sqlMaxWaitMs + DEFAULT_DEADLINE_POLICY.sqlTimeoutMs < DEFAULT_DEADLINE_POLICY.readDeadlineMs);
  assert.ok(DEFAULT_DEADLINE_POLICY.mirrorTotalTimeoutMs + DEFAULT_DEADLINE_POLICY.verificationClosingReserveMs < DEFAULT_DEADLINE_POLICY.verificationDeadlineMs);
  assert.equal(DEFAULT_DEADLINE_POLICY.verificationDeadlineMs, 10000);

  const ample = sqlStepBudget(DEFAULT_DEADLINE_POLICY, 8000);
  assert.equal(ample.maxWait, 2000);
  assert.equal(ample.timeout, 5000);

  const tight = sqlStepBudget(DEFAULT_DEADLINE_POLICY, 900);
  assert.ok(tight.maxWait + tight.timeout <= 900);
  assert.throws(() => sqlStepBudget(DEFAULT_DEADLINE_POLICY, 10), (error: unknown) => error instanceof ApplicationError && error.code === "DATABASE_UNAVAILABLE");

  assert.equal(mirrorVerificationBudgetMs(DEFAULT_DEADLINE_POLICY, 9500), 6000);
  assert.equal(mirrorVerificationBudgetMs(DEFAULT_DEADLINE_POLICY, 2200), 700);
  assert.equal(mirrorVerificationBudgetMs(DEFAULT_DEADLINE_POLICY, 1200), 0);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15);
  await assert.rejects(
    () => raceWithReadAbort(() => new Promise(resolve => setTimeout(resolve, 300)), controller.signal),
    (error: unknown) => error instanceof ApplicationError && error.code === "DATABASE_UNAVAILABLE",
  );
});

test("S22-16: sessionCookiePolicy distingue HTTPS (__Host-, Secure, sin Domain) y HTTP local", () => {
  const httpsPolicy = sessionCookiePolicy(true);
  assert.equal(httpsPolicy.name, HOST_SESSION_COOKIE);
  assert.equal(httpsPolicy.secure, true);
  assert.equal(httpsPolicy.httpOnly, true);
  assert.equal(httpsPolicy.sameSite, "lax");
  assert.equal(httpsPolicy.path, "/");
  assert.equal("domain" in httpsPolicy, false);

  const httpPolicy = sessionCookiePolicy(false);
  assert.equal(httpPolicy.name, SESSION_COOKIE);
  assert.equal(httpPolicy.secure, false);
  assert.equal(httpPolicy.httpOnly, true);
  assert.equal(httpPolicy.sameSite, "lax");
  assert.equal(httpPolicy.path, "/");
});

test("S22-16 / S22-18: csrfToken vincula la sesión, no expone la credencial y compara en tiempo constante", () => {
  process.env.SESSION_SECRET = "b".repeat(64);
  const token = newSessionToken();
  const csrf = csrfToken(token);
  assert.ok(csrf);
  assert.notEqual(csrf, token);
  assert.equal(csrfTokenMatches(csrf, csrf), true);
  assert.equal(csrfTokenMatches(csrf, "wrong-token"), false);
  assert.equal(csrfTokenMatches(undefined, csrf), false);
  assert.equal(csrfTokenMatches(csrf, undefined), false);
  assert.equal(csrfTokenMatches("", csrf), false);
  assert.equal(csrfToken(undefined), undefined);
  assert.equal(csrfToken("short"), undefined);
});

test("S22-16 / S22-18: requireBrowserMutation valida Origin, custom header, metadata, ambigüedad y CSRF", () => {
  process.env.APP_URL = "https://example.invalid";
  process.env.SESSION_SECRET = "b".repeat(64);

  const validToken = newSessionToken();
  const validCsrf = csrfToken(validToken)!;
  const url = "https://example.invalid/api/demo/runs";
  const validHeaders = {
    Origin: "https://example.invalid",
    "X-Jopoi-Request": "demo",
    "Content-Type": "application/json",
    Cookie: `${HOST_SESSION_COOKIE}=${validToken}`,
    "X-CSRF-Token": validCsrf,
  };

  // Petición válida con sesión y CSRF
  assert.doesNotThrow(() => requireBrowserMutation(new Request(url, { method: "POST", headers: validHeaders })));

  // Bootstrap anónimo (sin cookie) no requiere CSRF
  assert.doesNotThrow(() => requireBrowserMutation(new Request(url, {
    method: "POST",
    headers: { Origin: "https://example.invalid", "X-Jopoi-Request": "demo", "Content-Type": "application/json" },
  })));

  // Origin incorrecto
  assert.throws(
    () => requireBrowserMutation(new Request(url, { method: "POST", headers: { ...validHeaders, Origin: "https://evil.invalid" } })),
    (e: unknown) => e instanceof ApplicationError && e.code === "REQUEST_FORBIDDEN",
  );

  // X-Jopoi-Request ausente o inválido
  assert.throws(
    () => requireBrowserMutation(new Request(url, { method: "POST", headers: { ...validHeaders, "X-Jopoi-Request": "other" } })),
    (e: unknown) => e instanceof ApplicationError && e.code === "REQUEST_FORBIDDEN",
  );

  // Content-Type no JSON
  assert.throws(
    () => requireBrowserMutation(new Request(url, { method: "POST", headers: { ...validHeaders, "Content-Type": "text/plain" } })),
    (e: unknown) => e instanceof ApplicationError && e.code === "INVALID_INPUT",
  );

  // Sec-Fetch-Site cross-site
  assert.throws(
    () => requireBrowserMutation(new Request(url, { method: "POST", headers: { ...validHeaders, "Sec-Fetch-Site": "cross-site" } })),
    (e: unknown) => e instanceof ApplicationError && e.code === "REQUEST_FORBIDDEN",
  );

  // Sec-Fetch-Mode navigate
  assert.throws(
    () => requireBrowserMutation(new Request(url, { method: "POST", headers: { ...validHeaders, "Sec-Fetch-Mode": "navigate" } })),
    (e: unknown) => e instanceof ApplicationError && e.code === "REQUEST_FORBIDDEN",
  );

  // Coexistencia de cookies ambigua (dos valores distintos)
  assert.throws(
    () => requireBrowserMutation(new Request(url, {
      method: "POST",
      headers: { ...validHeaders, Cookie: `${HOST_SESSION_COOKIE}=${validToken}; ${SESSION_COOKIE}=${newSessionToken()}` },
    })),
    (e: unknown) => e instanceof ApplicationError && e.code === "SESSION_REQUIRED",
  );

  // Cookie presente pero X-CSRF-Token ausente
  const { "X-CSRF-Token": _, ...missingCsrf } = validHeaders;
  assert.throws(
    () => requireBrowserMutation(new Request(url, { method: "POST", headers: missingCsrf })),
    (e: unknown) => e instanceof ApplicationError && e.code === "REQUEST_FORBIDDEN",
  );

  // Cookie presente pero X-CSRF-Token de otra sesión
  assert.throws(
    () => requireBrowserMutation(new Request(url, { method: "POST", headers: { ...validHeaders, "X-CSRF-Token": csrfToken(newSessionToken())! } })),
    (e: unknown) => e instanceof ApplicationError && e.code === "REQUEST_FORBIDDEN",
  );

  // DELETE con sesión y CSRF (sin Content-Type ni body) es válido
  const deleteHeaders = {
    Origin: "https://example.invalid",
    "X-Jopoi-Request": "demo",
    Cookie: `${HOST_SESSION_COOKIE}=${validToken}`,
    "X-CSRF-Token": validCsrf,
  };
  assert.doesNotThrow(() => requireBrowserMutation(new Request(url, { method: "DELETE", headers: deleteHeaders })));

  // DELETE sin cookie (repetido o anónimo) es válido
  assert.doesNotThrow(() => requireBrowserMutation(new Request(url, {
    method: "DELETE",
    headers: { Origin: "https://example.invalid", "X-Jopoi-Request": "demo" },
  })));

  // DELETE con cookie pero sin CSRF rechaza
  assert.throws(
    () => requireBrowserMutation(new Request(url, {
      method: "DELETE",
      headers: { Origin: "https://example.invalid", "X-Jopoi-Request": "demo", Cookie: `${HOST_SESSION_COOKIE}=${validToken}` },
    })),
    (e: unknown) => e instanceof ApplicationError && e.code === "REQUEST_FORBIDDEN",
  );
});

test("S22-16 / S22-17: isSessionActive valida inactividad (60 min), máximo absoluto (24 h) y revocación", () => {
  const base = new Date("2026-01-01T12:00:00.000Z");
  const expiresAt = new Date(base.getTime() + 24 * 3600 * 1000);
  const session = {
    expiresAt,
    lastActivityAt: base,
    revokedAt: null as Date | null,
  };

  // Activa inmediatamente
  assert.equal(isSessionActive(session, base), true);

  // Activa a los 30 minutos (inactividad < 60 min, dentro de 24 h)
  assert.equal(isSessionActive(session, new Date(base.getTime() + 30 * 60 * 1000)), true);

  // Inactiva a los 60 minutos exactos
  assert.equal(isSessionActive(session, new Date(base.getTime() + 60 * 60 * 1000)), false);

  // Inactiva a los 65 minutos
  assert.equal(isSessionActive(session, new Date(base.getTime() + 65 * 60 * 1000)), false);

  // Revocada
  assert.equal(isSessionActive({ ...session, revokedAt: new Date(base.getTime() + 10 * 1000) }, base), false);

  // Actividad reciente pero superó el máximo absoluto de 24 h
  const lateActivity = new Date(expiresAt.getTime() - 5 * 60 * 1000); // 5 min antes del final
  const expiredSession = {
    expiresAt,
    lastActivityAt: lateActivity,
    revokedAt: null,
  };
  // Válida 1 min antes de las 24 h
  assert.equal(isSessionActive(expiredSession, new Date(expiresAt.getTime() - 60 * 1000)), true);
  // Inválida en el segundo exacto de las 24 h
  assert.equal(isSessionActive(expiredSession, expiresAt), false);
  // Inválida después de las 24 h aun con actividad reciente
  assert.equal(isSessionActive(expiredSession, new Date(expiresAt.getTime() + 1000)), false);
});

test("S22-13 / S22-14: ETag fuerte representa el recurso y precondiciones If-Match e If-None-Match", () => {
  const resource: OperationResource = {
    traceId: "00000000-0000-4000-8000-000000000001",
    version: 1,
    observedAt: "2026-01-15T12:00:00.000Z",
    operation: {
      state: "DRAFT" as const,
      quantityKg: "12000.000",
      humidityPercent: "28.00",
      assignedBuyerId: null,
      assignedTripId: null,
      receivedKg: null,
      rejectionReasonCode: null,
      incidentReasonCode: null,
    },
  };

  const etag = computeOperationEtag(resource);
  assert.ok(/^"[a-f0-9]{64}"$/.test(etag), `ETag inválido: ${etag}`);

  // ETag idéntico ante los mismos datos canónicos
  assert.equal(computeOperationEtag({ ...resource }), etag);

  // ETag distinto si cambia la versión
  const v2Etag = computeOperationEtag({ ...resource, version: 2 });
  assert.notEqual(v2Etag, etag);

  // matchesIfMatch
  assert.equal(matchesIfMatch(etag, etag), true);
  assert.equal(matchesIfMatch("*", etag), true);
  assert.equal(matchesIfMatch(etag.replaceAll('"', ""), etag), true); // unquoted tolerante
  assert.equal(matchesIfMatch(`"other-etag", ${etag}`, etag), true);
  assert.equal(matchesIfMatch('"other-etag"', etag), false);
  assert.equal(matchesIfMatch(null, etag), false);
  assert.equal(matchesIfMatch(undefined, etag), false);
  assert.equal(matchesIfMatch("", etag), false);

  // matchesIfNoneMatch
  assert.equal(matchesIfNoneMatch(etag, etag), true);
  assert.equal(matchesIfNoneMatch("*", etag), true);
  assert.equal(matchesIfNoneMatch('"other"', etag), false);
  assert.equal(matchesIfNoneMatch(null, etag), false);

  // Run ETag distingue cuotas o publicaciones sin afectar el ETag de la operación
  const run1 = { ...resource, quota: { used: 1 } };
  const run2 = { ...resource, quota: { used: 2 } };
  assert.notEqual(computeRunEtag(run1), computeRunEtag(run2));
  assert.equal(computeRunEtag({ ...run1, observedAt: "2026-01-15T13:00:00.000Z" }), computeRunEtag(run1));
  assert.equal(computeOperationEtag(resource), etag);

  // Trace ETag representa la proyección pública completa
  const trace1 = { traceId: resource.traceId, version: 1, state: "PUBLISHED", events: [] };
  const trace2 = { traceId: resource.traceId, version: 1, state: "PUBLISHED", events: [{ eventId: "e1" }] };
  const traceEtag1 = computeTraceEtag(trace1);
  const traceEtag2 = computeTraceEtag(trace2);
  assert.ok(/^"[a-f0-9]{64}"$/.test(traceEtag1));
  assert.notEqual(traceEtag1, traceEtag2);
  assert.equal(computeTraceEtag({ ...trace1, observedAt: "2026-01-15T13:00:00.000Z" }), traceEtag1);
  assert.equal(matchesIfNoneMatch(traceEtag1, traceEtag1), true);
  assert.equal(matchesIfNoneMatch(traceEtag2, traceEtag1), false);
});

test("S22-15: CSP efectiva define script-src restrictivo, object-src, base-uri, form-action y frame-ancestors sin unsafe-inline general", () => {
  const cspProd = buildContentSecurityPolicy({ isDev: false });
  assert.ok(cspProd.includes("default-src 'self'"));
  assert.ok(cspProd.includes("object-src 'none'"));
  assert.ok(cspProd.includes("base-uri 'none'"));
  assert.ok(cspProd.includes("form-action 'self'"));
  assert.ok(cspProd.includes("frame-ancestors 'none'"));
  assert.ok(cspProd.includes("img-src 'self' data:"));
  assert.ok(cspProd.includes("style-src 'self' 'unsafe-inline'"));
  assert.ok(cspProd.includes("font-src 'self'"));
  assert.ok(cspProd.includes("connect-src 'self' https://testnet.mirrornode.hedera.com"));

  // script-src restrictivo: tiene 'self' y hashes, y NO tiene 'unsafe-inline' ni 'unsafe-eval' en prod
  const scriptDirective = cspProd.split(";").map(d => d.trim()).find(d => d.startsWith("script-src"));
  assert.ok(scriptDirective);
  assert.ok(scriptDirective.includes("'self'"));
  assert.ok(scriptDirective.includes(`'${THEME_BOOTSTRAP_HASH}'`));
  assert.ok(!scriptDirective.includes("'unsafe-inline'"));
  assert.ok(!scriptDirective.includes("'unsafe-eval'"));

  // En dev incluye 'unsafe-eval'
  const cspDev = buildContentSecurityPolicy({ isDev: true });
  const devScriptDirective = cspDev.split(";").map(d => d.trim()).find(d => d.startsWith("script-src"));
  assert.ok(devScriptDirective?.includes("'unsafe-eval'"));

  // Con nonce incluye 'nonce-...'
  const cspNonce = buildContentSecurityPolicy({ nonce: "test-nonce-123", isDev: false });
  assert.ok(cspNonce.includes("'nonce-test-nonce-123'"));
});

test("S22-15: getSecurityHeaders y safe boundary emiten nosniff, referrer, DENY, HSTS condicional y Report-Only ensayable", () => {
  // Plain HTTP
  const httpHeaders = getSecurityHeaders({ isHttps: false, reportOnly: false });
  assert.equal(httpHeaders["X-Content-Type-Options"], "nosniff");
  assert.equal(httpHeaders["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(httpHeaders["X-Frame-Options"], "DENY");
  assert.ok(httpHeaders["Content-Security-Policy"]);
  assert.equal(httpHeaders["Content-Security-Policy-Report-Only"], undefined);
  assert.equal(httpHeaders["Strict-Transport-Security"], undefined);

  // HTTPS emite HSTS con max-age=63072000; includeSubDomains; preload
  const httpsHeaders = getSecurityHeaders({ isHttps: true, reportOnly: false });
  assert.equal(httpsHeaders["Strict-Transport-Security"], "max-age=63072000; includeSubDomains; preload");

  // Report-Only ensayable
  const reportOnlyHeaders = getSecurityHeaders({ isHttps: true, reportOnly: true });
  assert.ok(reportOnlyHeaders["Content-Security-Policy-Report-Only"]);
  assert.equal(reportOnlyHeaders["Content-Security-Policy"], undefined);

  // renderSafePageResponse emite todas las cabeceras de seguridad efectivas en HTML y Problem Details
  const htmlSafeReq = new Request("https://example.invalid/trazabilidad/unknown", { headers: { Accept: "text/html" } });
  const htmlSafeRes = renderSafePageResponse(htmlSafeReq, {
    status: 404,
    code: "NOT_FOUND",
    problemType: "not-found",
    title: "No encontrado",
    heading: "No encontrado",
    message: "No encontramos el recorrido.",
  });
  assert.equal(htmlSafeRes.headers.get("x-content-type-options"), "nosniff");
  assert.equal(htmlSafeRes.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(htmlSafeRes.headers.get("x-frame-options"), "DENY");
  assert.ok(htmlSafeRes.headers.get("content-security-policy"));
  assert.equal(htmlSafeRes.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains; preload");

  const jsonSafeReq = new Request("http://example.invalid/trazabilidad/unknown", { headers: { Accept: "application/problem+json" } });
  const jsonSafeRes = renderSafePageResponse(jsonSafeReq, {
    status: 404,
    code: "NOT_FOUND",
    problemType: "not-found",
    title: "No encontrado",
    heading: "No encontrado",
    message: "No encontramos el recorrido.",
  });
  assert.equal(jsonSafeRes.headers.get("x-content-type-options"), "nosniff");
  assert.equal(jsonSafeRes.headers.get("x-frame-options"), "DENY");
  assert.ok(jsonSafeRes.headers.get("content-security-policy"));
  assert.equal(jsonSafeRes.headers.get("strict-transport-security"), null);
});

test("S22-22: proyecciones explícitas de eventos y publicaciones excluyen campos pesados y lease metadata", () => {
  // publicTracePublicationSelect no incluye attempts, signedTransactionBytes ni leases
  const tracePubKeys = Object.keys(publicTracePublicationSelect);
  assert.ok(!tracePubKeys.includes("attempts"));
  assert.ok(!tracePubKeys.includes("signedTransactionBytes"));
  assert.ok(!tracePubKeys.includes("leaseOwner"));
  assert.ok(!tracePubKeys.includes("leaseExpiresAt"));

  // publicTraceEventSelect no proyecta attempts
  assert.equal(publicTraceEventSelect.publication.select, publicTracePublicationSelect);

  // publicVerificationPublicationSelect sólo agrega attempts selectivos
  const verifPubKeys = Object.keys(publicVerificationPublicationSelect);
  assert.ok(verifPubKeys.includes("attempts"));
  assert.ok(!verifPubKeys.includes("signedTransactionBytes"));
  assert.ok(!verifPubKeys.includes("leaseOwner"));

  // publicationSummarySelect excluye signed bytes, historiales y leases
  const summaryKeys = Object.keys(publicationSummarySelect);
  assert.ok(!summaryKeys.includes("signedTransactionBytes"));
  assert.ok(!summaryKeys.includes("attemptHistory"));
  assert.ok(!summaryKeys.includes("verificationEvidence"));
  assert.ok(!summaryKeys.includes("leaseOwner"));
  assert.ok(!summaryKeys.includes("leaseExpiresAt"));
});

test("S22-22: cálculo lineal de bloqueo de hitos preserva exactamente la semántica de negocio", () => {
  const scenarios = [
    // 1. Todas confirmadas
    [{ id: "e1", ordinal: 1, state: "CONFIRMED" }, { id: "e2", ordinal: 2, state: "CONFIRMED" }],
    // 2. Primera encolada bloquea a las siguientes
    [{ id: "e1", ordinal: 1, state: "QUEUED" }, { id: "e2", ordinal: 2, state: "QUEUED" }, { id: "e3", ordinal: 3, state: "QUEUED" }],
    // 3. Primera confirmada, segunda fallida bloquea a la tercera
    [{ id: "e1", ordinal: 1, state: "CONFIRMED" }, { id: "e2", ordinal: 2, state: "FAILED" }, { id: "e3", ordinal: 3, state: "QUEUED" }],
    // 4. Vacío
    [],
  ];

  for (const rows of scenarios) {
    // Cálculo cuadrático original:
    const quadratic = rows.map((row) =>
      rows.find((previous) => previous.ordinal < row.ordinal && previous.state !== "CONFIRMED")?.id ?? null
    );

    // Cálculo lineal optimizado:
    let firstUnconfirmedId: string | null = null;
    const linear = rows.map((row) => {
      const blockedBy = firstUnconfirmedId;
      if (firstUnconfirmedId === null && row.state !== "CONFIRMED") {
        firstUnconfirmedId = row.id;
      }
      return blockedBy;
    });

    assert.deepEqual(linear, quadratic);
  }
});
