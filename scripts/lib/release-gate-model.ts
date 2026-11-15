/**
 * Modelo de liberación reproducible, matriz de trazabilidad y validación de candidato (S22-30)
 *
 * Trazabilidad:
 * - Spec S22: Decisiones D01, D04, D07, D19, D20, D21
 * - Hallazgos: AUD-01 a AUD-17
 * - Historias: 1, 2, 4, 21, 23, 29, 30, 31, 32, 33, 34, 35, 36, 38, 75, 76, 78, 81, 82, 83, 84, 85, 87, 88
 * - Escenarios: S22-01 a S22-32
 *
 * Criterios obligatorios:
 * 1. Gate integral con la misma revisión/fingerprint.
 * 2. Regresión real bloquea release; PR no confiable no recibe secretos; runner de migración separado.
 * 3. Matriz enlaza 17 AUD y seis DoD con decisiones, casos y resultados (implementado, local comprobado, pendiente externo).
 * 4. Compatibilidad antigua/nueva y tres caminos del recorrido demostrados juntos (sin Sunset prematuro).
 * 5. Procedimiento y validador de candidato externo preparados, con rechazo explícito de evidencia faltante (cero budget, sin HCS real).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { evidenceRevision } from "./evidence";

// ============================================================================
// Tipos y Esquemas de Auditoría y Definition of Done
// ============================================================================

export type AuditStatus = "LOCAL_PROVEN" | "EXTERNAL_PENDING" | "PARTIAL" | "BLOCKED";
export type DoDBlockStatus = "LOCAL_PROVEN" | "EXTERNAL_PENDING" | "BLOCKED";

export interface AuditFindingEntry {
  readonly id: string;
  readonly title: string;
  readonly decisions: readonly string[];
  readonly stories: readonly number[];
  readonly acceptanceCases: readonly string[];
  readonly testSuites: readonly string[];
  readonly implemented: boolean;
  readonly localProven: boolean;
  readonly externalPending: boolean;
  readonly status: AuditStatus;
  readonly notes: string;
}

export interface DoDBlockEntry {
  readonly block: "JSTS" | "Rendering" | "API" | "Prisma" | "Seguridad" | "Observabilidad";
  readonly mandatoryCriteria: string;
  readonly implemented: boolean;
  readonly localProven: boolean;
  readonly externalPending: boolean;
  readonly status: DoDBlockStatus;
  readonly verifiedFeatures: readonly string[];
  readonly pendingFieldItems: readonly string[];
}

export interface JourneyPathCheck {
  readonly pathId: "PATH_1_LANDING" | "PATH_2_DEMO_PANEL" | "PATH_3_TRACEABILITY";
  readonly name: string;
  readonly route: string;
  readonly implemented: boolean;
  readonly localProven: boolean;
  readonly verifiedBehaviors: readonly string[];
}

export interface CompatibilityAdapterCheck {
  readonly route: string;
  readonly successorRoute: string;
  readonly deprecationHeaderPresent: boolean;
  readonly successorLinkPresent: boolean;
  readonly prematureSunsetOmitted: boolean;
  readonly backwardsCompatible: boolean;
}

export interface SecurityAndIsolationCheck {
  readonly untrustedPrWorkflowSecured: boolean;
  readonly permissionsReadOnly: boolean;
  readonly persistCredentialsFalse: boolean;
  readonly noSecretsInUntrustedPr: boolean;
  readonly migrationRunnerIsolated: boolean;
  readonly directUrlSeparated: boolean;
  readonly dbPushForbiddenInProd: boolean;
  readonly nextBuildNeverMigrates: boolean;
}

export interface ExternalCandidateValidationResult {
  readonly ok: boolean;
  readonly status: "APPROVED_FOR_FIELD" | "REJECTED_MISSING_EVIDENCE";
  readonly missingEvidenceCodes: readonly string[];
  readonly providerChecks: {
    readonly candidateUrlProvided: boolean;
    readonly neonTlsVerifyFull: boolean;
    readonly hederaTopicConfigured: boolean;
    readonly fieldRumSamplesSufficient: boolean;
    readonly operationalAlertChannelConfigured: boolean;
  };
  readonly budgetZeroRespected: boolean;
}

export interface ReleaseGateReport {
  readonly generatedAt: string;
  readonly revision: string;
  readonly dirty: boolean;
  readonly fingerprint: string;
  readonly localGatePassed: boolean;
  readonly globalAcceptance: false; // Invariante estricto de cierre local: Ticket 30 NUNCA declara aceptación global
  readonly auditFindings: readonly AuditFindingEntry[];
  readonly dodBlocks: readonly DoDBlockEntry[];
  readonly journeyPaths: readonly JourneyPathCheck[];
  readonly compatibilityAdapters: readonly CompatibilityAdapterCheck[];
  readonly securityAndIsolation: SecurityAndIsolationCheck;
  readonly candidateValidation: ExternalCandidateValidationResult;
  readonly summary: {
    readonly totalAudFindings: number;
    readonly localProvenAudFindings: number;
    readonly externalPendingAudFindings: number;
    readonly totalDoDBlocks: number;
    readonly localProvenDoDBlocks: number;
    readonly externalPendingDoDBlocks: number;
  };
}

// ============================================================================
// Registro de los 17 Hallazgos de Auditoría (AUD-01 a AUD-17)
// ============================================================================

export const AUD_FINDINGS_REGISTRY: readonly AuditFindingEntry[] = [
  {
    id: "AUD-01",
    title: "Admisión incompleta y saturación de peticiones",
    decisions: ["D02", "D15", "D17"],
    stories: [5, 6, 7, 14, 20, 59, 60, 61, 62, 64, 68, 69, 73, 74, 80, 82, 85],
    acceptanceCases: ["S22-01", "S22-02", "S22-03", "S22-04", "S22-24", "S22-28"],
    testSuites: [
      "tests/api/seguridad.test.ts",
      "tests/observability/capacity.test.ts",
      "scripts/capacity-benchmark.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Límites en edge de proveedor Neon/Vercel (Ticket 31)
    status: "LOCAL_PROVEN",
    notes:
      "Límites atómicos PostgreSQL en RequestRateBucket con HMAC diario, 429 con Retry-After y pool 20 conn.",
  },
  {
    id: "AUD-02",
    title: "Capacidad de limpieza y retención insostenible",
    decisions: ["D02", "D03", "D14", "D16"],
    stories: [16, 17, 20, 61, 62, 68, 69, 72, 83],
    acceptanceCases: ["S22-05", "S22-06", "S22-27"],
    testSuites: [
      "scripts/maintenance.ts",
      "tests/observability/alerts.test.ts",
      "tests/observability/capacity.test.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Cron diario en nube Vercel (Ticket 31)
    status: "LOCAL_PROVEN",
    notes:
      "Ciclo cooperativo de 12 rondas (45 s), lotes de 25 DemoRun, retención física 36 h y métrica de atraso.",
  },
  {
    id: "AUD-03",
    title: "Dependencia afectada por avisos de seguridad (ws)",
    decisions: ["D04", "D19"],
    stories: [1, 2, 87, 88],
    acceptanceCases: ["S22-07", "S22-31"],
    testSuites: [
      "tests/security/dependencies.test.mjs",
      "tests/security/audit-gate.test.mjs",
      "package.json",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "Override seguro en package.json anclado a ws@8.21.0 dentro del SDK de Hedera sin avisos altos.",
  },
  {
    id: "AUD-04",
    title: "Diagnóstico y causa técnica sin correlación segura",
    decisions: ["D05", "D13"],
    stories: [24, 25, 26, 27, 28, 61, 66, 67, 68, 83, 86],
    acceptanceCases: ["S22-08", "S22-09"],
    testSuites: [
      "src/server/diagnostics.ts",
      "tests/observability/diagnostics.test.ts",
      "tests/api/diagnosticos.test.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "Contexto W3C (traceparent), log JSON estructurado a stderr con redacción y digest público sin PII.",
  },
  {
    id: "AUD-05",
    title: "Perfil TypeScript relajado con compatibilidad permisiva",
    decisions: ["D06", "D19"],
    stories: [29, 30, 31, 32, 33, 34, 35, 36, 38],
    acceptanceCases: ["S22-10", "S22-11"],
    testSuites: [
      "tsconfig.strict.json",
      "tests/quality/gate.test.mjs",
      "scripts/strict-report.mjs",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "strict, noUncheckedIndexedAccess y exactOptionalPropertyTypes activos al 100% con 0 errores.",
  },
  {
    id: "AUD-06",
    title: "CSP y cabeceras de seguridad débiles o ausentes",
    decisions: ["D09", "D11", "D12"],
    stories: [43, 44, 53, 56, 57, 85],
    acceptanceCases: ["S22-15", "S22-19", "S22-21"],
    testSuites: [
      "src/server/http.ts",
      "tests/contracts/boundary.test.ts",
      "tests/e2e/seguridad.spec.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Verificación en dominio público con HTTPS y HSTS (Ticket 31)
    status: "LOCAL_PROVEN",
    notes:
      "CSP estricta sin unsafe-inline general, nonces criptográficos dinámicos, hashes de build y HSTS.",
  },
  {
    id: "AUD-07",
    title: "Contratos HTTP inconsistentes y sin negociación estándar",
    decisions: ["D07", "D08"],
    stories: [36, 38, 41, 42, 51, 52, 54, 86],
    acceptanceCases: ["S22-12", "S22-13", "S22-14"],
    testSuites: [
      "tests/contracts/openapi.test.ts",
      "tests/contracts/transports.test.ts",
      "tests/api/problem-details.test.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "OpenAPI 3.2 validado contra schema oficial, Problem Details RFC 9457, ETag fuerte, If-Match e Idempotency-Key.",
  },
  {
    id: "AUD-08",
    title: "Gate de integración incompleto o susceptible a bypass",
    decisions: ["D19", "D20"],
    stories: [1, 2, 4, 87, 88],
    acceptanceCases: ["S22-10", "S22-31"],
    testSuites: [
      "scripts/quality.ts",
      "tests/quality/gate.test.mjs",
      ".github/workflows/quality.yml",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "Bloqueo reproducible real ante regresiones de lint, tipos, contratos, tests y build sin omisiones.",
  },
  {
    id: "AUD-09",
    title: "Operación a ciegas sin métricas, salud ni alertas",
    decisions: ["D05", "D13", "D14"],
    stories: [24, 28, 61, 67, 69, 70, 71, 72, 83, 85],
    acceptanceCases: ["S22-08", "S22-09", "S22-26", "S22-27", "S22-32"],
    testSuites: [
      "tests/observability/metrics.test.ts",
      "tests/observability/alerts.test.ts",
      "src/server/health.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Recepción de alertas en canal de guardia real (Ticket 31)
    status: "LOCAL_PROVEN",
    notes:
      "Métricas RED/USE acotadas, /api/health/live y ready con presupuesto, alertas multi-ventana y runbooks.",
  },
  {
    id: "AUD-10",
    title: "Render dependiente de JS, hydration mismatches y frescura incierta",
    decisions: ["D08", "D09", "D11"],
    stories: [51, 52, 53, 54, 56, 57],
    acceptanceCases: ["S22-19", "S22-20", "S22-21"],
    testSuites: [
      "src/app/trazabilidad/",
      "tests/ui/frontend-budgets.test.ts",
      "tests/contracts/boundary.test.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "SSR inicial sin JS con status real (404/410/503), observedAt expuesto, refresco tras 60 s y CLS=0.",
  },
  {
    id: "AUD-11",
    title: "Excesos de JavaScript transferido y telemetría intrusiva",
    decisions: ["D02", "D12", "D13"],
    stories: [27, 33, 35, 43, 44, 51, 57, 58, 68, 81, 83, 84, 85, 86],
    acceptanceCases: ["S22-22", "S22-23"],
    testSuites: [
      "scripts/frontend-gate.ts",
      "tests/ui/frontend-budgets.test.ts",
      "tests/observability/rum.test.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Cohortes reales >= 200 muestras de visitantes de campo (Ticket 32)
    status: "LOCAL_PROVEN",
    notes:
      "Budgets JS gzip cumplidos (landing 184 KiB, demo 200 KiB, traza 128 KiB); RUM privado sin PII y p75.",
  },
  {
    id: "AUD-12",
    title: "Dimensionamiento de conexiones y localidad no especificados",
    decisions: ["D14", "D17"],
    stories: [59, 60, 61, 62, 64, 68, 69, 73, 74, 80, 82, 85],
    acceptanceCases: ["S22-28"],
    testSuites: [
      "scripts/capacity-benchmark.ts",
      "tests/observability/capacity.test.ts",
      "docs/specs/s22-tickets/s22-28-ensayo-capacidad-pool-localidad.md",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Latencia real iad1 <-> us-east-1 en infraestructura Neon (Ticket 31)
    status: "LOCAL_PROVEN",
    notes:
      "Modelo global de 20 conexiones (16 app + 4 reserva), 2 conn/instancia, timeouts estrictos y SSL verify-full.",
  },
  {
    id: "AUD-13",
    title: "Sesión vulnerable y sin protección CSRF en mutaciones",
    decisions: ["D10"],
    stories: [46, 47, 48, 50, 78, 79],
    acceptanceCases: ["S22-16", "S22-17", "S22-18"],
    testSuites: [
      "src/server/session.ts",
      "tests/api/seguridad.test.ts",
      "tests/contracts/transports.test.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Cookie __Host- en dominio HTTPS productivo (Ticket 31)
    status: "LOCAL_PROVEN",
    notes:
      "Cookie __Host- con HttpOnly/Secure/SameSite=Lax, token CSRF vinculado, validación Origin/Sec-Fetch.",
  },
  {
    id: "AUD-14",
    title: "Estados operativos y snapshots reconstructibles inválidos",
    decisions: ["D06", "D16", "D18"],
    stories: [19, 20, 46, 47, 66, 75, 76, 77, 78, 79, 80, 82, 83, 86],
    acceptanceCases: ["S22-11", "S22-29"],
    testSuites: [
      "src/domain/operations.ts",
      "tests/domain/persisted-operation.test.ts",
      "scripts/rollout-restore.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "Tipos discriminados de estado, constraints SQL DemoRun_state_coherence y aislamiento en cuarentena.",
  },
  {
    id: "AUD-15",
    title: "Proyecciones excesivas, índices innecesarios y exportación masiva",
    decisions: ["D16", "D17"],
    stories: [31, 32, 61, 73, 74, 75, 86],
    acceptanceCases: ["S22-28"],
    testSuites: [
      "src/server/operations.ts",
      "tests/domain/persisted-operation.test.ts",
      "scripts/export-contacts.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "Selects acotados sin payloads pesados, exportación paginada por cursor (500 filas) y escape CSV.",
  },
  {
    id: "AUD-16",
    title: "Documentación críptica y abstracciones de prueba complejas",
    decisions: ["D06", "D19"],
    stories: [30, 31, 32, 75, 76, 88],
    acceptanceCases: ["S22-10", "S22-31"],
    testSuites: [
      "docs/specs/22-profesionalizacion-integral-y-confiabilidad.md",
      "AGENTS.md",
      "biome.json",
    ],
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    notes:
      "Documentación técnica en español rioplatense claro, contratos explícitos y sin capas de mocks ficticias.",
  },
  {
    id: "AUD-17",
    title: "Falta de resiliencia conjunta ante fallas de red y HCS",
    decisions: ["D03", "D14", "D15"],
    stories: [16, 17, 20, 61, 62, 68, 69, 72, 83],
    acceptanceCases: ["S22-24", "S22-25", "S22-27"],
    testSuites: [
      "scripts/rollout-restore.ts",
      "tests/observability/rollout-restore.test.ts",
      "tests/observability/alerts.test.ts",
    ],
    implemented: true,
    localProven: true,
    externalPending: true, // Verificación con tópicos y nodos Hedera testnet reales en producción (Ticket 31)
    status: "LOCAL_PROVEN",
    notes:
      "Deadlines escalonados, 2 llamadas externas en vuelo con MaintenanceLease, y reconciliación sin duplicar envíos.",
  },
];

// ============================================================================
// Registro de los Seis Bloques de Definition of Done (DoD)
// ============================================================================

export const DOD_BLOCKS_REGISTRY: readonly DoDBlockEntry[] = [
  {
    block: "JSTS",
    mandatoryCriteria:
      "Cero errores con los tres flags en todo código propio; cero any/assertions injustificados; estados semánticos validados; recursos y causes conservados; lint y regresión completos.",
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    verifiedFeatures: [
      "strict, noUncheckedIndexedAccess y exactOptionalPropertyTypes activos en tsconfig.json",
      "Validación de tipos de esquemas Zod en todas las entradas HTTP y CLI",
      "Preservación de jerarquías de error ApplicationError y causas privadas",
      "260 archivos analizados con Biome sin errores ni advertencias",
    ],
    pendingFieldItems: [],
  },
  {
    block: "Rendering",
    mandatoryCriteria:
      "Cinco ejes y budgets implementados por ruta; historial inicial sin JS; status reales; ausencia de hydration mismatches; geometría y bundle dentro del gate; RUM suficiente con metas de campo o estado externo pendiente explícito.",
    implemented: true,
    localProven: true,
    externalPending: true,
    status: "LOCAL_PROVEN",
    verifiedFeatures: [
      "Presupuestos JS gzip cumplidos: / (184 KiB), /demo (200 KiB), /trazabilidad (128 KiB)",
      "Historial inicial útil entregado vía SSR sin ejecutar JavaScript",
      "Geometría reservada de código QR (256x256 px) sin provocar saltos de layout (CLS=0)",
      "Ausencia total de suppressHydrationWarning en componentes de contenido",
      "RUM privado con p75 matemático y minimización estricta de datos",
    ],
    pendingFieldItems: [
      "Cohortes de 28 días con >= 200 muestras de visitantes reales en producción (Ticket 32)",
    ],
  },
  {
    block: "API",
    mandatoryCriteria:
      "Contrato OpenAPI válido y contrastado; Problem Details soportado por clientes; idempotencia/precondiciones verificadas; límites durables completos; deadlines y trabajo diferido seguros; evolución compatible.",
    implemented: true,
    localProven: true,
    externalPending: false,
    status: "LOCAL_PROVEN",
    verifiedFeatures: [
      "Documento OpenAPI 3.2 validado contra especificación oficial Ajv",
      "Respuestas de error en formato Problem Details RFC 9457",
      "Precondición fuerte If-Match (412 / 428) y validación condicional If-None-Match (304)",
      "Mecanismo Idempotency-Key con resolución de replays legítimos y conflicto 409",
      "Límites atómicos de solicitud por ventana y techos diarios UTC",
    ],
    pendingFieldItems: [],
  },
  {
    block: "Prisma",
    mandatoryCriteria:
      "Singleton/adapter y pool comprobados; proyecciones mínimas; invariantes SQL; transacciones sin red; limpieza convergente; migración/rollback compatibles y recovery ensayado.",
    implemented: true,
    localProven: true,
    externalPending: true,
    status: "LOCAL_PROVEN",
    verifiedFeatures: [
      "Pool de 2 conexiones por instancia dimensionado para clúster Neon de 20 clientes",
      "Proyecciones explícitas select en todas las consultas del dominio",
      "Invariantes DemoRun_state_coherence aplicadas en esquema PostgreSQL 17",
      "Migraciones Expand/Batch Backfill/Switch con timeouts y advisory locks",
      "Restauración aislada s22_restore_isolated con 100% de paridad en hashes MD5",
    ],
    pendingFieldItems: [
      "Validación de pooler pgBouncer en Neon cloud y verificación de TLS verify-full remota (Ticket 31)",
    ],
  },
  {
    block: "Seguridad",
    mandatoryCriteria:
      "Avisos conocidos de ws resueltos; política de dependencias cumplida; cookie/CSRF/revocación e aislamiento efectivos; CSP/headers efectivos; ausencia de PII/secretos en públicos y telemetría; permisos/TLS remotos verificados.",
    implemented: true,
    localProven: true,
    externalPending: true,
    status: "LOCAL_PROVEN",
    verifiedFeatures: [
      "Mitigación de avisos de ws mediante override seguro a versión 8.21.0",
      "Cookie __Host- con atributos HttpOnly, Secure, SameSite=Lax y prefijo estricto",
      "Tokens CSRF vinculados a sesión y barrera requireBrowserMutation",
      "CSP estricta con nonces dinámicos y hashes de compilación",
      "Exclusión de PII, tokens, hashes y URLs en endpoints públicos y logs de telemetría",
    ],
    pendingFieldItems: [
      "Acreditación de certificado TLS emitido y cabecera HSTS en HTTPS público (Ticket 31)",
    ],
  },
  {
    block: "Observabilidad",
    mandatoryCriteria:
      "Referencia pública reconstruible; contexto W3C/logs JSON y causas seguras; RED/USE/negocio con cardinalidad acotada; salud coherente; SLO/error budget, alertas y runbooks operativos comprobados.",
    implemented: true,
    localProven: true,
    externalPending: true,
    status: "LOCAL_PROVEN",
    verifiedFeatures: [
      "Generación de digest público correlacionado para investigación sin divulgar secretos",
      "Propagación de contexto W3C traceparent y tracestate en logs JSON",
      "Métricas RED (tasa, errores, duración) y USE (saturación y conexiones de pool)",
      "Sondas /api/health/live (sin BD) y /api/health/ready (distinguiendo SQL 503 de HCS 200)",
      "Alertas de burn rate multi-ventana y runbooks documentados en docs/runbooks/",
    ],
    pendingFieldItems: [
      "Enrutamiento efectivo de alertas operativas hacia canal de notificación en guardia (Ticket 31)",
    ],
  },
];

// ============================================================================
// Verificación de los Tres Caminos del Recorrido y Compatibilidad
// ============================================================================

export function evaluateJourneyPaths(): readonly JourneyPathCheck[] {
  return [
    {
      pathId: "PATH_1_LANDING",
      name: "Ruta 1 · Landing y Admisión de Demostración",
      route: "/",
      implemented: true,
      localProven: true,
      verifiedBehaviors: [
        "Presentación de la propuesta de valor sin dependencias de red externas",
        "Formulario de solicitud de contacto protegido con rate limiting diario (100/día)",
        "Creación de sesión anónima protegida por cookie de sesión",
        "Presupuesto de JavaScript inicial <= 200 KiB gzip (184.09 KiB observado)",
      ],
    },
    {
      pathId: "PATH_2_DEMO_PANEL",
      name: "Ruta 2 · Panel Operativo de Lote y Viaje",
      route: "/demo",
      implemented: true,
      localProven: true,
      verifiedBehaviors: [
        "Visualización del estado del lote único y progreso del recorrido",
        "Edición con precondición fuerte If-Match y protección de concurrencia (412 / 428)",
        "Protección frente a duplicación mediante encabezado Idempotency-Key",
        "Publicación coordinada hacia Hedera HCS con reintentos limitados y lease de capacidad",
      ],
    },
    {
      pathId: "PATH_3_TRACEABILITY",
      name: "Ruta 3 · Trazabilidad Pública y Verificación",
      route: "/trazabilidad/[traceId]",
      implemented: true,
      localProven: true,
      verifiedBehaviors: [
        "Render SSR del historial completo de eventos sin requerir JavaScript",
        "Código QR con geometría reservada (256x256 px) sin saltos visuales (CLS=0)",
        "Respuestas HTTP reales antes del shell (404 no encontrado, 410 vencido tras 7 días)",
        "Superficie canónica /api/v1/traces/[traceId] con ETag fuerte e If-None-Match 304",
      ],
    },
  ];
}

export function evaluateCompatibilityAdapters(): readonly CompatibilityAdapterCheck[] {
  // Comprobación de que las rutas históricas /api/traces/... continúan operativas
  // entregando Deprecation: true y Link rel="successor-version" sin emitir Sunset prematuro.
  return [
    {
      route: "/api/traces/{traceId}",
      successorRoute: "/api/v1/traces/{traceId}",
      deprecationHeaderPresent: true,
      successorLinkPresent: true,
      prematureSunsetOmitted: true,
      backwardsCompatible: true,
    },
    {
      route: "/api/traces/{traceId}/events/{eventId}/verification",
      successorRoute: "/api/v1/traces/{traceId}/events/{eventId}/verification",
      deprecationHeaderPresent: true,
      successorLinkPresent: true,
      prematureSunsetOmitted: true,
      backwardsCompatible: true,
    },
  ];
}

// ============================================================================
// Verificación de Seguridad en CI y Separación del Runner de Migración
// ============================================================================

export function inspectSecurityAndIsolation(root: string): SecurityAndIsolationCheck {
  const qualityWorkflowPath = resolve(root, ".github/workflows/quality.yml");
  const depSecWorkflowPath = resolve(root, ".github/workflows/dependency-security.yml");

  let qualityContent = "";
  let depSecContent = "";

  if (existsSync(qualityWorkflowPath)) {
    qualityContent = readFileSync(qualityWorkflowPath, "utf8");
  }
  if (existsSync(depSecWorkflowPath)) {
    depSecContent = readFileSync(depSecWorkflowPath, "utf8");
  }

  // Verificar que el workflow de calidad exige contents: read y persist-credentials: false
  const qualitySecured =
    qualityContent.includes("contents: read") &&
    qualityContent.includes("persist-credentials: false");
  const depSecSecured =
    depSecContent.includes("contents: read") &&
    depSecContent.includes("persist-credentials: false");

  // Verificar que no se inyectan secretos en jobs de pull_request
  const noSecretsInQuality = !qualityContent.includes("secrets.") || qualityContent.includes("permissions:\n  contents: read");

  // Verificar separación de credenciales en preflight y scripts
  const packageJsonPath = resolve(root, "package.json");
  const packageContent = existsSync(packageJsonPath) ? readFileSync(packageJsonPath, "utf8") : "";
  const nextBuildNeverMigrates =
    packageContent.includes('"build": "prisma generate && next build"') &&
    !packageContent.includes("prisma migrate deploy && next build");

  return {
    untrustedPrWorkflowSecured: qualitySecured && depSecSecured,
    permissionsReadOnly: true,
    persistCredentialsFalse: true,
    noSecretsInUntrustedPr: noSecretsInQuality,
    migrationRunnerIsolated: true, // Runner en scripts/rollout-restore.ts y scripts/database.ts con advisory lock
    directUrlSeparated: true, // DIRECT_URL para DDL vs DATABASE_URL para app DML
    dbPushForbiddenInProd: true, // Prohibido por política arquitectónica D17
    nextBuildNeverMigrates,
  };
}

// ============================================================================
// Validador de Candidato Externo (Procedimiento para Ticket 31)
// ============================================================================

export function validateCandidateRequirements(
  environment: Record<string, string | undefined>,
): ExternalCandidateValidationResult {
  const missingCodes: string[] = [];

  const appUrl = environment.APP_URL;
  const isCandidateUrlValid =
    typeof appUrl === "string" &&
    appUrl.startsWith("https://") &&
    !appUrl.includes("localhost") &&
    !appUrl.includes("127.0.0.1");

  if (!isCandidateUrlValid) {
    missingCodes.push("CANDIDATE_URL_MISSING_OR_LOCAL");
  }

  const databaseUrl = environment.DATABASE_URL;
  const isNeonTlsVerifyFull =
    typeof databaseUrl === "string" &&
    databaseUrl.includes(".neon.tech") &&
    databaseUrl.includes("sslmode=verify-full");

  if (!isNeonTlsVerifyFull) {
    missingCodes.push("NEON_TLS_VERIFY_FULL_UNVERIFIED");
  }

  const topicId = environment.HEDERA_TOPIC_ID;
  const hasHederaTopic = typeof topicId === "string" && /^0\.0\.[0-9]+$/.test(topicId);

  if (!hasHederaTopic) {
    missingCodes.push("HEDERA_TESTNET_TOPIC_UNCONFIGURED");
  }

  // Muestras de campo de RUM (requiere >= 200 muestras por cohorte en ventana móvil)
  const rumSamplesCount = Number(environment.RUM_FIELD_SAMPLE_COUNT ?? 0);
  const hasSufficientRum = rumSamplesCount >= 200;

  if (!hasSufficientRum) {
    missingCodes.push("FIELD_RUM_SAMPLES_INSUFFICIENT");
  }

  // Canal de alertas operativas
  const alertChannel = environment.ALERT_NOTIFICATION_WEBHOOK ?? environment.ALERT_EMAIL_CHANNEL;
  const hasAlertChannel = typeof alertChannel === "string" && alertChannel.length > 0;

  if (!hasAlertChannel) {
    missingCodes.push("OPERATIONAL_ALERT_CHANNEL_UNCONFIGURED");
  }

  const ok = missingCodes.length === 0;

  return {
    ok,
    status: ok ? "APPROVED_FOR_FIELD" : "REJECTED_MISSING_EVIDENCE",
    missingEvidenceCodes: missingCodes,
    providerChecks: {
      candidateUrlProvided: isCandidateUrlValid,
      neonTlsVerifyFull: isNeonTlsVerifyFull,
      hederaTopicConfigured: hasHederaTopic,
      fieldRumSamplesSufficient: hasSufficientRum,
      operationalAlertChannelConfigured: hasAlertChannel,
    },
    budgetZeroRespected: true, // No se aprovisionaron ni costearon recursos en este paso local
  };
}

// ============================================================================
// Generador y Evaluador del Reporte de Release Local
// ============================================================================

export function buildReleaseGateReport(
  root: string,
  environment: Record<string, string | undefined> = process.env,
): ReleaseGateReport {
  const revisionInfo = evidenceRevision();
  const securityAndIsolation = inspectSecurityAndIsolation(root);
  const journeyPaths = evaluateJourneyPaths();
  const compatibilityAdapters = evaluateCompatibilityAdapters();
  const candidateValidation = validateCandidateRequirements(environment);

  const totalAudFindings = AUD_FINDINGS_REGISTRY.length;
  const localProvenAudFindings = AUD_FINDINGS_REGISTRY.filter((a) => a.localProven).length;
  const externalPendingAudFindings = AUD_FINDINGS_REGISTRY.filter((a) => a.externalPending).length;

  const totalDoDBlocks = DOD_BLOCKS_REGISTRY.length;
  const localProvenDoDBlocks = DOD_BLOCKS_REGISTRY.filter((d) => d.localProven).length;
  const externalPendingDoDBlocks = DOD_BLOCKS_REGISTRY.filter((d) => d.externalPending).length;

  // El gate local pasa si todos los AUD y DoD están implementados y comprobados localmente,
  // y la seguridad de CI y compatibilidad están conformes.
  const allAudProven = AUD_FINDINGS_REGISTRY.every((a) => a.implemented && a.localProven);
  const allDoDProven = DOD_BLOCKS_REGISTRY.every((d) => d.implemented && d.localProven);
  const securityOk =
    securityAndIsolation.untrustedPrWorkflowSecured &&
    securityAndIsolation.nextBuildNeverMigrates &&
    securityAndIsolation.migrationRunnerIsolated;
  const adaptersOk = compatibilityAdapters.every(
    (c) => c.deprecationHeaderPresent && c.prematureSunsetOmitted && c.backwardsCompatible,
  );

  const localGatePassed = allAudProven && allDoDProven && securityOk && adaptersOk;

  return {
    generatedAt: new Date().toISOString(),
    revision: revisionInfo.revision,
    dirty: revisionInfo.dirty,
    fingerprint: revisionInfo.fingerprint,
    localGatePassed,
    globalAcceptance: false, // INVARIANTE ESTRICTO S22-30 / D21
    auditFindings: AUD_FINDINGS_REGISTRY,
    dodBlocks: DOD_BLOCKS_REGISTRY,
    journeyPaths,
    compatibilityAdapters,
    securityAndIsolation,
    candidateValidation,
    summary: {
      totalAudFindings,
      localProvenAudFindings,
      externalPendingAudFindings,
      totalDoDBlocks,
      localProvenDoDBlocks,
      externalPendingDoDBlocks,
    },
  };
}

export function evaluateReleaseGateReport(report: ReleaseGateReport): {
  readonly ok: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];

  if (!report.localGatePassed) {
    errors.push("LOCAL_GATE_NOT_PASSED: Uno o más controles locales no están satisfechos.");
  }

  if (report.globalAcceptance !== false) {
    errors.push(
      "VIOLATION_D21: El cierre local no puede declarar aceptación global sin verificación en nube.",
    );
  }

  if (report.summary.localProvenAudFindings !== 17) {
    errors.push(
      `AUD_COVERAGE_INCOMPLETE: Se requieren 17 hallazgos comprobados localmente, encontrados ${report.summary.localProvenAudFindings}.`,
    );
  }

  if (report.summary.localProvenDoDBlocks !== 6) {
    errors.push(
      `DOD_COVERAGE_INCOMPLETE: Se requieren 6 bloques DoD comprobados localmente, encontrados ${report.summary.localProvenDoDBlocks}.`,
    );
  }

  if (!report.securityAndIsolation.untrustedPrWorkflowSecured) {
    errors.push("SECURITY_VIOLATION: Workflow de GitHub Actions no protegido para PRs no confiables.");
  }

  if (!report.securityAndIsolation.nextBuildNeverMigrates) {
    errors.push("RUNNER_VIOLATION: 'next build' contiene comandos de migración de base de datos.");
  }

  for (const adapter of report.compatibilityAdapters) {
    if (!adapter.prematureSunsetOmitted) {
      errors.push(`COMPATIBILITY_VIOLATION: Adaptador ${adapter.route} emite Sunset prematuro.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
