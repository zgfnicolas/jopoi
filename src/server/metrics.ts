import { monitorEventLoopDelay } from "node:perf_hooks";
import packageInfo from "../../package.json" with { type: "json" };

export const CLEANUP_METRIC_CATEGORIES = ["rateBuckets", "runs", "contacts", "sessions", "quotas", "leases"] as const;
export type CleanupMetricCategory = (typeof CLEANUP_METRIC_CATEGORIES)[number];
export const RETENTION_TARGET_MS = 36 * 3_600_000;
export const EXTERNAL_CAPACITY_SLOTS = 2;

export const CLOSED_METHODS = ["GET", "POST", "PATCH", "DELETE", "other"] as const;
export type ClosedMethod = (typeof CLOSED_METHODS)[number];

export const CLOSED_STATUS_CLASSES = ["2xx", "3xx", "4xx", "5xx", "other"] as const;
export type ClosedStatusClass = (typeof CLOSED_STATUS_CLASSES)[number];

export const CLOSED_ROUTES = [
  "/api/demo/session",
  "/api/demo/runs",
  "/api/demo/runs/reset",
  "/api/demo/runs/current",
  "/api/demo/runs/:traceId",
  "/api/demo/runs/:traceId/operation",
  "/api/demo/runs/:traceId/commands",
  "/api/traces/:traceId",
  "/api/traces/:traceId/events/:eventId/verification",
  "/api/v1/traces/:traceId",
  "/api/v1/traces/:traceId/events/:eventId/verification",
  "/api/demo/runs/:traceId/events/:eventId/retry",
  "/api/demo-requests",
  "/api/cron",
  "/api/health/live",
  "/api/health/ready",
  "/api/health/startup",
  "other",
] as const;
export type ClosedRoute = (typeof CLOSED_ROUTES)[number];

export const LATENCY_BUCKETS = [10, 25, 50, 100, 250, 500, 750, 1000, 1500, 2500, 5000, 10000] as const;
export type LatencyBucket = (typeof LATENCY_BUCKETS)[number];

export function normalizeRoute(rawRoute: string | null | undefined): ClosedRoute {
  if (typeof rawRoute !== "string" || rawRoute.length === 0) return "other";
  for (const known of CLOSED_ROUTES) {
    if (rawRoute === known) return known;
  }
  // Parameterized pattern normalizer: strictly prevents dynamic IDs, UUIDs, or queries from multiplying labels
  if (rawRoute.startsWith("/api/demo/runs/") && rawRoute.endsWith("/commands")) {
    return "/api/demo/runs/:traceId/commands";
  }
  if (rawRoute.startsWith("/api/demo/runs/") && rawRoute.endsWith("/operation")) {
    return "/api/demo/runs/:traceId/operation";
  }
  if (rawRoute.startsWith("/api/demo/runs/") && rawRoute.includes("/events/") && rawRoute.endsWith("/retry")) {
    return "/api/demo/runs/:traceId/events/:eventId/retry";
  }
  if (rawRoute.startsWith("/api/demo/runs/") && !rawRoute.slice("/api/demo/runs/".length).includes("/")) {
    return "/api/demo/runs/:traceId";
  }
  if (rawRoute.startsWith("/api/traces/") && rawRoute.includes("/events/") && rawRoute.endsWith("/verification")) {
    return "/api/traces/:traceId/events/:eventId/verification";
  }
  if (rawRoute.startsWith("/api/v1/traces/") && rawRoute.includes("/events/") && rawRoute.endsWith("/verification")) {
    return "/api/v1/traces/:traceId/events/:eventId/verification";
  }
  if (rawRoute.startsWith("/api/traces/") && !rawRoute.slice("/api/traces/".length).includes("/")) {
    return "/api/traces/:traceId";
  }
  if (rawRoute.startsWith("/api/v1/traces/") && !rawRoute.slice("/api/v1/traces/".length).includes("/")) {
    return "/api/v1/traces/:traceId";
  }
  return "other";
}

export function normalizeMethod(rawMethod: string | null | undefined): ClosedMethod {
  if (typeof rawMethod !== "string") return "other";
  const upper = rawMethod.toUpperCase();
  if (upper === "GET" || upper === "POST" || upper === "PATCH" || upper === "DELETE") {
    return upper;
  }
  return "other";
}

