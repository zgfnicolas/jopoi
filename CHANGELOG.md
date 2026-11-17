# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo siguiendo el formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado
- Configuración avanzada del repositorio para Antigravity CLI (`agy`):
  - `AGENTS.md` (fuente única < 130 líneas) y `GEMINI.md` con instrucciones específicas de planificación y subagentes.
  - Punteros multi-herramienta `CLAUDE.md` y `.github/copilot-instructions.md`.
  - Seis reglas modulares en `.agents/rules/` con `trigger: glob` (`domain-and-operations`, `server-api-and-security`, `database-and-prisma`, `hedera-hcs`, `frontend-ui-and-a11y`, `testing-and-acceptance`).
  - Tres subagentes revisores de solo lectura en `.agents/agents/` (`code-reviewer`, `security-sql-auditor`, `ui-a11y-reviewer`).
  - Hooks de ciclo de vida en `.agents/hooks.json` y `scripts/hooks/` (`protect-jopoi.sh` y `post-edit-ui.sh`).
  - Curación de skills en `.agents/skills.json` y nuevo skill `.agents/skills/jopoi-verify/SKILL.md`.
  - Plantilla de permisos y sandbox en `docs/antigravity-settings.example.json`.
  - Tres nuevas skills especializadas en `.agents/skills/`: `js-project-configuration`, `identity-sessions-authorization` y `api-engineering-python-ts`.
  - Pipeline reproducible en `.github/workflows/ci.yml` y actualizaciones automatizadas con cooldown en `.github/dependabot.yml`.
- Documentación de gestión y contribución: `CONTRIBUTING.md`, `CHANGELOG.md`, `.github/pull_request_template.md`, `docs/plans/README.md`, `docs/arquitectura-seguridad-y-apis.md` e Inicio rápido en `README.md`.

### Cambiado
- Endurecimiento de supply chain en `.npmrc` (`engine-strict=true`, `strict-peer-deps=true`, `min-release-age=3`) y `package.json` (`engines` y `devEngines` compatibles con Node 24 y 26 LTS, `allowScripts`, scripts `audit:deps`, `audit:signatures`, `check`), además de compatibilidad LTS 24/26 en `src/server/delivery/preflight.ts`.
- Actualizado `.gitignore` para incluir `secrets/`.

### Seguridad
- Reforzada la defensa CSRF en `src/server/http.ts` (`requireBrowserMutation`) incorporando validación Fetch Metadata (`Sec-Fetch-Site`) junto con `Origin`, `X-Jopoi-Request` y `Content-Type`, con nuevos casos negativos en `tests/api/seguridad.test.ts`.

## [0.1.0] - 2026-10-29

### Agregado
- Especificaciones S01–S18 e implementación del prototipo Jopói en arquitectura de 5 capas (`app`, `components`/`frontend`, `shared`, `domain`, `server`).
- Dominio puro para lote de chips forestales, compatibilidad de viajes de retorno, aritmética exacta (`BigInt` en gramos y centésimas de humedad) y máquina de estados (`DRAFT` → `PUBLISHED` → `APPROVED` → `ASSIGNED` → `PICKED_UP` → `RECEIVED` | `REJECTED` | `INCIDENT`).
- Persistencia SQL en PostgreSQL con Prisma, control optimista por versión y recibos de idempotencia transaccionales.
- Sesiones anónimas de 24 h con cookie `HttpOnly` firmada por HMAC y límite de 3 recorridos por sesión.
- Formulario real de solicitud de demo (`Book a demo`) y exportación privada en CSV para Excel.
- Eventos canónicos v1 (JCS RFC 8785 + SHA-256), adaptador Hedera HCS testnet (`@hiero-ledger/sdk`), cuota global diaria UTC (100 envíos), coordinación con leases (3 intentos automáticos + 1 manual) y mantenimiento diario.
- Vista y API pública de trazabilidad (`/trazabilidad/[traceId]`) con código QR compartible de solo lectura y contraste explícito con mirror node.
- Suites de verificación API (`Vitest`), CLI (`node --test`), tokens UI y pruebas E2E de navegador (`Playwright`), junto con herramientas de chequeo offline y aceptación.

### Cambiado
- **S19:** Soporte para persistencia PostgreSQL gestionada nativamente desde Vercel Marketplace (`DATABASE_URL_UNPOOLED`) y evidencia v2 de proyecto vinculado.
- **S20:** Sistema visual de ficha de abastecimiento industrial, temas claro/oscuro, HTML semántico, accesibilidad WCAG 2.2 AA y SEO.

### Seguridad
- **S21:** Endurecimiento de sesiones, rate limiting compartido en PostgreSQL (`RequestRateLimitBucket`), TLS `sslmode=verify-full` fuera de loopback, zona horaria UTC y auditoría SQL privada.
