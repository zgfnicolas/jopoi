# S19 · Persistencia y despliegue gestionados desde Vercel

La implementación conserva PostgreSQL, Prisma, pg y las cuatro migraciones existentes. Añade las variables de una integración nativa de Vercel, lectura explícita de sus exportaciones y evidencia de aceptación v2. No añade Redis ni un SDK de Neon.

El responsable eligió completar los cambios y pruebas locales y dejar el despliegue pendiente. En esta entrega no se crean proyectos, bases ni cuentas remotas y no se envían mensajes reales a testnet. El procedimiento siguiente queda preparado para la publicación posterior.

## Preparación desde Vercel

Requiere Node 24 y la CLI oficial de Vercel. Si `vercel` no está en el PATH, anteponer `npm.cmd exec --cache .cache/npm --yes --package vercel@65.4.0 --` a los comandos `vercel` de esta guía. Esa es la versión comprobada en esta sesión; se ejecuta como herramienta operativa, sin añadirla a las dependencias de la aplicación.

1. Iniciar sesión en Vercel y crear un proyecto personal **Hobby** nuevo para Jopói, sin publicar automáticamente antes de configurar sus recursos. Vincular el directorio con la CLI oficial (`vercel link`) y comprobar el proyecto en `.vercel/project.json`, privado e ignorado por Git. No crear una cuenta independiente en Neon.
2. Desde Storage/Marketplace, instalar **Neon como integración nativa gestionada por Vercel**. Seleccionar Free y verificar presupuesto cero, sin tarjeta y sin upgrades automáticos. No basta con conectar una cuenta externa. Si la oferta exige pago o tarjeta, detener la publicación y registrar el impedimento; no contratar otro plan.
3. Crear una base nueva y conectarla únicamente a **Production**, sin prefijo personalizado de variables. La integración sincroniza `DATABASE_URL` pooled y `DATABASE_URL_UNPOOLED` directa. No duplicar esta última en `DIRECT_URL`. No conectar Production a Preview o Development. Conservar PostgreSQL local para desarrollo y bases desechables para pruebas.
4. Configurar framework Next.js, Node 24, instalación `npm ci`, build `npm run build` y salida autodetectada. Confirmar el dominio definitivo de Production y configurar `APP_URL` HTTPS **antes del build**, pues la demo incorpora ese origen en enlaces y QR. Los ejemplos locales de PowerShell usan `npm.cmd`; la configuración del build en Vercel usa `npm`.
5. Configurar desde Vercel los secretos independientes de sesión y cron, más los valores privados de Hedera testnet y su generación. PostgreSQL no crea operador, saldo ni topic de Hedera. Si faltan, usar el procedimiento HCS existente. Nunca pegar secretos en conversaciones ni versionarlos.
6. Exportar Production a un archivo nuevo ignorado por Git; mantener intacto `.env.local`:

```powershell
vercel env pull .env.vercel.production.local --environment=production
npm.cmd run delivery:check -- --profile candidate --vercel-env-file .env.vercel.production.local
npm.cmd run db:migrate -- --vercel-env-file .env.vercel.production.local
npm.cmd run db:status -- --vercel-env-file .env.vercel.production.local
npm.cmd run db:check -- --vercel-env-file .env.vercel.production.local
npm.cmd run delivery:build -- --vercel-env-file .env.vercel.production.local
```

`db:migrate` modifica la base remota seleccionada; status/check solo consultan. Migrar antes de publicar, nunca dentro del build. No usar `db push`, reset ni fixtures sobre Production. La base nueva no requiere trasladar datos locales.

Reexportar a un archivo nuevo si cambia la configuración: Vercel puede conservar valores locales al actualizar un archivo existente. Si omite secretos o contiene placeholders, completar el flujo privado de configuración y comprobar nuevamente; no usar credenciales de desarrollo ni reducir protecciones para pasar el chequeo. El formato válido no demuestra permisos ni plan correctos.

7. Con una revisión limpia y verificada, publicar explícitamente a Production (`vercel --prod`). Confirmar dominio y commit publicados, sin inferirlos de una URL temporal. El build sigue siendo `prisma generate && next build`, sin migraciones.

## Conexiones y selección del entorno

- `DATABASE_URL`: conexión pooled de aplicación.
- `DATABASE_URL_UNPOOLED`: conexión administrativa nativa para migraciones/estado.
- `DIRECT_URL`: alternativa compatible para desarrollo y archivos anteriores. Si ambas variables administrativas están presentes, deben coincidir exactamente; un conflicto invalida migraciones.
- `--env-file ARCHIVO`: formato estricto de Jopói; rechaza claves adicionales.
- `--vercel-env-file ARCHIVO`: selecciona solo variables reconocidas de una exportación Vercel. No importa claves adicionales como `PGPASSWORD`, `VERCEL_OIDC_TOKEN` o `NODE_OPTIONS`.

