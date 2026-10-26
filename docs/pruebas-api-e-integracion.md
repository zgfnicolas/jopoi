# S17 · Pruebas de API e integración

La suite observa HTTP real de Next.js y la exportación administrativa de contactos. Usa PostgreSQL local real y un proveedor HCS/mirror controlado. **Esta evidencia no demuestra una operación real en Hedera testnet**; esa aceptación corresponde a S18.

## Ejecutar

- Node 24 y dependencias del proyecto instaladas.
- Cliente Prisma generado: `npm run db:generate` (no conecta a SQL).
- En Windows, binarios PostgreSQL 17 en `.tools/postgresql/`, preparados por el entorno local del proyecto. La suite reutiliza los ejecutables, no el clúster de desarrollo; no descarga ni provisiona servicios automáticamente.
- `npm run test:api` o `npm test`: ejecución completa, sin navegador, Neon ni cuentas Hedera.
- `npm run test:api -- -t API-15`: escenario seleccionado. Los casos fuera del filtro aparecen bloqueados en la matriz, no aprobados.

El proceso necesita permiso para iniciar PostgreSQL y Next.js en loopback. La falta de binarios, un puerto ocupado o una migración fallida bloquean la ejecución y devuelven un código no exitoso.

## Aislamiento

La preparación crea un clúster propio en `.cache/api-tests/<ejecución>/`, con usuario, contraseña, puerto y base exclusivos. Aplica las migraciones existentes; no utiliza las conexiones de `.env.local`. Cada escenario detiene el servidor anterior y limpia únicamente sus fixtures antes de arrancar otro servidor. Los procesos hijos se crean sin ventanas visibles. Al finalizar se detiene y elimina exclusivamente el clúster de esa ejecución; permanecen logs e informes. Cada CSV de pruebas se elimina después de leerlo.

Un lock impide ejecutar dos suites simultáneamente contra la caché de Next compartida por los tests. Si se termina forzosamente el ejecutor, comprobar que el PID de `.cache/api-tests/active.lock` ya no existe antes de retirar ese archivo y recuperar los procesos propios de la ejecución. No detener el PostgreSQL de desarrollo ni borrar `.cache/postgresql-17`.

El reloj de aplicación usa una fecha controlada; los temporizadores de Node/Next conservan tiempo real. HCS/mirror se sustituyen en la composición del entorno de pruebas mediante `tsconfig.api.json`. Un canal IPC privado mantiene el libro de red simulado incluso al reiniciar Next. No existen rutas HTTP de administración del reloj o del proveedor.

La configuración de Next rechaza los controles de pruebas fuera del servidor local de desarrollo y verifica la marca de propiedad, base y origen de la ejecución. El build normal conserva los adaptadores reales.

## Contratos observados

Las pruebas crean datos mediante las API de sesión, recorridos, comandos y contacto; verifican efectos con consultas posteriores, trazabilidad pública, verificación y exportación CSV autorizada. Los helpers SQL solo preparan fixtures excepcionales o provocan fallos reales de persistencia. Para snapshots alternativos y corrupción deliberada se suspenden triggers únicamente dentro de la transacción de preparación del clúster exclusivo; la aplicación conserva todas sus restricciones. Las aserciones no leen tablas, importan reglas privadas ni comprueban llamadas a colaboradores internos.

Los escenarios concurrentes coordinan solicitudes y barreras de red explícitas. Un conflicto serializable documentado puede responder `409 VERSION_CONFLICT`; se verifica como resultado permitido, sin confundirlo con una acción guardada. No hay reintentos automáticos de tests. Los recorridos normales esperan la publicación antes de su siguiente paso. Las consultas acotadas esperan resultados observables; un timeout conserva el último resultado para diagnóstico.

## Evidencia

El informe se escribe en `.cache/api-tests/results/report.json` y `report.md`. Relaciona API-01–API-26 con nombres de pruebas y distingue APROBADO, FALLIDO y BLOQUEADO. Los logs privados de arranque están en el directorio de cada ejecución. No se deben publicar archivos de entorno, credenciales ni archivos de exportación.

La matriz normativa y sus resultados esperados están en [S17](specs/17-pruebas-de-api-e-integracion.md). Los importes de referencia provienen de S02; los hashes esperados se contrastan con vectores independientes de la canonicalización del producto.

## Validación local

Comprobado el 26 de octubre de 2026: cuatro archivos, **28 pruebas aprobadas**, que cubren los 26 casos API-01–API-26. La ejecución completa se comprobó desde clústeres nuevos; el informe final no contiene casos fallidos o bloqueados. También pasaron TypeScript, validación Prisma y el build normal de producción.

Se verificó la eliminación del clúster, su archivo de contraseña temporal y el lock al finalizar. No se añadieron migraciones, dependencias, endpoints de control, cuentas ni servicios externos. La integración real del SDK con testnet y el navegador siguen pendientes de S18.