export function statusToClass(status: number | undefined): ClosedStatusClass {
  if (typeof status !== "number" || !Number.isInteger(status)) return "other";
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}

export interface DurationSummary {
  readonly count: number;
  readonly sum: number;
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export class DurationHistogram {
  readonly bucketCounts: number[] = new Array(LATENCY_BUCKETS.length + 1).fill(0);
  count = 0;
  sum = 0;
  min = Number.POSITIVE_INFINITY;
  max = 0;

  record(durationMs: number): void {
    const value = Math.max(0, durationMs);
    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;

    let placed = false;
    for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
      const boundary = LATENCY_BUCKETS[i]!;
      if (value <= boundary) {
        this.bucketCounts[i] = (this.bucketCounts[i] ?? 0) + 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      this.bucketCounts[LATENCY_BUCKETS.length] = (this.bucketCounts[LATENCY_BUCKETS.length] ?? 0) + 1;
    }
  }

  percentile(p: number): number {
    if (this.count === 0) return 0;
    if (p <= 0) return this.min === Number.POSITIVE_INFINITY ? 0 : Math.round(this.min * 10) / 10;
    if (p >= 100) return Math.round(this.max * 10) / 10;

    const rank = (p / 100) * this.count;
    let accumulated = 0;

    for (let i = 0; i <= LATENCY_BUCKETS.length; i++) {
      const bucketCount = this.bucketCounts[i]!;
      accumulated += bucketCount;
      if (accumulated >= rank) {
        const prevCount = accumulated - bucketCount;
        const lowerBound = i === 0 ? 0 : LATENCY_BUCKETS[i - 1]!;
        const upperBound = i < LATENCY_BUCKETS.length ? LATENCY_BUCKETS[i]! : Math.max(10000, this.max);
        if (bucketCount === 0) return lowerBound;
        const fraction = (rank - prevCount) / bucketCount;
        const estimated = lowerBound + fraction * (upperBound - lowerBound);
        return Math.round(estimated * 10) / 10;
      }
    }
    return Math.round(this.max * 10) / 10;
  }

  summary(): DurationSummary {
    return {
      count: this.count,
      sum: Math.round(this.sum * 10) / 10,
      avg: this.count > 0 ? Math.round((this.sum / this.count) * 10) / 10 : 0,
      min: this.min === Number.POSITIVE_INFINITY ? 0 : Math.round(this.min * 10) / 10,
      max: Math.round(this.max * 10) / 10,
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
    };
  }

  reset(): void {
    this.bucketCounts.fill(0);
    this.count = 0;
    this.sum = 0;
    this.min = Number.POSITIVE_INFINITY;
    this.max = 0;
  }
}

interface RouteSeries {
  readonly route: ClosedRoute;
  readonly method: ClosedMethod;
  readonly statusClass: ClosedStatusClass;
  requests: number;
  errors: number;
  readonly histogram: DurationHistogram;
}

// Bounded in-memory registry: maximum keys = 15 routes * 5 methods * 5 statusClasses = 375 keys.
const seriesRegistry = new Map<string, RouteSeries>();

export interface RecordHttpMetricInput {
  readonly method: string | null | undefined;
  readonly route: string | null | undefined;
  readonly status?: number | undefined;
  readonly durationMs: number;
  readonly code?: string | undefined;
  readonly outcome?: string | undefined;
}

export function recordHttpMetric(input: RecordHttpMetricInput): void {
  const method = normalizeMethod(input.method);
  const route = normalizeRoute(input.route);
  const statusClass = statusToClass(input.status);
  const key = `${method}:${route}:${statusClass}`;

  let series = seriesRegistry.get(key);
  if (!series) {
    series = {
      route,
      method,
      statusClass,
      requests: 0,
      errors: 0,
      histogram: new DurationHistogram(),
    };
    seriesRegistry.set(key, series);
  }

  series.requests++;
  if (statusClass === "5xx" || input.outcome === "error") {
    series.errors++;
  }
  series.histogram.record(input.durationMs);
}

// USE: Database Pool Capacity Model (D17, AUD-12)
export const POOL_CAPACITY_SPEC = Object.freeze({
  perInstanceMax: 2,
  perInstanceMin: 0,
  connectionTimeoutMs: 3000,
  idleTimeoutMs: 10000,
  statementTimeoutMs: 5000,
  queryTimeoutMs: 5500,
  documentedMaxInstances: 8,
  documentedReservedConnections: 4,
  calculatedGlobalLimit: 20, // 8 * 2 + 4
  formula: "max_instances * per_instance_max + reserved_connections",
});

const poolWaitHistogram = new DurationHistogram();
let poolErrorsCount = 0;
let connectionErrorsCount = 0;

export function recordPoolWait(waitMs: number): void {
  poolWaitHistogram.record(waitMs);
}

export function recordPoolError(type: "pool" | "connection"): void {
  if (type === "pool") {
    poolErrorsCount++;
  } else {
    connectionErrorsCount++;
  }
}

// USE: Node.js Runtime (Memory & Event Loop)
let eventLoopMonitor: ReturnType<typeof monitorEventLoopDelay> | null = null;

export function getEventLoopMetrics() {
  if (!eventLoopMonitor) {
    try {
      eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
      eventLoopMonitor.enable();
    } catch {
      return { p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
    }
  }
  const toMs = (nanos: number) => Math.round((nanos / 1e6) * 100) / 100;
  return {
    p50: toMs(eventLoopMonitor.percentile(50)),
    p95: toMs(eventLoopMonitor.percentile(95)),
    p99: toMs(eventLoopMonitor.percentile(99)),
    max: toMs(eventLoopMonitor.max),
    mean: Number.isFinite(eventLoopMonitor.mean) ? toMs(eventLoopMonitor.mean) : 0,
  };
}

function getMemoryMetrics() {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external,
  };
}

// USE: External Capacity Permits (D15, AUD-17)
let externalPermitsAcquired = 0;
let externalSaturationRejections = 0;
let externalClaimConflicts = 0;

export function recordExternalCapacityAcquire(success: boolean, conflict = false): void {
  if (conflict) {
    externalClaimConflicts++;
  }
  if (success) {
    externalPermitsAcquired++;
  } else {
    externalSaturationRejections++;
  }
}

// Business Metrics: Actions, Replays, Conflicts, Uncertainty
let actionsCommittedCount = 0;
let replaysCount = 0;
let conflictsCount = 0;
let uncertainTransactionsCount = 0;

export function recordActionCommitted(): void {
  actionsCommittedCount++;
}

export function recordReplay(): void {
  replaysCount++;
}

export function recordConflict(): void {
  conflictsCount++;
}

export function recordUncertainTransaction(): void {
  uncertainTransactionsCount++;
}

// Business: Maintenance & Backlog State
export interface MaintenanceMetricsState {
  lastCompletedAt: string | null | undefined;
  lastPartialAt: string | null | undefined;
  oldestExpiredAgeMs: number | null | undefined;
  withinRetentionTarget: boolean | undefined;
  stalledCategories: readonly string[] | undefined;
  cleanedByCategory: Record<string, number>;
}

const maintenanceState: MaintenanceMetricsState = {
  lastCompletedAt: null,
  lastPartialAt: null,
  oldestExpiredAgeMs: null,
  withinRetentionTarget: true,
  stalledCategories: [],
  cleanedByCategory: Object.fromEntries(CLEANUP_METRIC_CATEGORIES.map((c) => [c, 0])),
};

export function updateMaintenanceMetrics(
  update: Partial<MaintenanceMetricsState> & { counts?: Readonly<Record<string, number>> | undefined },
): void {
  if (update.lastCompletedAt !== undefined) maintenanceState.lastCompletedAt = update.lastCompletedAt;
  if (update.lastPartialAt !== undefined) maintenanceState.lastPartialAt = update.lastPartialAt;
  if (update.oldestExpiredAgeMs !== undefined) maintenanceState.oldestExpiredAgeMs = update.oldestExpiredAgeMs;
  if (update.withinRetentionTarget !== undefined) maintenanceState.withinRetentionTarget = update.withinRetentionTarget;
  if (update.stalledCategories !== undefined) maintenanceState.stalledCategories = update.stalledCategories;
  if (update.counts) {
    for (const [key, value] of Object.entries(update.counts)) {
      if (typeof value === "number") {
        maintenanceState.cleanedByCategory[key] = (maintenanceState.cleanedByCategory[key] ?? 0) + value;
      }
    }
  }
}

interface OperationalBacklog {
  hcsQuota: {
    limit: number | null;
    used: number;
    remaining: number | null;
    resetsAt: string | null;
  };
  publications: {
    pendingCount: number;
    oldestPendingAgeMs: number;
  };
}

let lastObservedBacklog: OperationalBacklog = {
  hcsQuota: { limit: 100, used: 0, remaining: 100, resetsAt: null },
  publications: { pendingCount: 0, oldestPendingAgeMs: 0 },
};

export function updateOperationalBacklog(backlog: Partial<OperationalBacklog>): void {
  if (backlog.hcsQuota) {
    lastObservedBacklog.hcsQuota = { ...lastObservedBacklog.hcsQuota, ...backlog.hcsQuota };
  }
  if (backlog.publications) {
    lastObservedBacklog.publications = { ...lastObservedBacklog.publications, ...backlog.publications };
  }
}

export interface RouteMetricsSummary {
  readonly route: ClosedRoute;
  readonly requests: number;
  readonly errors: number;
  readonly errorRate: number;
  readonly latencyMs: DurationSummary;
}

export interface RedSummary {
  readonly totalRequests: number;
  readonly totalErrors: number;
  readonly errorRate: number;
  readonly latencyMs: DurationSummary;
}

export interface MetricsReport {
  readonly schemaVersion: 1;
  readonly service: {
    readonly name: "jopoi";
    readonly version: string;
    readonly environment: string;
  };
  readonly timestamp: string;
  readonly uptimeSeconds: number;
  readonly red: {
    readonly summary: RedSummary;
    readonly byRoute: Record<string, RouteMetricsSummary>;
  };
  readonly use: {
    readonly pool: {
      readonly perInstance: {
        readonly max: number;
        readonly min: number;
        readonly timeoutMs: number;
        readonly waitMs: DurationSummary;
      };
      readonly globalCapacity: {
        readonly perInstanceMax: number;
        readonly estimatedMaxInstances: number;
        readonly reservedConnections: number;
        readonly calculatedGlobalLimit: number;
        readonly formula: string;
      };
      readonly errors: {
        readonly poolErrors: number;
        readonly connectionErrors: number;
      };
    };
    readonly runtime: {
      readonly memoryBytes: {
        readonly heapUsed: number;
        readonly heapTotal: number;
        readonly rss: number;
        readonly external: number;
      };
      readonly eventLoopDelayMs: {
        readonly p50: number;
        readonly p95: number;
        readonly p99: number;
        readonly max: number;
        readonly mean: number;
      };
    };
    readonly externalCapacity: {
      readonly slots: number;
      readonly acquiredTotal: number;
      readonly saturationRejections: number;
      readonly conflicts: number;
    };
  };
  readonly business: {
    readonly actionsCommitted: number;
    readonly replays: number;
    readonly conflicts: number;
    readonly uncertainTransactions: number;
    readonly hcsQuota: {
      readonly limit: number | null;
      readonly used: number;
      readonly remaining: number | null;
      readonly resetsAt: string | null;
    };
    readonly publications: {
      readonly pendingCount: number;
      readonly oldestPendingAgeMs: number;
    };
    readonly maintenance: {
      readonly lastCompletedAt: string | null;
      readonly lastPartialAt: string | null;
      readonly cronLagMs: number | null;
      readonly oldestExpiredAgeMs: number | null;
      readonly withinRetentionTarget: boolean;
      readonly stalledCategories: readonly string[];
      readonly cleanedByCategory: Record<string, number>;
    };
  };
  readonly sloIndicators: {
    readonly availability: {
      readonly eligibleRequests: number;
      readonly serverErrors: number;
      readonly errorRate: number;
      readonly sloTarget: number;
      readonly withinSlo: boolean;
    };
    readonly latencyHot: {
      readonly p95Ms: number;
      readonly p99Ms: number;
      readonly p95TargetMs: number;
      readonly p99TargetMs: number;
      readonly p95WithinSlo: boolean;
      readonly p99WithinSlo: boolean;
    };
    readonly maintenance: {
      readonly retentionTargetMs: number;
      readonly oldestExpiredAgeMs: number | null;
      readonly withinRetentionTarget: boolean;
      readonly cronExpectedWithinMs: number;
      readonly cronLagMs: number | null;
      readonly cronHealthy: boolean;
    };
  };
}

export function exportMetricsReport(now = new Date()): MetricsReport {
  let totalRequests = 0;
  let totalErrors = 0;
  const overallHistogram = new DurationHistogram();

  const byRouteRecord: Record<string, RouteMetricsSummary> = {};
  const routeGroups = new Map<ClosedRoute, { requests: number; errors: number; histogram: DurationHistogram }>();

  for (const series of seriesRegistry.values()) {
    totalRequests += series.requests;
    totalErrors += series.errors;
    overallHistogram.count += series.histogram.count;
    overallHistogram.sum += series.histogram.sum;
    if (series.histogram.min < overallHistogram.min) overallHistogram.min = series.histogram.min;
    if (series.histogram.max > overallHistogram.max) overallHistogram.max = series.histogram.max;
    for (let i = 0; i <= LATENCY_BUCKETS.length; i++) {
      overallHistogram.bucketCounts[i] = (overallHistogram.bucketCounts[i] ?? 0) + (series.histogram.bucketCounts[i] ?? 0);
    }

    let group = routeGroups.get(series.route);
    if (!group) {
      group = { requests: 0, errors: 0, histogram: new DurationHistogram() };
      routeGroups.set(series.route, group);
    }
    group.requests += series.requests;
    group.errors += series.errors;
    group.histogram.count += series.histogram.count;
    group.histogram.sum += series.histogram.sum;
    if (series.histogram.min < group.histogram.min) group.histogram.min = series.histogram.min;
    if (series.histogram.max > group.histogram.max) group.histogram.max = series.histogram.max;
    for (let i = 0; i <= LATENCY_BUCKETS.length; i++) {
      group.histogram.bucketCounts[i] = (group.histogram.bucketCounts[i] ?? 0) + (series.histogram.bucketCounts[i] ?? 0);
    }
  }

  for (const [route, group] of routeGroups.entries()) {
    byRouteRecord[route] = {
      route,
      requests: group.requests,
      errors: group.errors,
      errorRate: group.requests > 0 ? Math.round((group.errors / group.requests) * 1000) / 1000 : 0,
      latencyMs: group.histogram.summary(),
    };
  }

  const redSummary: RedSummary = {
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 1000) / 1000 : 0,
    latencyMs: overallHistogram.summary(),
  };

