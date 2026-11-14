import { logDiagnostic } from "../diagnostics";

export const AVAILABILITY_SLO_TARGET = 0.995;
export const ERROR_BUDGET = 0.005;

export const ALERT_CATALOG = {
  BURN_RATE_CRITICAL: {
    id: "BURN_RATE_CRITICAL",
    name: "Consumo crítico del presupuesto de error (Burn Rate 14.4×)",
    severity: "CRITICAL",
    owner: "@guardia-backend",
    symptom:
      "Tasa de errores 5xx sostenida >= 7.2% en ventanas de 1h y 5m, consumiendo más del 2% del presupuesto de error mensual en una sola hora.",
    triggerCondition: "burnRate1h >= 14.4 && burnRate5m >= 14.4 (tasa de error 5xx >= 7.2%)",
    resolutionCondition: "burnRate1h < 14.4 || burnRate5m < 14.4 (tasa de error 5xx < 7.2%)",
    runbookUrl: "/docs/runbooks/alerta-burn-rate.md",
  },
  BURN_RATE_WARNING: {
    id: "BURN_RATE_WARNING",
    name: "Consumo acelerado del presupuesto de error (Burn Rate 6×)",
    severity: "WARNING",
    owner: "@guardia-backend",
    symptom:
      "Tasa de errores 5xx sostenida >= 3.0% en ventanas de 6h y 30m, consumiendo más del 5% del presupuesto de error mensual en 6 horas.",
    triggerCondition: "burnRate6h >= 6.0 && burnRate30m >= 6.0 (tasa de error 5xx >= 3.0%)",
    resolutionCondition: "burnRate6h < 6.0 || burnRate30m < 6.0 (tasa de error 5xx < 3.0%)",
    runbookUrl: "/docs/runbooks/alerta-burn-rate.md",
  },
  CONSECUTIVE_SERVER_ERRORS: {
    id: "CONSECUTIVE_SERVER_ERRORS",
    name: "Errores de servidor consecutivos en tráfico reducido",
    severity: "WARNING",
    owner: "@guardia-backend",
    symptom:
      "Se registraron 3 o más errores 5xx consecutivos en un período de bajo volumen donde la tasa porcentual no alcanza el umbral de burn rate.",
    triggerCondition: "consecutive5xxCount >= 3",
    resolutionCondition: "consecutive5xxCount === 0 (observación de respuesta exitosa)",
    runbookUrl: "/docs/runbooks/alerta-burn-rate.md",
  },
  DATABASE_UNAVAILABLE: {
    id: "DATABASE_UNAVAILABLE",
    name: "Base de datos PostgreSQL no disponible",
    severity: "CRITICAL",
    owner: "@infraestructura-datos",
    symptom:
      "La sonda de preparación (/api/health/ready) devuelve 503 o las consultas SQL agotan el presupuesto de tiempo.",
    triggerCondition: "databaseStatus !== 'available'",
    resolutionCondition: "databaseStatus === 'available' (ping SQL exitoso)",
    runbookUrl: "/docs/runbooks/alerta-base-datos.md",
  },
  CRON_ABSENT: {
    id: "CRON_ABSENT",
    name: "Mantenimiento periódico ausente",
    severity: "WARNING",
    owner: "@operaciones-cron",
    symptom: "No se registra ejecución exitosa del cron administrativo (/api/cron) en más de 36 horas.",
    triggerCondition: "cronLagMs > 129600000",
    resolutionCondition: "cronLagMs <= 129600000 (ejecución exitosa de cron confirmada)",
    runbookUrl: "/docs/runbooks/alerta-cron-ausente.md",
  },
  RETENTION_DELAYED: {
    id: "RETENTION_DELAYED",
    name: "Retención y eliminación física demorada",
    severity: "WARNING",
    owner: "@operaciones-cron",
    symptom: "Existen registros expirados con antigüedad mayor a 36 horas o categorías de limpieza estancadas.",
    triggerCondition: "oldestExpiredAgeMs > 129600000 || stalledCategories.length > 0",
    resolutionCondition: "oldestExpiredAgeMs <= 129600000 && stalledCategories.length === 0",
    runbookUrl: "/docs/runbooks/alerta-cron-ausente.md",
  },
  HCS_BACKLOG_STALLED: {
    id: "HCS_BACKLOG_STALLED",
    name: "Atraso acumulado en publicaciones Hedera HCS",
    severity: "WARNING",
    owner: "@integracion-hedera",
    symptom:
      "El outbox transaccional acumula más de 10 publicaciones pendientes o el evento más antiguo supera 1 hora sin publicarse.",
    triggerCondition: "pendingPublications > 10 || oldestPendingAgeMs > 3600000",
    resolutionCondition: "pendingPublications <= 10 && oldestPendingAgeMs <= 3600000",
    runbookUrl: "/docs/runbooks/alerta-hedera-atraso.md",
  },
} as const;

