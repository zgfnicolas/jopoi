# Configuración y entorno de desarrollo

S01 implementada como base reutilizable. No hay todavía aplicación Next.js arrancable, esquema Prisma, conexión SQL comprobada, integración Hedera ni despliegue. Las comprobaciones de comportamiento se crean y ejecutan al llegar a S17 y S18.

## Versiones y preparación local

Se conservan las versiones exactas del manifiesto y `package-lock.json`, sin actualizar dependencias como parte de S01:

| Componente | Versión | Revisión local |
| --- | --- | --- |
| Node.js | 24.22.1 | Ejecutable local comprobado; `.node-version` fija la referencia. El manifiesto admite Node 24. |
| Next.js | 16.4.2 | Su metadata admite Node >=20.9 y React 19. |
| React / React DOM | 19.3.1 | Versiones coincidentes; satisfacen los pares declarados. |
| Prisma CLI, Client y adaptador PostgreSQL | 7.10.1 | Versiones coincidentes; CLI y Client admiten Node 24 y TypeScript >=5.4. |
| SDK Hedera | `@hashgraph/sdk` 2.81.0 | Admite Node >=18. No se importa ni inicializa en S01; S09 implementará el adaptador. |
| TypeScript | 7.0.2 | Ejecutó satisfactoriamente la comprobación de tipos de S01. |
| Zod / server-only | 4.6.7 / 0.0.1 | Validación de configuración y frontera de importación del servidor. |

