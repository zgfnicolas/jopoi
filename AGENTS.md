<!-- BEGIN:nextjs-agent-rules -->
## Next.js Runtime Notice
Verify changes with `node_modules/next/dist/docs/` and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Proyecto
Jopói: Prototipo B2B de coordinación agroindustrial de biomasa y transporte de retorno con anclaje en Hedera testnet.
Detalle del producto y alcance: docs/prd.md

## Comandos esenciales
```bash
npm install               # Instalar dependencias
npm run dev               # Servidor de desarrollo en http://localhost:3000
npm test                  # Pruebas unitarias y de dominio (Node test runner)
npm run test:api          # Pruebas de integración HTTP y base aislada
npm run test:observability# Pruebas de SLOs, alertas, runbooks y RUM
npm run typecheck         # Verificación de tipos TypeScript estricto
npm run lint              # Linter y verificación de formato (Biome)
npm run release:gate      # Acreditación integral de calidad y release
```
Ejecutá `npm run typecheck`, `npm run lint` y `npm test` antes de dar una tarea por terminada.

## Arquitectura en 4 capas
1. Transporte: `src/app/` (páginas, server actions) y `src/app/api/` (route handlers HTTP). Solo recibe y responde.
2. Validación: `src/contracts/` (esquemas Zod discriminados). Valida entradas y contratos.
3. Negocio: `src/domain/` y `src/services/`. Contiene las reglas del dominio y la máquina de estados.
4. Persistencia y Externos: `src/server/db/` (Prisma) y `src/server/hcs/` (Hedera). Único acceso a base y red.

Una capa solo importa de la inmediata inferior. Las vistas y rutas HTTP nunca importan el cliente de Prisma directamente.
Detalle arquitectónico: docs/sad.md

## Dónde está cada cosa
- Esquema de base de datos: `prisma/schema.prisma`
- Reglas de negocio: docs/business_rules.md
- Roles y permisos: docs/roles.md
- Decisiones técnicas: docs/adr/
- Sistema de diseño y tokens: `DESIGN.md` y `src/app/globals.css`
- Runbooks operativos: `docs/runbooks/`
- Scripts de verificación y release: `scripts/`

## Reglas inviolables
- Presupuesto cero: nunca integrar proveedores de pago, tarjetas de crédito ni dependencias SaaS comerciales.
- Cantidad positiva y humedad entre 0% y 100% (RN-01, RN-02).
- Humedad declarada mayor al límite del comprador bloquea la aprobación (RN-04).
- Transporte exige compatibilidad total: material, capacidad, carrocería, ruta y ventana horaria (RN-06).
- Tolerancia cero en demo: diferencia de peso exige registrar incidencia (RN-08).
- Estados terminales (`RECEIVED`, `REJECTED`, `INCIDENT`) son estrictamente inmutables (RN-10).
- Desacoplamiento de red: SQL persiste primero; fallas de red en HCS no corrompen la sesión local (RN-15).
- Contraste visual accesible WCAG 2.1 nivel AA en modo claro y modo oscuro.

## Convenciones
- TypeScript estricto, sin uso de tipo `any`.
- Commits en formato Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- Toda función de servicio o regla nueva debe incluir su correspondiente prueba automatizada.

## Límites
No ejecutar sin confirmación explícita del usuario:
- Crear o aplicar migraciones destructivas de base de datos.
- Borrar archivos de código o datos de prueba.
- Modificar variables de entorno con credenciales de producción o empujar commits a remotos.
- Instalar dependencias de paquetes no justificadas.

## Si algo no está claro
Si el pedido, el plan o las reglas se contradicen, o falta información del contexto,
detenete y preguntá antes de escribir código. No supongas.

## Trabajo con planes
Si existe un plan activo en `docs/plans/`, ejecutá solo la fase indicada y detenete al completarla para revisión humana.