export type AlertId = keyof typeof ALERT_CATALOG;

export interface AlertNotification {
  readonly alertId: AlertId;
  readonly alertName: string;
  readonly severity: "CRITICAL" | "WARNING";
  readonly status: "FIRING" | "RESOLVED";
  readonly owner: string;
  readonly symptom: string;
  readonly triggerCondition: string;
  readonly resolutionCondition: string;
  readonly runbookUrl: string;
  readonly timestamp: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface AlertSink {
  send(notification: AlertNotification): Promise<void> | void;
}

export class AuthorizedTestSink implements AlertSink {
  readonly notifications: AlertNotification[] = [];

  send(notification: AlertNotification): void {
    this.notifications.push(notification);
  }

  clear(): void {
    this.notifications.length = 0;
  }
}

export class WebhookAlertSink implements AlertSink {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(notification: AlertNotification): Promise<void> {
    try {
      const response = await this.fetchFn(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notification),
      });
      if (!response.ok) {
        logDiagnostic({
          event: "background.completed",
          outcome: "error",
          code: "INTERNAL_ERROR",
          status: response.status,
          durationMs: 0,
        });
      }
    } catch (error) {
      logDiagnostic({
        event: "background.completed",
        outcome: "error",
        code: "INTERNAL_ERROR",
        status: 500,
        durationMs: 0,
        error: error instanceof Error ? error : undefined,
      });
    }
  }
}

interface RequestSample {
  readonly timestamp: number;
  readonly is5xx: boolean;
}

export interface SystemHealthState {
  databaseStatus: "available" | "unavailable";
  cronLagMs: number | null;
  oldestExpiredAgeMs: number | null;
  stalledCategories: readonly string[];
  pendingPublications: number;
  oldestPendingAgeMs: number;
}