La revisión de engines y pares comprueba compatibilidad declarada, no una integración SQL/HCS ni un build de la aplicación. Como referencias: [requisitos Prisma 7](https://docs.prisma.io/docs/orm/v7/reference/system-requirements) y [variables de entorno Next.js](https://nextjs.org/docs/app/guides/environment-variables).

Con Node 24.22.1 y npm disponibles en `PATH`, una copia nueva se prepara con `npm ci`, respetando el lockfile. Después, `npm run typecheck` verifica los tipos. S01 no instala herramientas ni ejecuta esa preparación nuevamente sobre el entorno existente.

En este workspace existe una distribución portátil ignorada por Git. Puede comprobarse la base sin modificar `PATH` mediante PowerShell:

```powershell
& ./.tools/node/node-v24.22.1-win-x64/node.exe --version
& ./.tools/node/node-v24.22.1-win-x64/node.exe ./node_modules/typescript/bin/tsc --noEmit
```

Esa carpeta no está incluida en el repositorio; una copia nueva debe disponer de Node y restaurar dependencias antes de comprobar tipos.

## Entornos y presupuesto

| Entorno | Destino | Estado en S01 |
| --- | --- | --- |
| Desarrollo | PostgreSQL local | Solo contrato de conexión. Esquema, migraciones y puesta en marcha en S03. |
| Publicado | Vercel Hobby + Neon Free | Destino acordado; no hay cuentas, base ni despliegue creados por S01. |
| Trazabilidad | Hedera HCS testnet | Red fijada en código; no hay conexiones ni transacciones realizadas por S01. |

Presupuesto cero: sin tarjetas, planes pagos, upgrades automáticos ni compra de HBAR. Una pausa o cuota agotada debe mantenerse como indisponibilidad real. S10 aplicará cuotas y mantenimiento; S16 preparará la publicación gratuita. Las constantes de S01 no garantizan por sí mismas el cumplimiento de las cuotas del proveedor.

## Inventario del entorno

`.env.example` contiene la plantilla sin credenciales. Para desarrollo se puede copiar a `.env.local`; los archivos `.env*` están ignorados salvo la plantilla. No se creó un archivo con secretos durante esta implementación.

Todas estas variables se consumen en servidor; ninguna se exporta con `NEXT_PUBLIC_` ni mediante configuración de bundling.

| Variable | Finalidad y requisito | Tratamiento |
| --- | --- | --- |
| `DATABASE_URL` | SQL de aplicación; obligatoria solo al solicitar esa capacidad. Admite `postgres:` o `postgresql:` con host. En Neon se utilizará la conexión pooled. | Privada; puede contener credenciales. |
| `DIRECT_URL` | Conexión directa, requerida solo por la capacidad de migraciones. No se exige para leer configuración de aplicación. | Privada; puede contener credenciales. |
| `SESSION_SECRET` | Secreto de sesión, mínimo 32 caracteres sin espacios. | Secreto privado, independiente de cron. |
| `CRON_SECRET` | Secreto del trabajo diario, mínimo 32 caracteres sin espacios. | Secreto privado, independiente de sesión. |
| `APP_URL` | Origen público. En desarrollo/test, ausente utiliza `http://127.0.0.1:3000`. En producción es obligatorio y HTTPS. | No confidencial, pero leído en servidor; no se publica el objeto de configuración. |
| `HEDERA_OPERATOR_ID` | Operador de testnet en formato numérico `0.0.N`, N positivo. | Identificador no confidencial; no se añade a errores públicos. |
| `HEDERA_OPERATOR_KEY` | Clave privada no vacía. Su formato criptográfico y correspondencia con el operador se comprobarán con el SDK en S09. | Secreto privado. |
| `HEDERA_TOPIC_ID` | Topic testnet en formato numérico `0.0.N`, N positivo. | Identificador no confidencial; su existencia no se comprueba en S01. |
| `HCS_DAILY_LIMIT` | Entero de 1 a 100; ausente/vacío utiliza 100. Otros valores invalidan la capacidad HCS. | Política privada de operación; no implica un contador implementado. |
| `NODE_ENV` | Lo establece el runtime. Admite `development`, `test` o `production`; ausente utiliza `development`. Solo interviene en la configuración del origen. | No secreto. No se redefine en la plantilla. |

Se recortan espacios exteriores; valores vacíos se consideran ausentes. Se ignoran variables ajenas al inventario. El origen admite una `/` final, pero no usuario, contraseña, ruta, query ni fragmento; se devuelve normalizado mediante `URL.origin`. HTTP se admite solo en desarrollo/test para `localhost`, `127.0.0.1` o `[::1]`. No se infiere el origen desde headers ni dominios de preview.

Generar cada secreto por separado con 32 bytes criptográficos, por ejemplo con Node disponible en `PATH`:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Guardar el resultado únicamente en el entorno privado correspondiente. El lector valida longitud y formato básico, no puede demostrar la aleatoriedad de un secreto elegido manualmente.

## Contrato de configuración

`src/server/config/index.ts` es la entrada para Next.js y está protegida por `server-only`. Su importación no accede a `process.env`, no valida todo el entorno y no inicializa clientes. `getServerConfig()` toma una instantánea normalizada y devuelve lectores separados:

- `database()` y `migrations()` devuelven configuración `{ url }`.
- `session()` y `maintenance()` devuelven `{ secret }`.
- `origin()` devuelve `{ url }` con el origen canónico.
- `hedera()` devuelve `{ network, operatorId, operatorKey, topicId, dailyLimit }`; `network` siempre es `testnet`.

Cada lectura valida únicamente su capacidad y devuelve una unión discriminada por `status`:

- `configured`: incluye `config` tipada; no significa que el servicio esté conectado.
- `missing`: todos los problemas corresponden a variables ausentes.
- `invalid`: existe al menos un valor inválido; puede incluir también ausencias.

Todos los resultados incluyen `capability` y `availability: "unchecked"`. Los fallos incluyen `issues` con únicamente `variable` y `reason` (`missing` o `invalid`). Nunca se devuelve el `ZodError` original.

`requireConfiguration(result)` devuelve la configuración o lanza `ApplicationError`: `DATABASE_UNAVAILABLE` para SQL/migraciones y `CONFIGURATION_UNAVAILABLE` para las otras capacidades. La llamada no comprueba conectividad: S03 y S09 deberán tratar los fallos reales de sus dependencias.

`describeConfiguration(result)` elimina los valores y produce un resumen interno para diagnóstico. No hay un endpoint de diagnóstico. Nunca serializar `result.config`, devolverlo al navegador ni registrar la lectura completa.

El parser puro vive en `src/server/config/environment.ts`: acepta un mapa explícito y no lee `process.env`. Los futuros CLI podrán reutilizarlo sin importar el marcador de React `server-only`; siguen siendo código privado de servidor. La carga de archivos de entorno para esos CLI se integrará cuando se implementen sus comandos. Next.js carga `.env*` en su runtime.

## Políticas y errores compartidos

`src/shared/demo-policy.ts` fija sesión de 86.400 segundos, tres recorridos, cuota HCS predeterminada/máxima de 100, siete días de retención operativa, 90 días de contactos y frecuencia diaria de mantenimiento. S04 y S10 implementarán su aplicación; S01 no añade temporizadores, cron ni contadores en memoria.

`src/shared/api-errors.ts` contiene el catálogo de códigos, estados HTTP y mensajes en español, y el contrato público:

```typescript
{ error: { code, message, requestId, fields? } }
```

`fields` es un mapa de nombres de campo a listas de mensajes públicos. Solo debe recibir mensajes redactados por la aplicación, nunca excepciones, valores ingresados o mensajes de proveedores. Los módulos compartidos no leen entorno ni importan módulos privados.

`src/server/api-errors.ts` proporciona `ApplicationError`, `createRequestContext()` y `toApiError(error, context)`. Crear el contexto una vez al entrar a cada futura solicitud y reutilizarlo. El identificador se genera mediante UUID en el servidor; no se copia de headers del visitante. Si se omite el contexto, el adaptador genera uno.

El adaptador devuelve `{ status, body }` para que el futuro handler construya la respuesta HTTP. Solo serializa código, mensaje del catálogo, requestId y campos públicos explícitos. Una excepción desconocida produce `INTERNAL_ERROR`/500; no se inspecciona ni publica su mensaje, stack o causa. S01 no añade handlers HTTP.

Se conservan los códigos de S01 y se concretan `TRACE_EXPIRED`/410, `CONFIGURATION_UNAVAILABLE`/503 e `INTERNAL_ERROR`/500. Una acción SQL ya guardada no se convierte en error de guardado porque su publicación HCS esté pausada o pendiente. Esa separación se integrará en S07–S10; no hay un adaptador de red en S01 que pueda confirmarla.

## Comandos existentes y estado real

| Comando del manifiesto | Estado tras S01 |
| --- | --- |
| `typecheck` | Disponible y ejecutado sobre la base de S01. |
| `dev`, `start` | Pendientes de aplicación Next.js; no arrancan una demo funcional. |
| `build` | Requiere esquema Prisma y aplicación Next.js posteriores. No es criterio de cierre de S01. |
| `db:generate`, `db:migrate` | Pendientes de S03; no hay esquema/migraciones. |
| `db:local` | Lanzador preliminar PGlite instalado previamente; no ejecutado ni aceptado como evidencia de PostgreSQL listo. S03 concretará el entorno SQL. |
| `contacts:export` | Pendiente del script de S05. |
| `hedera:topic` | Pendiente del script de S09 y credenciales testnet. |
| `maintenance` | Pendiente del script de S10. |
| `test`, `test:e2e` | Lanzadores preliminares; suites pendientes de S17 y S18. No se ejecutan en S01. |

## Verificación de S01 y escenarios posteriores

Se ejecutaron comprobación TypeScript y revisión estática del diff, dependencias, fronteras de importación y tratamiento del entorno. No se crearon ni ejecutaron suites, conexiones SQL, transacciones testnet, build Next.js ni despliegues.

S17 comprobará mediante las futuras APIs: configuración indispensable ausente/inválida, dependencia caída pese a configuración completa, contrato uniforme, ausencia de secretos en respuestas y persistencia SQL exitosa con HCS pendiente. S18 cubrirá su explicación y recuperación en navegador. La matriz de configuración incluirá origen HTTPS obligatorio en producción, independencia entre capacidades, secretos insuficientes y cuotas inválidas; no requiere probar funciones privadas.
