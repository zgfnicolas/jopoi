# Contactos y exportación privada

S05 implementa solicitudes reales para conocer el prototipo y su recuperación mediante CSV interno. Se desarrolló en `feature/s05-contactos-y-exportacion`, desde `main` con S04 integrada. Reutiliza `DemoRequest` de S03; no añade migraciones ni dependencias. El formulario visual corresponde a S13.

## Preparación y contrato HTTP

La API requiere `DATABASE_URL` y el origen configurado por S01. En desarrollo, `APP_URL` vacío usa `http://127.0.0.1:3000`; producción exige origen HTTPS explícito. No requiere cookie, recorrido, `SESSION_SECRET`, cron ni Hedera. `npm run dev` sirve el endpoint; `npm run build` compila las rutas y `npm start` utiliza el build previo.

`POST /api/demo-requests` acepta JSON con estos únicos atributos:

| Campo | Validación y normalización |
| --- | --- |
| `requestId` | UUID de la intención lógica, normalizado a minúsculas. |
| `name` | Texto obligatorio, 1–120 unidades UTF-16 después de recortar espacios exteriores. |
| `email` | Texto obligatorio, sintaxis de email validada por Zod y máximo 254 unidades UTF-16. Se recortan espacios exteriores y se conserva el caso; no se exige dominio empresarial. |
| `company` | Texto obligatorio, 1–160 unidades UTF-16 después de recortar espacios exteriores. |
| `message` | Texto opcional, máximo 2000 unidades UTF-16. Normaliza CRLF/CR a LF y recorta espacios exteriores; ausente o vacío equivale a SQL `null`. Enviar JSON `null` no sustituye al campo opcional. |

Las constantes y tipos compartidos están en `src/shared/contact-contracts.ts`. Nombre, email y empresa son de una línea: se rechazan controles C0/C1 y separadores Unicode U+2028/U+2029 antes de recortar. El mensaje admite tabulación y saltos CR/LF, y rechaza otros controles C0/C1. No se trunca ni modifica el contenido interior, y no se transforma a HTML.

El límite del cuerpo es 16 KiB, incluyendo la representación JSON. Se verifica Content-Length cuando existe y también el stream real. Atributos desconocidos, UTF-8/JSON inválido y límites excedidos producen `INVALID_INPUT`/400; los errores de campos solo contienen nombres permitidos y mensajes de la aplicación, sin valores recibidos.

Los POST requieren `Origin` exactamente igual al origen configurado, `Content-Type: application/json` —con parámetros opcionales como charset— y `X-Jopoi-Request: demo`. No hay CORS. Origen ausente, `null`, distinto o header de protección incorrecto producen `REQUEST_FORBIDDEN`/403. La política se comparte con S04 mediante `src/server/http.ts`, conservando sus límites de 4 KiB y contratos de sesión. No se confía en Host/X-Forwarded-Host para determinar el origen permitido.

## Resultado, persistencia y reintentos

La creación devuelve 201 y exclusivamente:

```typescript
{
  id: string,
  createdAt: string, // ISO UTC
  message: "Tu solicitud para conocer el prototipo quedó guardada."
}
```

Una repetición válida devuelve 200 con el mismo cuerpo, identificador y fecha originales. No se repiten datos personales, ni se ofrece una consulta pública por ese identificador. Las respuestas y errores del handler llevan `Cache-Control: private, no-store` y `Vary: Cookie`.

El servidor calcula SHA-256 del JSON de un array de orden fijo: `["demo-request-v1", name, email, company, message]`, después de normalizar. `requestId` no integra el contenido de esa huella: es su clave única global. No depende de una cookie o del secreto de sesión. La distinción entre mayúsculas/minúsculas del email permanece en la intención; vacío y ausente en el mensaje equivalen a `null`.

Una inserción SQL atómica respaldada por la restricción única decide quién crea. Ante duplicado se recuperan únicamente identificador, fecha, vencimiento y huella; no se sobreescribe el contacto. Misma clave y huella devuelve la confirmación original; contenido diferente produce `IDEMPOTENCY_CONFLICT`/409. Si el duplicado desaparece antes de recuperarlo, se devuelve `VERSION_CONFLICT`/409 para permitir un reintento explícito. No se reejecuta automáticamente una creación.

Cada fila vence 90 días después de su creación, con la política de S01. Repetir o exportar no amplía ese plazo. Una clave cuya fila sigue presente pero vencida produce `DEMO_REQUEST_EXPIRED`/410; se debe generar una intención nueva para volver a solicitar. Después del borrado de S10 no se conserva un tombstone: la garantía idempotente está limitada a la retención de la fila, y una clave antigua puede volver a crear una solicitud.

Una caída SQL produce `DATABASE_UNAVAILABLE`/503 según el mapeo de S03, sin confirmación ficticia. Si la respuesta de una escritura se pierde, el cliente conserva el mismo `requestId` para recuperar el resultado al reintentar. El `error.requestId` de S01 es un UUID distinto, generado por el servidor para diagnóstico; no es la clave del formulario.

Los contactos no se vinculan a sesiones ni recorridos, y no participan de QR, eventos o HCS. No se registra su contenido, email, huella o cuerpo de petición. S05 no crea agenda, correo, contrato, plazo garantizado de respuesta ni panel administrativo. No añade CAPTCHA, almacenamiento de IP ni servicios de control de abuso.

