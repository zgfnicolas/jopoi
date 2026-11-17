---
trigger: glob
globs: "**/tests/**/*.ts, **/playwright.config.ts, **/vitest.config.ts, **/scripts/acceptance.ts, **/scripts/s21-*.ts"
description: "Fronteras de prueba (API pública, CLI y navegador E2E) y separación entre evidencia local y remota (S17, S18, S21)."
---

# Reglas de Pruebas y Aceptación (S17, S18, S21)

- **Fronteras de prueba:** Testear a través de los contratos HTTP de la API (`tests/api/`), CLI (`tests/cli/`), tokens de UI (`tests/ui/`) y recorridos E2E en navegador (`tests/e2e/`). No escribir tests acoplados a funciones privadas internas.
- **Aislamiento:** Las pruebas de API usan PostgreSQL aislado y proveedores HCS/reloj controlados para ser deterministas y no consumir cuota de testnet.
- **Evidencia honesta:** Nunca declarar aprobados el despliegue en Vercel Hobby, la base gestionada en Neon ni los 5 hitos reales en Hedera testnet basándose únicamente en pruebas locales (`acceptance:check` valida preparación local; `acceptance:live` requiere el entorno remoto real).