  const cronLag = maintenanceState.lastCompletedAt
    ? Math.max(0, now.getTime() - new Date(maintenanceState.lastCompletedAt).getTime())
    : null;

  const eligibleRequests = totalRequests;
  const availabilityErrorRate = eligibleRequests > 0 ? totalErrors / eligibleRequests : 0;
  const p95 = redSummary.latencyMs.p95;
  const p99 = redSummary.latencyMs.p99;

  return {
    schemaVersion: 1,
    service: {
      name: "jopoi",
      version: packageInfo.version,
      environment: process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development",
    },
    timestamp: now.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    red: {
      summary: redSummary,
      byRoute: byRouteRecord,
    },
    use: {
      pool: {
        perInstance: {
          max: POOL_CAPACITY_SPEC.perInstanceMax,
          min: POOL_CAPACITY_SPEC.perInstanceMin,
          timeoutMs: POOL_CAPACITY_SPEC.connectionTimeoutMs,
          waitMs: poolWaitHistogram.summary(),
        },
        globalCapacity: {
          perInstanceMax: POOL_CAPACITY_SPEC.perInstanceMax,
          estimatedMaxInstances: POOL_CAPACITY_SPEC.documentedMaxInstances,
          reservedConnections: POOL_CAPACITY_SPEC.documentedReservedConnections,
          calculatedGlobalLimit: POOL_CAPACITY_SPEC.calculatedGlobalLimit,
          formula: POOL_CAPACITY_SPEC.formula,
        },
        errors: {
          poolErrors: poolErrorsCount,
          connectionErrors: connectionErrorsCount,
        },
      },
      runtime: {
        memoryBytes: getMemoryMetrics(),
        eventLoopDelayMs: getEventLoopMetrics(),
      },
      externalCapacity: {
        slots: EXTERNAL_CAPACITY_SLOTS,
        acquiredTotal: externalPermitsAcquired,
        saturationRejections: externalSaturationRejections,
        conflicts: externalClaimConflicts,
      },
    },
    business: {
      actionsCommitted: actionsCommittedCount,
      replays: replaysCount,
      conflicts: conflictsCount,
      uncertainTransactions: uncertainTransactionsCount,
      hcsQuota: lastObservedBacklog.hcsQuota,
      publications: lastObservedBacklog.publications,
      maintenance: {
        lastCompletedAt: maintenanceState.lastCompletedAt ?? null,
        lastPartialAt: maintenanceState.lastPartialAt ?? null,
        cronLagMs: cronLag,
        oldestExpiredAgeMs: maintenanceState.oldestExpiredAgeMs ?? null,
        withinRetentionTarget: maintenanceState.withinRetentionTarget ?? true,
        stalledCategories: maintenanceState.stalledCategories ?? [],
        cleanedByCategory: { ...maintenanceState.cleanedByCategory },
      },
    },
    sloIndicators: {
      availability: {
        eligibleRequests,
        serverErrors: totalErrors,
        errorRate: Math.round(availabilityErrorRate * 10000) / 10000,
        sloTarget: 0.995,
        withinSlo: availabilityErrorRate <= 0.005,
      },
      latencyHot: {
        p95Ms: p95,
        p99Ms: p99,
        p95TargetMs: 750,
        p99TargetMs: 1500,
        p95WithinSlo: p95 === 0 || p95 <= 750,
        p99WithinSlo: p99 === 0 || p99 <= 1500,
      },
      maintenance: {
        retentionTargetMs: RETENTION_TARGET_MS,
        oldestExpiredAgeMs: maintenanceState.oldestExpiredAgeMs ?? null,
        withinRetentionTarget: maintenanceState.withinRetentionTarget ?? true,
        cronExpectedWithinMs: RETENTION_TARGET_MS,
        cronLagMs: cronLag,
        cronHealthy: cronLag === null || cronLag <= RETENTION_TARGET_MS,
      },
    },
  };
}

