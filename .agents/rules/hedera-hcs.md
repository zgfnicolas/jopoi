---
trigger: glob
globs: "**/src/server/hedera/**/*.ts, **/scripts/create-topic.ts, **/scripts/maintenance.ts"
description: "Reglas del adaptador Hedera Consensus Service (HCS) en testnet, cuotas, leases y verificación (S09, S10)."
---

# Reglas de Hedera HCS Testnet (S09, S10)

- **SDK y Red:** Utilizar exclusivamente `@hiero-ledger/sdk` conectado a Hedera **testnet**. Prohibido usar mainnet, crear tokens (HTS) o desplegar smart contracts.
- **Firma en servidor (ADR-0002):** El servidor Jopói firma los mensajes con `HEDERA_OPERATOR_ID` y `HEDERA_OPERATOR_KEY` (formato DER hexadecimal).
- **Cinco hitos por recorrido exitoso:** Solo generan transacciones HCS: publicación, aprobación/rechazo, asignación, retiro y recepción conforme/incidencia. Borradores, cambios de rol y consultas QR no envían transacciones.
- **Cuotas y Reintentos (S10):**
  - Respetar el límite global diario UTC (`HCS_DAILY_LIMIT`, por defecto 100) en `HcsDailyQuota`.
  - Máximo 3 intentos `AUTOMATIC` y 1 intento `MANUAL` por evento, coordinados mediante `leaseUntil` para evitar envíos concurrentes.
  - Antes de reenviar un intento `UNCERTAIN`, consultar primero el mirror node para verificar si la transacción previa ya fue consensuada.
- **Estados separados:** Nunca presentar un timeout de red o demora del mirror node como confirmación (`CONFIRMED`) ni como reversión del estado SQL.