export interface AlertEvaluationReport {
  readonly timestamp: string;
  readonly firingAlerts: readonly AlertId[];
  readonly alertDetails: Readonly<Record<AlertId, { isFiring: boolean; details: Readonly<Record<string, unknown>> }>>;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export class AlertEvaluator {
  private samples: RequestSample[] = [];
  private consecutive5xxCount = 0;
  private systemHealth: SystemHealthState = {
    databaseStatus: "available",
    cronLagMs: null,
    oldestExpiredAgeMs: null,
    stalledCategories: [],
    pendingPublications: 0,
    oldestPendingAgeMs: 0,
  };

  recordRequest(options: { status: number; timestamp?: number }): void {
    const timestamp = options.timestamp ?? Date.now();
    const status = options.status;

    // Exclusiones transparentes (S22 D14, AUD-09):
    // 4xx (errores de validación de cliente, autenticación, rate limits)
    // NO consumen presupuesto de error y se excluyen de la tasa de fallas del servicio.
    if (status >= 400 && status < 500) {
      return;
    }

    const is5xx = status >= 500;
    this.samples.push({ timestamp, is5xx });

    if (is5xx) {
      this.consecutive5xxCount++;
    } else {
      this.consecutive5xxCount = 0;
    }

    // Podar muestras más antiguas que la ventana máxima (6 horas)
    const cutoff = timestamp - SIX_HOURS_MS;
    if (this.samples.length > 5000 || (this.samples[0] && this.samples[0].timestamp < cutoff)) {
      this.samples = this.samples.filter((s) => s.timestamp >= cutoff);
    }
  }

  setSystemHealth(update: Partial<SystemHealthState>): void {
    this.systemHealth = { ...this.systemHealth, ...update };
  }

  reset(): void {
    this.samples = [];
    this.consecutive5xxCount = 0;
    this.systemHealth = {
      databaseStatus: "available",
      cronLagMs: null,
      oldestExpiredAgeMs: null,
      stalledCategories: [],
      pendingPublications: 0,
      oldestPendingAgeMs: 0,
    };
  }

  private calculateWindowRate(
    windowMs: number,
    now: number,
  ): { total: number; errors: number; rate: number; burnRate: number } {
    const cutoff = now - windowMs;
    let total = 0;
    let errors = 0;
    for (const sample of this.samples) {
      if (sample.timestamp >= cutoff) {
        total++;
        if (sample.is5xx) errors++;
      }
    }
    const rate = total > 0 ? errors / total : 0;
    const burnRate = Math.round((rate / ERROR_BUDGET) * 100) / 100;
    return { total, errors, rate, burnRate };
  }

  evaluate(now = Date.now()): AlertEvaluationReport {
    const w5m = this.calculateWindowRate(FIVE_MINUTES_MS, now);
    const w30m = this.calculateWindowRate(THIRTY_MINUTES_MS, now);
    const w1h = this.calculateWindowRate(ONE_HOUR_MS, now);
    const w6h = this.calculateWindowRate(SIX_HOURS_MS, now);

    // 1. Burn Rate Crítico (14.4x en 1h y 5m): consume 2% de error budget en 1 hora
    // Tasa de error requerida >= 7.2% (0.072) con volumen estadísticamente significativo (AUD-09, D14)
    const isCriticalBurnRate = w1h.burnRate >= 14.4 && w5m.burnRate >= 14.4 && w1h.total >= 20 && w5m.total >= 5;

    // 2. Burn Rate Advertencia (6.0x en 6h y 30m): consume 5% de error budget en 6 horas
    // Tasa de error requerida >= 3.0% (0.030) con volumen estadísticamente significativo (AUD-09, D14)
    const isWarningBurnRate = w6h.burnRate >= 6.0 && w30m.burnRate >= 6.0 && w6h.total >= 30 && w30m.total >= 10;

    // 3. Errores consecutivos de servidor en bajo tráfico
    const isConsecutiveErrors = this.consecutive5xxCount >= 3;

    // 4. Base de datos
    const isDatabaseUnavailable = this.systemHealth.databaseStatus !== "available";

    // 5. Cron ausente (> 36 horas = 129_600_000 ms)
    const isCronAbsent = this.systemHealth.cronLagMs !== null && this.systemHealth.cronLagMs > 36 * 3_600_000;

    // 6. Retención demorada (> 36 horas o categorías estancadas)
    const isRetentionDelayed =
      (this.systemHealth.oldestExpiredAgeMs !== null && this.systemHealth.oldestExpiredAgeMs > 36 * 3_600_000) ||
      this.systemHealth.stalledCategories.length > 0;

    // 7. Hedera HCS atraso (> 10 publicaciones o > 1 hora)
    const isHcsStalled = this.systemHealth.pendingPublications > 10 || this.systemHealth.oldestPendingAgeMs > 3_600_000;

    const alertDetails: Record<AlertId, { isFiring: boolean; details: Readonly<Record<string, unknown>> }> = {
      BURN_RATE_CRITICAL: {
        isFiring: isCriticalBurnRate,
        details: {
          burnRate1h: w1h.burnRate,
          burnRate5m: w5m.burnRate,
          errorRate1h: w1h.rate,
          errorRate5m: w5m.rate,
          requests1h: w1h.total,
          requests5m: w5m.total,
        },
      },
      BURN_RATE_WARNING: {
        isFiring: isWarningBurnRate,
        details: {
          burnRate6h: w6h.burnRate,
          burnRate30m: w30m.burnRate,
          errorRate6h: w6h.rate,
          errorRate30m: w30m.rate,
          requests6h: w6h.total,
          requests30m: w30m.total,
        },
      },
      CONSECUTIVE_SERVER_ERRORS: {
        isFiring: isConsecutiveErrors,
        details: {
          consecutiveCount: this.consecutive5xxCount,
        },
      },
      DATABASE_UNAVAILABLE: {
        isFiring: isDatabaseUnavailable,
        details: {
          databaseStatus: this.systemHealth.databaseStatus,
        },
      },
      CRON_ABSENT: {
        isFiring: isCronAbsent,
        details: {
          cronLagMs: this.systemHealth.cronLagMs,
          thresholdMs: 36 * 3_600_000,
        },
      },
      RETENTION_DELAYED: {
        isFiring: isRetentionDelayed,
        details: {
          oldestExpiredAgeMs: this.systemHealth.oldestExpiredAgeMs,
          stalledCategories: this.systemHealth.stalledCategories,
          thresholdMs: 36 * 3_600_000,
        },
      },
      HCS_BACKLOG_STALLED: {
        isFiring: isHcsStalled,
        details: {
          pendingPublications: this.systemHealth.pendingPublications,
          oldestPendingAgeMs: this.systemHealth.oldestPendingAgeMs,
          backlogThreshold: 10,
          ageThresholdMs: 3_600_000,
        },
      },
    };

    const firingAlerts = (Object.keys(alertDetails) as AlertId[]).filter((id) => alertDetails[id].isFiring);

    return {
      timestamp: new Date(now).toISOString(),
      firingAlerts,
      alertDetails,
    };
  }
}

export class AlertDispatcher {
  private activeAlerts = new Set<AlertId>();