export function getMetricsSnapshot(now?: Date): MetricsReport {
  return exportMetricsReport(now);
}

export function getCardinalityStats(): { seriesCount: number; maxPossibleSeries: number; isBounded: boolean } {
  const maxPossible = CLOSED_ROUTES.length * CLOSED_METHODS.length * CLOSED_STATUS_CLASSES.length;
  return {
    seriesCount: seriesRegistry.size,
    maxPossibleSeries: maxPossible,
    isBounded: seriesRegistry.size <= maxPossible,
  };
}

export function resetMetricsForTests(): void {
  seriesRegistry.clear();
  poolWaitHistogram.reset();
  poolErrorsCount = 0;
  connectionErrorsCount = 0;
  externalPermitsAcquired = 0;
  externalSaturationRejections = 0;
  externalClaimConflicts = 0;
  actionsCommittedCount = 0;
  replaysCount = 0;
  conflictsCount = 0;
  uncertainTransactionsCount = 0;
  maintenanceState.lastCompletedAt = null;
  maintenanceState.lastPartialAt = null;
  maintenanceState.oldestExpiredAgeMs = null;
  maintenanceState.withinRetentionTarget = true;
  maintenanceState.stalledCategories = [];
  maintenanceState.cleanedByCategory = Object.fromEntries(CLEANUP_METRIC_CATEGORIES.map((c) => [c, 0]));
  lastObservedBacklog = {
    hcsQuota: { limit: 100, used: 0, remaining: 100, resetsAt: null },
    publications: { pendingCount: 0, oldestPendingAgeMs: 0 },
  };
  if (eventLoopMonitor) {
    try {
      eventLoopMonitor.reset();
    } catch {
      // ignore
    }
  }
}
