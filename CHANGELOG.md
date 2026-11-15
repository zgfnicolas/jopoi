# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [Sin publicar]

### Agregado
- Reestructuración canónica de la suite de documentación bajo el estándar de 4 ejes + agentes de IA (`docs/prd.md`, `docs/sad.md`, `docs/roles.md`, `docs/business_rules.md`, `docs/data_model.md`, `docs/roadmap.md`).
- Adopción formal de la licencia MIT y archivo `LICENSE`.
- Directrices para contribuidores en `CONTRIBUTING.md` y plantillas de GitHub en `.github/`.
- Documento `AGENTS.md` adaptado a la especificación abierta de Linux Foundation (< 150 líneas) y punteros `CLAUDE.md` y `.github/copilot-instructions.md`.

---

## [0.22.0] - 2026-11-15

### Agregado
- Implementación completa de los 32 tickets de la especificación S22 (Profesionalización integral y confiabilidad).
- Monitoreo de RUM privado y percentiles reales sin proveedores de telemetría de terceros ni fuga de privacidad.
- Definición formal de SLOs, presupuestos de error y alertas correlacionadas con runbooks operativos en `docs/runbooks/`.
- Ensayo de capacidad, saturación de conexiones y límites de concurrencia en pool de Neon.
- Procedimiento validado de rollout y restauración sin pérdida de datos (DRP).
- Scripts de automatización para puertas de calidad y matrices de release (`scripts/release-gate.ts`, `scripts/candidate-acceptance.ts`, `scripts/field-acceptance.ts`).
- Negociación de errores conforme al estándar RFC-7807/9457 (Problem Details) y validación OpenAPI 3.2.

### Cambiado
- Perfil global de TypeScript unificado a máxima rigurosidad en todo el repositorio.
- Proyecciones de base de datos optimizadas con streaming seguro y control de deadlines HTTP.

### Seguridad
- Rotación y expiración estricta de cookies de sesión con prefijo `__Host-` y protección CSRF tokenizada.
- Auditoría SQL y registro correlacionado de trazas W3C TraceContext para depuración segura.

---

## [0.21.0] - 2026-10-30

### Agregado
- Control de concurrencia optimista mediante cabeceras `ETag` y validación de idempotencia con `Idempotency-Key`.
- Mecanismo de límite de tasa (*rate limiting*) en memoria y persistido por ventana temporal.
- Registro transaccional privado previo a cualquier emisión de red pública (patrón Outbox).

### Corregido
- Prevención de condiciones de carrera en la asignación simultánea de transporte.

---

## [0.20.0] - 2026-10-28

### Agregado
- Sistema de diseño normativo documentado en `DESIGN.md` con tokens CSS semánticos.
- Soporte nativo para modo Claro y modo Oscuro con persistencia en localStorage y bootstrap estático anti-parpadeo.
- Conformidad de contraste WCAG 2.1 nivel AA comprobada mediante suite automatizada `tokens.test.ts`.

---

## [0.19.0] - 2026-10-28

### Agregado
- Integración nativa de base de datos PostgreSQL gestionada desde Vercel Marketplace (Neon Serverless).
- Migraciones Prisma portables y tipado seguro generado en cliente.

---

## [0.18.0] - 2026-10-27

### Agregado
- Suite de pruebas de extremo a extremo (E2E) con Playwright en Chromium de escritorio y emulación WebKit móvil.
- Pruebas del recorrido completo del panel y lectura pública de código QR.

---

## [0.1.0] - 2026-10-22

### Agregado
- Lanzamiento inicial del prototipo de coordinación B2B para biomasa y chips forestales (Santa Rosa, Corrientes).
- Motor de cálculo logístico de aprovechamiento de fletes de retorno.
- Integración con Hedera Consensus Service (HCS) testnet con firma de servidor mediante hash RFC-8785 (JCS) + SHA-256.
- Panel guiado con 4 roles simulados (Generador, Coordinador, Transportista, Comprador) y máquina de estados de 8 pasos.
- Formulario de contacto comercial para solicitud de demostración.
