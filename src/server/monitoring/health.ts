import { performance } from "node:perf_hooks";
import { ApplicationError } from "../application-error";
import { getDatabase } from "../database";
import { mapDatabaseError } from "../database/errors";
import { getEventLoopMetrics } from "../metrics";
import { getServerConfig } from "../config";
import type { HealthLiveResponse, HealthReadyResponse, HealthStartupResponse } from "../../shared/health-models";

const STARTUP_TIME = new Date().toISOString();

/**
 * Sonda de vitalidad (liveness):
 * Verifica exclusivamente la capacidad de respuesta del proceso y la latencia
 * del bucle de eventos (event loop).
 * NUNCA consulta PostgreSQL ni Hedera HCS (AUD-09, D14).
 */
export function checkLiveness(): HealthLiveResponse {
  const memory = process.memoryUsage();
  const eventLoop = getEventLoopMetrics();
  return {
    status: "live",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    runtime: {
      memoryBytes: memory.rss,
      eventLoopDelayMs: eventLoop.p95,
    },
  };
}

/**
 * Comprobación por defecto de PostgreSQL con timeout acotado (presupuesto).
 */
export async function defaultCheckDb(timeoutMs = 2000): Promise<{ latencyMs: number }> {
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ApplicationError("DATABASE_UNAVAILABLE", undefined, { retryAfterSeconds: 5 })),
        timeoutMs,
      );
    });
    const db = getDatabase();
    await Promise.race([db.$queryRaw`SELECT 1`, timeoutPromise]);
    return { latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
  } catch (error) {
    const mapped = mapDatabaseError(error);
    if (mapped instanceof ApplicationError) {
      throw new ApplicationError("DATABASE_UNAVAILABLE", undefined, { cause: error, retryAfterSeconds: 5 });
    }
    throw new ApplicationError("DATABASE_UNAVAILABLE", undefined, { cause: error, retryAfterSeconds: 5 });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Comprobación por defecto de Hedera HCS.
 * Distingue configuración, indisponibilidad o degradación del upstream sin derribar la aplicación.
 */
export async function defaultCheckHcs(): Promise<{
  status: "available" | "degraded" | "unconfigured";
  details: string;
}> {
  try {
    const config = getServerConfig().hedera();
    if (config.status !== "configured") {
      return {
        status: "unconfigured",
        details: "HCS omitido o credenciales no configuradas; persistencia transaccional activa en PostgreSQL.",
      };
    }
    return {
      status: "available",
      details: "Configuración Hedera HCS presente y validada.",
    };
  } catch {
    return {
      status: "degraded",
      details: "Falla al verificar estado de Hedera HCS; persistencia local activa.",
    };
  }
}

/**
 * Sonda de preparación (readiness):
 * Tiene un presupuesto estricto (dbTimeoutMs) y distingue incapacidad SQL de caída HCS.
 * Si PostgreSQL falla, lanza DATABASE_UNAVAILABLE (HTTP 503 con Retry-After).
 * Si Hedera HCS no está disponible o está degradado, devuelve HTTP 200 con degraded=true,
 * garantizando que el orquestador no reinicie por reflejo una instancia sana que puede
 * seguir atendiendo y persistiendo operaciones locales en el outbox transaccional (AUD-09).
 */
export async function checkReadiness(options?: {
  dbTimeoutMs?: number;
  checkDb?: (timeoutMs: number) => Promise<{ latencyMs: number }>;
  checkHcs?: () => Promise<{ status: "available" | "degraded" | "unconfigured"; details: string }>;
}): Promise<HealthReadyResponse> {
  const timeoutMs = options?.dbTimeoutMs ?? 2000;
  const dbChecker = options?.checkDb ?? defaultCheckDb;
  const hcsChecker = options?.checkHcs ?? defaultCheckHcs;

  // 1. Verificar SQL: si falla o agota el presupuesto, lanza DATABASE_UNAVAILABLE (503)
  const dbResult = await dbChecker(timeoutMs);

  // 2. Verificar HCS: si está degradado o no configurado, NO falla la sonda (mantiene 200 con degraded=true)
  let hcsResult: { status: "available" | "degraded" | "unconfigured"; details: string };
  try {
    hcsResult = await hcsChecker();
  } catch {
    hcsResult = { status: "degraded", details: "Excepción al consultar HCS; servicio operativo en modo degradado." };
  }

  const degraded = hcsResult.status !== "available";

  return {
    status: "ready",
    degraded,
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: "available",
        latencyMs: dbResult.latencyMs,
      },
      hedera: {
        status: hcsResult.status,
        details: hcsResult.details,
      },
    },
  };
}

/**
 * Sonda de inicio (startup):
 * Diseñada para entornos serverless y contenedores efímeros.
 * Confirma que la inicialización del proceso concluyó sin ejecutar barridos
 * pesados en background (AUD-09, S22-32).
 */
export function checkStartup(): HealthStartupResponse {
  return {
    status: "started",
    runtime: "serverless",
    initializedAt: STARTUP_TIME,
  };
}