Los selectores son excluyentes, no se repiten y sellan variables conocidas ausentes sin heredar secretos del proceso, `.env.local` o `.env`. Entrega, SQL, exportación, diagnóstico, mantenimiento, topic y aceptación admiten ambos. La ayuda no lee el archivo ni conecta.

El chequeo candidato conserva Neon pooled/directa, TLS y mismo endpoint/base. Es **offline**: no acredita conectividad, aprovisionamiento, gratuidad ni aceptación.

## Aceptación y operación

Copiar la [plantilla v2](acceptance-provider-evidence.example.json) a `.cache/acceptance/providers.json` y completar solo con observaciones reales revisadas desde Vercel. Registrar proyecto, recurso, plan, integración nativa, conexión solo a Production, sincronización de credenciales y ausencia de cuenta independiente, tarjeta y upgrade automático. Guardar artefactos sin secretos y sus SHA-256 dentro de `.cache/acceptance/`.

Ambos IDs de proyecto deben coincidir con `.vercel/project.json`. El lector contrasta URL, commit, fechas de hasta siete días y hashes. Los manifiestos v1 ya no acreditan S19. La revisión es documental; no se presenta como auditoría automática de facturación ni consulta a la API Vercel.

```powershell
npm.cmd run acceptance:check -- --vercel-env-file .env.vercel.production.local --evidence .cache/acceptance/providers.json --journal .cache/acceptance/testnet.json
npm.cmd run ops:status -- --vercel-env-file .env.vercel.production.local
npm.cmd run contacts:export -- --vercel-env-file .env.vercel.production.local
```

La aceptación conserva el recorrido y cinco hitos reales contrastados en testnet, más ejecución del cron diario. `acceptance:live -- --run` del procedimiento S18 admite el nuevo selector. Requiere candidato y journal explícitos, operador y saldo ficticio. No regenerar el journal para eludir incertidumbre ni duplicar envíos.

Verificar recuperación del mismo recorrido tras un redeploy, contactos privados, idempotencia, consulta pública y QR. Mantener cron `0 3 * * *`, sin polling permanente. Consultar recurso, plan, conexión, consumo y logs desde Vercel. El acceso opcional «Open in Neon» para funciones avanzadas no debe ser obligatorio para la preparación habitual; registrar cualquier función imprescindible que solo exista fuera de Vercel antes de cerrar la aceptación.

Ante caída o cuota agotada, mostrar indisponibilidad y conservar el plan gratuito. Un redeploy no borra la base. Conservar datos ante fallos y corregir la aplicación, sin eliminar el recurso. Volver a una revisión anterior no restaura automáticamente escrituras aceptadas posteriormente.

## Verificación local

`npm.cmd run test:cli` utiliza archivos y credenciales sintéticos, sin red ni PostgreSQL. `npm.cmd run test:api` y `npm.cmd run test:e2e` mantienen PostgreSQL aislado y HCS controlado. No demuestran por sí solos un despliegue o testnet real.

Verificación completada el 2026-10-28:

| Comprobación | Resultado |
| --- | --- |
| CLI de configuración y evidencia | 15 pruebas aprobadas. |
| API HTTP y PostgreSQL real aislado | 28 pruebas aprobadas; API-01–API-26 aprobados. |
| Navegador | 28 pruebas aprobadas, 14 de escritorio y 14 de móvil emulado, sin reintentos del ejecutor. |
| TypeScript, schema Prisma y build de producción | Aprobados. |
| Evidencia API/navegador | Misma huella de fuentes; sin locks ni archivos privados de recursos activos tras el cierre. |

La primera pasada de navegador detectó arranques en frío de rutas API que excedían el límite de 15 segundos del cliente. La preparación de E2E cubre ahora todas las entradas utilizadas y tiene un presupuesto independiente del cuerpo de prueba, sin cambiar los timeouts del producto ni las aserciones. Los tres escenarios afectados pasaron aislados y luego pasó la suite completa. Ver [preparación y diagnóstico de E2E](pruebas-e2e-y-aceptacion.md).

El informe local `.cache/acceptance/report.md` reconoce las verificaciones de API y navegador. La aceptación global devuelve `BLOQUEADO` (salida 1), con E2E-12/13/14 pendientes de candidato publicado, infraestructura gratuita revisada, cinco hitos reales de testnet y ejecución real del cron. También requiere una revisión limpia. Es el estado esperado porque el responsable decidió dejar el despliegue pendiente; no se acredita infraestructura remota mediante evidencia sintética.

Fuentes: [integración gestionada de Neon](https://neon.com/docs/guides/vercel-managed-integration), [integraciones nativas](https://vercel.com/docs/integrations/install-an-integration/product-integration), [entorno Vercel](https://vercel.com/docs/cli/env).
