# S22-02 · Calidad reproducible y transición estricta

Actualización del ticket 07: la [migración estricta global](s22-07-perfil-estricto-global.md) cerró la tolerancia descrita en esta evidencia histórica. Las tres opciones ya son obligatorias desde `tsconfig.json`, la puerta agrega `typecheck:api` y el informe falla ante cualquier diagnóstico. Los nueve controles actuales verifican también scripts, tests y configuraciones raíz. Las secciones siguientes conservan el diseño y los resultados originales del ticket 02.

Ticket 02 de S22. Fecha: 2026-10-30. Se prepara una puerta exigible sin adelantar la migración de dominio de los tickets 03–06. El ticket 07 debe retirar la tolerancia temporal y exigir el perfil completo.

## Ejecutar la puerta

Usá Node 24 (verificado con 24.22.1 y npm 11.19.1) y Windows x64. El arnés HTTP existente usa PostgreSQL portable y ejecutables `.exe`; CI conserva ese entorno, sin saltear la suite en otros sistemas ni simular compatibilidad no verificada.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run db:local:prepare
npm run quality:check
```

`db:local:prepare` descarga/verifica los mismos binarios PostgreSQL 17.11-5 y SHA-256 del preparador existente. No crea ni inicia una base habitual y no escribe `.env.local`. El arnés HTTP crea su propio clúster con credenciales efímeras y ledger controlado. Si ya tenés los binarios verificados, no necesita descargarlos de nuevo.

La puerta ejecuta secuencialmente y se detiene en el primer fallo:

1. `db:generate` y `db:validate`: preparar y validar Prisma, sin migrar una base habitual.
2. `typecheck`: exigir el perfil vigente, que conserva `strict: true`.
3. `lint`: exigir las reglas de Biome sin aplicar correcciones.
4. `typecheck:report`: informar el perfil completo temporal, sin confundirlo con aceptación.
5. `test:quality`: demostrar que errores reales de tipos y lint bloquean esta misma puerta.
6. `test:security`: transporte transitivo y gate de advisories del ticket 01.
7. `test:cli`: suite offline del CLI, invocada explícitamente.
8. `test:ui:tokens`: suite de tokens UI, invocada explícitamente.
9. `test:api`: regresión HTTP con PostgreSQL descartable y ledger controlado.
10. `build`: generación Prisma y build de Next con origen local sintético.

Desde el ticket 03, la puerta incorpora además `test:domain` después de seguridad: comprueba la reconstrucción semántica y la compatibilidad del modelo operativo expandido.

`npm test` continúa ejecutando sólo la suite HTTP de Vitest: no incluye implícitamente CLI, tokens UI, seguridad ni las pruebas del gate. El análisis de advisories se exige en el workflow de dependencias del ticket 01; podés ejecutarlo localmente con `npm run security:audit` y `npm run security:audit:all`. No se agrega una dependencia de red al gate de código.

El runner sella todas las variables de capacidades conocidas antes de iniciar los comandos, con conexiones y claves vacías y un APP_URL local sintético. Así los lectores de entorno no completan valores desde credenciales habituales. No publica HCS ni despliega. Los tests HTTP siguen usando su entorno y recursos aislados. Un fallo cancela los controles posteriores y devuelve un código distinto de cero; no usa `continue-on-error`.

## Un único linter principal

Se fija **Biome 2.6.4** en el lockfile. Su parser independiente permite analizar el código TypeScript/TSX sin cambiar TypeScript 7.0.2. La alternativa typescript-eslint [declara soporte para TypeScript menor a 6.1](https://typescript-eslint.io/users/dependency-versions/); no se baja el compilador ni se agregan dos linters para sortear esa incompatibilidad. Se leyó también la guía de ESLint incluida en la versión instalada de Next.

La configuración usa un conjunto explícito y revisable de reglas, con severidad de error. No depende de que una actualización de un preset active cientos de cambios de estilo o migraciones de dominio. Las [opciones de Biome](https://biomejs.dev/reference/configuration/) se validan contra el schema incluido en el paquete instalado.

| Grupo | Motivo |
| --- | --- |
| Código inalcanzable, constructores/super y uso inválido antes de declaración | Rechazar errores de control de flujo y orden de inicialización |
| Hooks al nivel superior y dependencias exhaustivas | Evitar hooks condicionales y closures que retengan datos anteriores |
| `typeof` válido, `finally` seguro | Evitar condiciones imposibles y pérdida del resultado/error original |
| `debugger`, ejecutores Promise async, asignaciones en expresiones | Evitar pausas y errores de asincronía/control difíciles de detectar |
| Casos, miembros, props, claves y parámetros duplicados | Evitar sobrescrituras y ramas ambiguas |
| Eval global, `var`, preferencia por `const` | Reducir ejecución dinámica e impedir mutabilidad accidental |
| `any` explícito, `@ts-ignore` y declaration merging inseguro | Evitar escapes de tipado que oculten nuevos errores |

Se permiten dependencias adicionales de hooks: `revision` dispara una recarga manual y la identidad del recorrido reinicia estado visual aunque no se lea dentro del callback. La opción `reportUnnecessaryDependencies: false` conserva esos disparadores intencionales; **las dependencias faltantes sí son errores**. Se estabilizaron `remember`, `expire`, `accept` y `load` del panel, y se movió la función DOM del selector de tema fuera del componente. Se retiraron dos antiguas supresiones ESLint, sin reemplazarlas por supresiones Biome.

Se analiza todo el código propio de `src`, `scripts`, `tests` (incluidos `.mjs`) y configuraciones de raíz. Se excluyen solamente dependencias/artefactos ignorados por Git, el cliente Prisma generado y el lockfile generado. No se ocultan áreas con diagnósticos de tipos. Biome no sustituye el chequeo semántico del compilador: prohibir `any` explícito no detecta por sí solo todos los escapes o casts indebidos. Esa revisión y migración siguen en los tickets 03–07.

El formato tiene comandos explícitos, separados del lint. Para archivos elegidos:

```sh
npm run format:check -- scripts/quality.ts scripts/strict-report.mjs
npm run format -- scripts/quality.ts scripts/strict-report.mjs
```

El primer comando sólo comprueba y el segundo modifica los archivos indicados. CI no repara ni reformatea el árbol. No se normaliza masivamente el estilo histórico como parte de esta preparación ni se exige todavía su formato global.

## Perfil completo y deuda visible

`tsconfig.strict.json` extiende íntegramente el perfil vigente, sin cambiar sus include/exclude. Activa `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`, con incremental desactivado para producir un diagnóstico completo. `tsconfig.json` no se debilita.

- `npm run typecheck:strict` devuelve error mientras haya pendientes.
- `npm run typecheck:report` genera detalle JSON y texto completo, más un resumen por área/archivo en `.cache/quality`. Devuelve éxito sólo si pudo reconocer los diagnósticos del compilador; fallas de ejecución, timeout, señal o salida no reconocida bloquean el gate.
- `npm run typecheck:report -- --snapshot` actualiza la [instantánea revisable](s22-02-diagnosticos-estrictos.md), con versión de compilador y hash de configuración. El comando normal y CI no modifican esa instantánea.

La base inicial es **106 diagnósticos en 40 archivos**: scripts 15; componentes 16; dominio 1; frontend 5; servidor 25; tests 44. El ticket 02 no los corrige con casts, `!`, supresiones ni exclusiones. Los tickets 03–06 migran las áreas y el 07 activa el perfil en todas las variantes y retira la tolerancia del reporter. Ese cierre exige cero diagnósticos reales, no actualizar una cifra aceptada. Mientras tanto, el informe es diagnóstico, no evidencia de aceptación final de S22-10.

## CI y pruebas de bloqueo

`.github/workflows/quality.yml` ejecuta instalación limpia, preparación de binarios verificados y la misma puerta en un runner Windows efímero. Se activa en PR, cambios de main y manualmente. Publica el resumen estricto en el resumen del job incluso si un control posterior falla.

No usa `pull_request_target`, secretos del repositorio, entornos de despliegue ni una conexión SQL proporcionada por el mantenedor. El checkout no conserva credenciales; los permisos se limitan a lectura y las acciones se fijan por SHA. Sólo las migraciones del arnés se aplican sobre el clúster descartable creado por él. No se publican logs privados, claves ni datos de tests como artifacts.

Las dos pruebas negativas crean un archivo propio nuevo con error de tipos o `debugger`, ejecutan `quality:check` real y comprueban el código no exitoso y el control que detuvo la ejecución antes de las regresiones. Luego eliminan únicamente ese archivo. También prueban que el código todavía no trackeado se incluye en el análisis. No stubbean el linter ni el compilador.

La regresión de navegador encontró un selector incompatible en S20-02: el [motor de texto de Playwright 1.64.1](https://github.com/microsoft/playwright/blob/v1.64.1/packages/injected/src/selectorUtils.ts#L54) excluye `NOSCRIPT` aunque JavaScript esté desactivado. Se reprodujo con el HTML estático del build: el elemento tenía texto, dimensiones y era visible mediante CSS, pero `getByText` no lo encontraba. La prueba ahora selecciona el aviso dentro de su sección, exige visibilidad y comprueba su `textContent` exacto. Se conserva el requisito y no se modifica el producto para acomodar el test.

La ejecución del workflow remoto y exigir ambos checks (calidad y dependencias) mediante protección de rama requieren publicar/configurar el repositorio GitHub. Un workflow creado no acredita una ejecución remota. OpenAPI y las demás puertas de release se incorporan con los tickets correspondientes; no se declara cumplido todo D19 con esta entrega.

## Evidencia local

Resultados del 2026-10-30, Node 24.22.1 y npm 11.19.1:

| Control | Resultado |
| --- | --- |
| Instalación limpia desde lockfile | Correcta, 443 paquetes; scripts de instalación deshabilitados |
| Preparación PostgreSQL | Binarios y checksum verificados; sin crear base habitual |
| `npm run quality:check` | Puerta completa aprobada, código de salida 0 |
| Prisma | Generación y validación correctas |
| Tipos vigentes y lint | Correctos; 188 archivos analizados por Biome |
| Perfil completo | 106 diagnósticos en 40 archivos; sin nuevos diagnósticos por estos cambios |
| Pruebas de bloqueo | 2/2 aprobadas con infracciones reales |
| Seguridad | 7/7 aprobadas |
| CLI | 19/19 aprobadas |
| Tokens UI | 2/2 aprobadas |
| HTTP | 43/43 aprobadas en 5 archivos, PostgreSQL descartable y ledger controlado |
| Build | Correcto; aviso de metadataBase en el entorno de origen sintético |
| Formato de archivos nuevos | 5 archivos comprobados sin cambios |
| Auditoría completa tras agregar Biome | 0 vulnerabilidades conocidas |
| Navegador, Chromium escritorio | E2E-03 y E2E-11 aprobados; S20-02 aprobado en repetición tras corregir el selector |

Las tres regresiones de navegador se ejecutaron con:

```sh
node node_modules/@playwright/test/cli.js test --project=chromium-desktop --grep 'E2E-03|E2E-11|S20-02'
node node_modules/@playwright/test/cli.js test --project=chromium-desktop --grep S20-02
```

La primera ejecución encontró el defecto de selector de S20-02; se conservaron sus resultados en `.cache/quality/e2e-first-run.json`. La segunda aprobó el caso corregido; sus resultados están en `.cache/e2e/report.json`. Es una regresión seleccionada de Chromium, no una ejecución completa de la matriz E2E ni aceptación de campo. Después de corregir el selector volvieron a aprobar tipos vigentes y lint; el diagnóstico completo se mantuvo en 106.

El informe HTTP queda en `.cache/api-tests/results/report.json`, y los diagnósticos completos en `.cache/quality/strict-report.{json,txt,md}`. El clúster descartable se cerró y se restauró `next-env.d.ts`. No se usó HCS real. CI remoto, protección de rama, perfil completo obligatorio y cierre global de D19 siguen con los alcances pendientes ya indicados.