  constructor(private readonly options: { sink: AlertSink }) {}

  getActiveAlerts(): readonly AlertId[] {
    return Array.from(this.activeAlerts);
  }

  async dispatch(report: AlertEvaluationReport): Promise<AlertNotification[]> {
    const emitted: AlertNotification[] = [];

    for (const [idStr, catalogEntry] of Object.entries(ALERT_CATALOG)) {
      const alertId = idStr as AlertId;
      const evaluation = report.alertDetails[alertId];
      const isFiring = evaluation.isFiring;
      const wasActive = this.activeAlerts.has(alertId);

      if (isFiring && !wasActive) {
        // Transición: RESOLVED -> FIRING (Alerta activada)
        this.activeAlerts.add(alertId);
        const notification: AlertNotification = {
          alertId,
          alertName: catalogEntry.name,
          severity: catalogEntry.severity,
          status: "FIRING",
          owner: catalogEntry.owner,
          symptom: catalogEntry.symptom,
          triggerCondition: catalogEntry.triggerCondition,
          resolutionCondition: catalogEntry.resolutionCondition,
          runbookUrl: catalogEntry.runbookUrl,
          timestamp: report.timestamp,
          details: evaluation.details,
        };
        await this.options.sink.send(notification);
        emitted.push(notification);
      } else if (!isFiring && wasActive) {
        // Transición: FIRING -> RESOLVED (Alerta resuelta)
        this.activeAlerts.delete(alertId);
        const notification: AlertNotification = {
          alertId,
          alertName: catalogEntry.name,
          severity: catalogEntry.severity,
          status: "RESOLVED",
          owner: catalogEntry.owner,
          symptom: catalogEntry.symptom,
          triggerCondition: catalogEntry.triggerCondition,
          resolutionCondition: catalogEntry.resolutionCondition,
          runbookUrl: catalogEntry.runbookUrl,
          timestamp: report.timestamp,
          details: evaluation.details,
        };
        await this.options.sink.send(notification);
        emitted.push(notification);
      }
    }

    return emitted;
  }
}
