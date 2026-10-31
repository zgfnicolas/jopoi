# S22-06 · CLI, configuración y arneses estrictos

Fecha: 2026-10-31. Alcance: ticket 06, decisiones D06/D19 y comprobaciones locales de S22-10/S22-29/S22-31.

## Comportamiento

Los comandos de base de datos, entrega, aceptación y administración de topics comprueban argumentos y valores antes de usarlos. La ayuda sigue retornando antes de leer archivos de entorno; los argumentos incompletos o repetidos se rechazan antes de cargar configuración. Un archivo explícito ausente falla sin recurrir al entorno heredado. La aceptación live comprueba journal, topic y operador sin assertions de no nulidad.

El benchmark comprueba sus filas de diagnóstico PostgreSQL y la versión del servidor mediante schemas runtime. Rechaza percentiles ausentes o no finitos, baselines malformadas y mediciones sin contraparte. Las rutas son tuplas explícitas; el identificador de recorrido se valida antes de construir URLs. El agregador S21 valida los artefactos JSON y solo combina una base explícita con casos disponibles y la misma revisión. La ausencia de evidencia sigue dejando controles pendientes; no se transforma en un resultado satisfactorio.

El lector de recursos de navegador valida el JSON, destinos PostgreSQL loopback del clúster sintético, directorio UUID propio, puertos, token del marcador, socket y ubicación de binarios antes de iniciar procesos. Las escrituras de fixtures SQL comprueban esa pertenencia antes de conectar. Se conserva la segunda instancia sobre el puerto secundario del mismo clúster. Un archivo de recursos explícito ausente no tiene fallback.

Las aserciones sobre eventos comprueban que exista la entrada requerida. Los tokens CSS y bloques de temas ausentes fallan explícitamente; no se omiten comprobaciones de contraste. Los grupos de regex, seriales del certificado efímero, cookies y líneas IPC se manipulan sin accesos inciertos. Lighthouse exige valores numéricos presentes y una categoría de rendimiento antes de producir muestras; la mediana tampoco admite una muestra ausente.

## Perfil de tipos

Se corrigen los **59 diagnósticos restantes**: 15 en scripts y 44 en pruebas. `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` compilan con cero errores en el perfil completo. No se agregan casts de escape, assertions de no nulidad ni exclusiones. No se modifica la tolerancia temporal del informe ni la configuración global: exigir el perfil completo en la puerta corresponde al ticket 07.

El snapshot reproducible queda en [s22-02-diagnosticos-estrictos.md](s22-02-diagnosticos-estrictos.md). Reproducí el compilador con `npm run typecheck:strict` y el snapshot con `npm run typecheck:report -- --snapshot`.

## Verificación y límites de evidencia

Las pruebas CLI incluyen argumentos faltantes/repetidos antes de leer entorno, selección explícita sin fallback, métricas y filas ausentes, y recursos incompletos o ajenos. Las fixtures de pertenencia generan solamente archivos y credenciales sintéticas; no conectan servicios.

La primera ejecución del gate alcanzó el timeout de 15 segundos al invocar npm en la fixture de auditoría. El proceso de prueba quedó retenido tras ese fallo. La limpieza del registro sintético ahora registra y destruye también sockets todavía sin una petición HTTP, en lugar de limitarse a las conexiones HTTP reconocidas. Se detuvo únicamente el proceso de auditoría identificado para esa ejecución y se repitieron las siete pruebas de seguridad, que aprobaron conservando sus aserciones y presupuestos temporales.

La regresión HTTP usa PostgreSQL efímero y ledger controlado. Incluye exportación CSV privada, escape de fórmulas, concurrencia entre instancias y recuperación tras fallos. La evidencia local y el ledger simulado se mantienen separados de los requisitos pendientes del proveedor y HCS real.

La primera selección Chromium de E2E-10 y S20-01 falló: E2E-10 abortó una lectura de sesión a los 15 segundos y S20-01 agotó los 180 segundos del setup. Se conservaron el reporte y la traza inicial. Al repetir la selección sin cambios, E2E-10 aprobó en 47,1 segundos; S20-01 recibió `503 DATABASE_UNAVAILABLE` al publicar, con una respuesta pública segura. Ese segundo reporte y su traza también se conservaron antes de ejecutar S20-01 de forma aislada. No se modificaron timeouts, aserciones ni mecanismos de reintento del producto o de las pruebas.

No se ejecutan aceptación live, transacciones HCS reales, migraciones de un proveedor ni conexiones a la base habitual. El benchmark de carga completo y el laboratorio SEO/Lighthouse completo no se vuelven a ejecutar en este ticket; su compilación y los controles de muestras incompletas se verifican localmente. Esto no acredita métricas de producción, Core Web Vitals de campo, CI remoto ni aceptación global de S22.

### Cierre local

`quality:check` aprobado: generación y validación Prisma, tipos vigentes, lint, informe estricto, **4 controles negativos, 7 pruebas de seguridad, 54 de dominio/persistencia, 23 CLI, 2 de tokens UI, 49 HTTP y build de producción**. La regresión HTTP completa tardó 1104,54 segundos en este equipo; ese tiempo del arnés no es una medición del rendimiento del producto.

Se aprobaron **dos escenarios distintos en Chromium desktop en tandas separadas**: E2E-10 en la segunda selección y S20-01 en su ejecución aislada final de 56,9 segundos. No se ejecutó la matriz completa de navegadores/temas. Los reportes de los intentos anteriores quedan en `.cache/s22-06-browser-initial.json` y `.cache/s22-06-browser-second.json`, con sus trazas conservadas; la ejecución aislada queda en `.cache/e2e/report.json`. Logs locales: `.cache/s22-06-quality.log` y `.cache/s22-06-browser*.log`.

Para reproducir la selección, usá `node node_modules/@playwright/test/cli.js test --project=chromium-desktop --grep 'E2E-10|S20-01'`. Se invoca la CLI directamente para evitar que el wrapper de npm en Windows interprete el separador del filtro.

El ticket 06 queda completado localmente. La activación obligatoria del perfil global corresponde al 07 y espera la confirmación del usuario.
