## Qué cambia

Descripción breve del cambio y referencia a la spec o plan aplicable (ej. S14, `docs/plans/...`).

## Tipo de cambio

- [ ] Nueva funcionalidad
- [ ] Corrección de error
- [ ] Refactor
- [ ] Documentación / Configuración de agentes
- [ ] Pruebas

## Checklist de invariantes y calidad

- [ ] `npm run typecheck`, `npm run db:validate`, `npm run test:ui:tokens` y `npm run test:cli` pasan localmente
- [ ] `npm run test:api` (y `npm run test:e2e` si toca UI o flujos completos) ejecutado y en verde
- [ ] Se respeta la arquitectura en 5 capas (`frontend`/`components` no importan `server`; `domain` sin I/O)
- [ ] SQL persiste en transacción ACID antes de intentar envíos HCS y distingue `RunState`, `PublicationState` y `VerificationState`
- [ ] Ninguna variable sensible lleva prefijo `NEXT_PUBLIC_` ni se expone en rutas públicas/QR
- [ ] Los datos de demostración siguen identificados como ficticios; no se declaran aprobados despliegue ni testnet real sin evidencia remota
- [ ] Actualicé `CHANGELOG.md` (sección `[Sin publicar]`) y los documentos en `docs/` si cambió algún contrato o regla

## Cómo probarlo

Pasos exactos y comandos ejecutados para verificar el cambio.
