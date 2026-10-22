/** Parámetros acordados; su aplicación durable corresponde a S04 y S10. */
export const DEMO_POLICY = Object.freeze({
  sessionLifetimeSeconds: 24 * 60 * 60,
  maxRunsPerSession: 3,
  hcsDailyLimitDefault: 100,
  hcsDailyLimitMaximum: 100,
  operationalRetentionDays: 7,
  contactRetentionDays: 90,
  maintenanceIntervalDays: 1,
});

export const HEDERA_NETWORK = "testnet" as const;
