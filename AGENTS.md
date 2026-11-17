<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Jopói

## Proyecto
Prototipo personal B2B de coordinación de subproductos forestales (chips sin tratar) y transporte de retorno en Corrientes, con trazabilidad real en Hedera Consensus Service (HCS) testnet.
- Fuente vigente de alcance y reglas: @docs/alcance-demo.md
- Glosario de dominio obligatorio: @GLOSSARY.md
- Visión de producto y diseño: @PRODUCT.md y @DESIGN.md

## Comandos principales (Node >=24.0.0 <25)
```bash
npm install                  # instalar dependencias
npm run db:local:setup       # inicializar PostgreSQL portable local (primera vez)
npm run db:local             # iniciar PostgreSQL local
npm run dev                  # servidor Next.js en http://127.0.0.1:3000
npm run typecheck            # verificar tipos TypeScript (tsc --noEmit)
npm run db:validate          # validar schema de Prisma
npm run test:api             # tests de integración y API (Vitest)
npm run test:cli             # tests de CLI de entrega y seguridad
npm run test:ui:tokens       # validar tokens de diseño en CSS/UI
npm run test:e2e             # tests E2E de navegador (Playwright)
npm run delivery:check       # verificar preparación offline de entrega
```
Antes de dar una tarea por terminada: `npm run typecheck`, `npm run test:api`, `npm run test:cli` y `npm run test:ui:tokens` deben pasar en verde.

## Arquitectura en 5 capas (`src/`)
1. `src/app/` — Rutas Next.js App Router (páginas, layouts y Route Handlers HTTP en `src/app/api/`). Solo transporte HTTP y renderizado.
2. `src/components/` y `src/frontend/` — Componentes UI, hooks de cliente y modelos de lectura. Nunca importan de `src/server/`.
3. `src/shared/` — Contratos HTTP, esquemas Zod de entrada/salida, códigos de error y políticas compartidas cliente/servidor.
4. `src/domain/` — Lógica pura de dominio: máquina de estados de la operación, compatibilidad de viajes, aritmética decimal exacta (`BigInt` en gramos y centésimas de humedad), economía y JCS/SHA-256 canónico. Sin I/O ni base de datos.
5. `src/server/` — Persistencia SQL (`database/`), sesiones HMAC HttpOnly (`sessions/`), coordinación de eventos y colas (`operations/`, `events/`), adaptador Hedera HCS (`hedera/`), seguridad y rate-limiting (`security/`). Protegido con `server-only`.

## Dónde está cada cosa
- Esquema de datos y relaciones: @prisma/schema.prisma
- Índice de las 21 especificaciones (S01–S21): @docs/specs/README.md
- Reglas de operación y estados: @docs/reglas-de-operacion.md
- Eventos canónicos, hashes y cola HCS: @docs/eventos-y-hashes.md y @docs/hedera-testnet.md
- Seguridad S21 (sesiones, concurrencia, SQL, TLS): @docs/s21-validacion.md
- Validación UI, accesibilidad WCAG 2.2 AA y SEO (S20): @docs/s20-validacion.md
- Decisiones de arquitectura (ADR): `docs/adr/`
- Planes de implementación por fase: `docs/plans/`

## Reglas inviolables del dominio
- **Presupuesto cero (ADR-0003):** Solo capas gratuitas (Vercel Hobby, Neon Free vía Vercel Marketplace, Hedera testnet). Prohibido agregar servicios pagos, tarjetas o upgrades automáticos.
- **SQL antes de HCS:** Toda acción persiste primero el cambio de estado y el pendiente en PostgreSQL dentro de una transacción ACID antes de intentar publicar en Hedera testnet.
- **Separación de estados:** Distinguir siempre estado operativo (`RunState`), estado de envío (`PublicationState`) y estado de verificación (`VerificationState`). Un fallo o demora del mirror node nunca se presenta como confirmación ni revierte la operación SQL.
- **Aislamiento y cuotas:** Sesión anónima de 24 h (máx. 3 recorridos por sesión; máx. 100 envíos HCS globales por día UTC; 3 intentos automáticos + 1 manual).
- **QR público de solo lectura:** La vista y API pública de trazabilidad (`/trazabilidad/[traceId]`) jamás exponen contactos, secretos, cookies ni permiten mutaciones.
- **Honestidad del prototipo:** Identificar siempre empresas, pesos, fotos y ahorros como ejemplos ficticios de demostración; solo los registros en Hedera testnet son reales. No declarar aprobada la aceptación remota ni los 5 hitos reales en testnet por pasar pruebas locales.
- **Cero secretos en cliente:** Ninguna variable de `.env.example` puede llevar prefijo `NEXT_PUBLIC_` ni exponerse en cliente, logs o payloads HCS.

## Convenciones
- TypeScript estricto, sin `any`, ESM (`"type": "module"`).
- Usar el vocabulario exacto de `@GLOSSARY.md` en código, UI y documentación.
- Fronteras de prueba: testear contratos de API pública (`tests/api/`), CLI (`tests/cli/`) y flujos E2E (`tests/e2e/`); no acoplar tests a funciones privadas internas.
- Commits con Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

## Límites (No hacer sin confirmación explícita)
- Crear o modificar migraciones en `prisma/migrations/` o ejecutar resets de base de datos.
- Tocar archivos `.env*` reales, credenciales de Hedera o configuración de despliegue.
- Agregar o actualizar dependencias en `package.json`.
- Borrar archivos de `docs/` o `prisma/`.
- Leer `JOPOI.md` (pesa 2.4 MB y agota la ventana de contexto).

## Si algo no está claro
Si el pedido, un plan en `docs/plans/` o las especificaciones en `docs/` se contradicen, detenete y preguntá antes de editar código.