## Exportación interna

El acceso se basa en un entorno privado con credenciales SQL. No existe endpoint de exportación, sesión administrativa ni contraseña adicional. El script carga variables del proceso, `.env.local` y `.env` en ese orden de prioridad mediante el loader de S03, sin imprimirlas; usa `DATABASE_URL`, no necesita `DIRECT_URL` ni secretos de sesión, cron o red.

Desde la raíz del repositorio, con Node 24 y npm en PATH:

```powershell
npm run contacts:export -- --help
npm run db:local
npm run contacts:export -- --local-only
npm run db:local:stop
```

El ejemplo local supone la base de S03/S04 ya preparada. En este workspace Node está en `.tools/node/node-v24.22.1-win-x64`; puede anteponerse temporalmente al PATH como en las etapas anteriores. El exportador utiliza la raíz del repositorio determinada por el script, incluso si el directorio de ejecución difiere.

`--help` funciona sin cargar el entorno, crear archivos ni conectar SQL. `--local-only` exige exactamente `127.0.0.1:54321/jopoi`; sin ese flag se usa el destino privado configurado. Los únicos argumentos admitidos son esos flags; un argumento desconocido devuelve `INVALID_EXPORT_ARGUMENTS` con salida 2, sin repetir su valor.

El resultado correcto informa `CONTACTS_EXPORTED`, cantidad y ubicación de un archivo nuevo en `.cache/exports/`, ignorado por Git. Su nombre combina fecha UTC y UUID, sin datos del visitante. Se crea con `wx`, sin sobrescribir archivos previos, solicitando permisos 0600 y directorio 0700; en Windows el acceso efectivo depende de las ACL del workspace. No se imprime el CSV en stdout o logs.

La lectura se pagina en lotes de 500 con orden `createdAt`, `id` y cursor por esos mismos campos, sin offsets. Incluye solo filas creadas hasta el corte inicial y vigentes en ese corte. No consulta huellas, claves de intención ni tablas operativas. El corte delimita las fechas de inclusión; una limpieza concurrente puede retirar registros antes de leer su lote. La exportación no modifica PostgreSQL.

El archivo se sincroniza y cierra antes de comunicar éxito, y la conexión se cierra en `finally`. Si falla después de crear el archivo, se intenta cerrar y eliminar exclusivamente ese archivo incompleto. Un fallo de esa limpieza devuelve `CONTACT_EXPORT_CLEANUP_REQUIRED`: revisar los archivos de `.cache/exports/` antes de conservar o compartirlos. Otros fallos se expresan mediante códigos seguros; no se vuelcan errores SQL/OS crudos ni datos personales. Si falla la apertura exclusiva, no se elimina ningún archivo preexistente.

## CSV para Excel en Windows

Formato confirmado durante la planificación: UTF-8 con BOM, separador `;`, filas CRLF y encabezados estables `fecha_solicitud`, `nombre`, `email`, `empresa`, `mensaje`. Todas las celdas se entrecomillan y las comillas interiores se duplican. Se conserva el texto multilínea dentro de su celda; la fecha es ISO UTC y un mensaje `null` se exporta vacío.

La copia exportada recibe un prefijo de tabulación dentro de la celda entrecomillada si comienza con indicadores de fórmula `=`, `+`, `-` o `@`, incluidas las variantes de ancho completo `＝`, `＋`, `－`, `＠`; se contemplan espacios y controles iniciales antes del indicador y las celdas que empiezan por tabulación o salto de línea. Los valores almacenados en SQL no cambian.

La protección está orientada a la visualización en Excel. Los prefijos pueden formar parte del valor al importar programáticamente. No hay una sanitización CSV universal entre aplicaciones, y volver a guardar/importar puede cambiar su interpretación: ver [OWASP CSV Injection](https://github.com/OWASP/www-community/blob/master/pages/attacks/CSV_Injection.md). El separador elegido corresponde al uso regional previsto; otra configuración de Excel puede requerir seleccionarlo al importar.

El CSV es una copia privada fuera de PostgreSQL y no participa del barrido de S10. Quien lo exporta gestiona su conservación y eliminación. La exportación no prolonga los 90 días de retención de la fila original.

## Verificación realizada y pendiente

Durante S05 pasaron TypeScript, validación del schema Prisma, generación del cliente durante build, compilación Next.js con `/api/demo-requests` y las rutas de S04, y `contacts:export --help`. No se inició PostgreSQL para esta etapa, no se aplicaron migraciones y no se crearon contactos ni archivos CSV con datos. No hubo cambios de dependencias, despliegues ni consumo de testnet.

Las comprobaciones anteriores acreditan preparación y compilación; el comportamiento de API y CSV queda para S17/S18. No se crearon ni ejecutaron suites. Sus casos pendientes incluyen creación/recuperación privada, normalización, campos/tamaño/origen inválidos, idempotencia concurrente y contenido diferente, respuesta perdida, SQL caído, vencimiento, privacidad del DTO, CSV vacío/multilínea/con acentos/comillas/separadores, fórmulas y variantes, múltiples lotes, exclusión de vencidos, fallos de archivo sin sobrescritura ni éxito ficticio, y explicación visible en el formulario de S13.
