# S22-04 · Operaciones persistidas válidas

Alcance: ticket 04, D06/D16/D18 y escenarios S22-10/S22-11/S22-29. La entrega conserva las rutas HTTP y el JSON de clientes anteriores. No despliega cambios ni envía mensajes HCS reales.

## Contratos y recuperación

El motor de decisiones devuelve `OperationSnapshot`. Los adaptadores SQL reconstruyen el estado con el validador semántico del ticket 03 antes de responder o ejecutar comandos, recuperar recibos, exponer una traza o autorizar un reintento. También se verifica la coherencia de `assignedAt` con la asignación persistida.

Los recibos operativos requieren una operación válida y coherencia con su evento, acción y versión resultante. Un replay conserva la operación aplicada originalmente aunque el recorrido haya avanzado. Un JSON corrupto o un cierre incompleto devuelve `INTERNAL_ERROR`, sin confirmar escrituras ni regenerar evidencia.

Los eventos se contrastan con el escenario inmutable además de comprobar su hash y metadatos: estado, pesos, comprador, viaje, motivos y etiquetas. El coordinador valida antes de preparar el sobre HCS. La proyección pública conserva su recuperación degradada: un evento corrupto aparece como `MISMATCH`, sin payload confiable; no lo presenta como evidencia válida. Una fila de operación corrupta sí impide recuperar el recorrido completo.

Estado, versión, recibo, evento y publicación pendiente siguen dentro de la misma transacción SQL. El envío y la verificación de red continúan fuera de ella. No se modificaron eventos históricos, hashes, contratos de respuesta ni migraciones anteriores.

## Auditoría previa y expansión compatible

Antes de migrar un entorno autorizado, ejecutá con su archivo explícito:

```powershell
npm run db:audit -- --operations-only --env-file RUTA_AL_ARCHIVO
```

El comando abre una transacción `REPEATABLE READ READ ONLY`, recorre operaciones, recibos operativos, eventos y pendientes con un cursor de 100 filas y devuelve conteos, sin publicar identificadores, payloads ni credenciales. `inspected` cuenta filas de la unión histórica, no recorridos únicos. Los recibos de coordinación `RETRY_PUBLICATION` mantienen su validación propia en el endpoint de reintentos; este control previo se concentra en los recibos que aplican transiciones del dominio.

Si hay inconsistencias, devuelve código 1 y `passed: false`. Si falla la conexión o la consulta, también falla el comando; nunca significa historia válida. La auditoría no repara datos. Detené el rollout e investigá la evidencia antes de autorizar cualquier corrección. El resultado solo acredita el snapshot observado: la validación SQL posterior sigue siendo necesaria ante escrituras concurrentes.

Se agregaron dos migraciones:

1. `202610300001_operation_invariants_expand`: agrega `DemoRun_state_coherence` como `NOT VALID`. Controla las escrituras nuevas sin escanear inicialmente toda la historia.
2. `202610300002_operation_invariants_validate`: valida las filas existentes. Una incompatibilidad detiene la migración sin reescribir datos. Ambas usan transacciones y presupuestos de espera de locks; la validación tiene un máximo de 60 segundos.

El CHECK exige asignación completa en transporte/cierre, recepción conforme con peso igual al declarado, motivos terminales no vacíos y ausencia de campos incompatibles. Usa `IS TRUE` para impedir que un `NULL` vuelva aceptable una condición incompleta. Catálogos, compatibilidad y reglas del escenario siguen comprobándose en el dominio.

El runner de migraciones debe usar `migrate deploy` con el procedimiento existente y un único ejecutor. Si falla `VALIDATE`, la expansión ya confirmada puede quedar `NOT VALID`: `db:audit` lo informa como incumplimiento. No borres ni marques una migración fallida como aplicada sin resolver y revisar la causa. El código anterior que produce estados válidos sigue siendo compatible con la expansión.

Los locks de DDL no desaparecen con esta separación; si expira su presupuesto, detené y reprogramá la operación. La separación entre incorporación y validación sigue la semántica de [ALTER TABLE en PostgreSQL 17](https://www.postgresql.org/docs/17/sql-altertable.html).

## Tipado y verificación

Servidor y dominio quedan con **cero diagnósticos** bajo `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. El informe de calidad ahora falla si reaparecen errores en esas áreas; una prueba negativa introduce un error detectable solo por el perfil estricto para comprobarlo. Se mantienen visibles los 80 pendientes de otras áreas hasta los tickets 05–07, sin nuevas exclusiones ni supresiones.

Verificación local del 2026-10-30:

- `quality:check` aprobado: generación/validación Prisma, tipos vigentes, lint, informe estricto, 54 pruebas de dominio/persistencia, 49 HTTP, 7 de seguridad, 19 CLI, 2 de tokens UI y build.
- `test:quality` aprobado nuevamente con los 3 bloqueos negativos: tipos vigentes, lint y regresión estricta en servidor/dominio.
- Las 6 pruebas HTTP nuevas cubren corrupción de recibos y filas terminales, CHECKs, rollback concurrente, rechazo de una migración incompatible y expansión sobre evidencia histórica completa de conformidad, rechazo e incidencia. En esta última se comparan las filas de las ocho tablas copiadas antes y después de migrar.
- Informe estricto: 0 diagnósticos en servidor/dominio y 80 pendientes globales en las áreas posteriores. No hay nuevas dependencias.

PostgreSQL y HCS se ejecutaron con recursos aislados y un ledger controlado. La suite no acredita testnet real ni un despliegue externo. CI remoto y aceptación global de S22 siguen pendientes; el ticket 05 espera confirmación.
