# S22-19 · Mostrar el historial inicial sin JavaScript y con status real (`D09`, `D11`, `AUD-06`, `AUD-10`)

## Trazabilidad y objetivos

- **Spec S22:** historias 51, 52, 53, 54, 56 y 57; decisiones `D09` y `D11`; hallazgos de auditoría `AUD-06` y `AUD-10`; escenarios `S22-01`, `S22-19` y `S22-21`.
- **Objetivo:** Permitir abrir una trazabilidad pública y leer su historial inmediatamente, aun sin JavaScript o con conexiones lentas, recibiendo un status HTTP real (`404 Not Found`, `410 Gone`, `429 Too Many Requests`, `503 Service Unavailable`) resuelto en una frontera previa antes de emitir el shell de la aplicación. Servir el render inicial mediante el servicio compartido en Node.js sin llamadas servidor→API propia, garantizando que la navegación y prefetch no consumen cupos de sesión, no generan sesiones ni realizan escrituras en Hedera Consensus Service. Proporcionar enlaces textuales útiles y reservar geometría fija para códigos QR e interacciones progresivas sin provocar hydration mismatches.

---

## 1. Frontera HTTP Previa Compatible con el Framework (`D11`, `AUD-10`, `S22-19`)

Dado que las primitivas de Server Components de Next.js App Router no permiten emitir códigos de estado HTTP arbitrarios como `410 Gone` o `503 Service Unavailable` desde un `page.tsx` sin degradar a un error `500` genérico o un shell `200` con aviso falso, se implementó una frontera HTTP previa en [`src/proxy.ts`](../src/proxy.ts) respaldada por [`src/server/traces/page-boundary.ts`](../src/server/traces/page-boundary.ts):

1. **Intercepción de `/trazabilidad/:path*`:**
   - La convención `proxy.ts` de Next.js 16 intercepta las solicitudes a nivel de red antes de iniciar el ciclo de renderizado de la página o de componentes de servidor.
2. **Validación, Admisión y Presupuesto Tempranos:**
   - Se valida el formato UUID del identificador de recorrido; si la ruta carece de identificador, tiene segmentos adicionales o no cumple con la sintaxis UUID, se responde inmediatamente con `404 Not Found`.
   - Se aplica la admisión por tasa pública con [`requireRateLimit(request, "TRACE")`](../src/server/security/rate-limit.ts). Si se supera la cuota pública, responde con `429 Too Many Requests` y cabecera `Retry-After`.
3. **Comprobación de Existencia y Expiración:**
   - Se consulta la existencia y vigencia del recorrido utilizando el servicio compartido [`publicTraceReader().getTrace(traceId)`](../src/server/traces/queries.ts).
   - Si no existe: responde `404 Not Found`.
   - Si expiró (`run.expiresAt <= now()`): responde `410 Gone` real con cabecera `Cache-Control: no-store`.
   - Si la base de datos o el pool fallan: responde `503 Service Unavailable` con diagnóstico correlacionado.
4. **Respuestas Seguras:**
   - Las respuestas de error emiten HTML limpio, semántico y accesible con estilos compatibles con Jopói, enlace de retorno seguro a `/#consultar-trazabilidad` y metaetiqueta `noindex, nofollow`, sin exponer trazas privadas, credenciales ni rutas internas.
   - Si el cliente solicita explícitamente `Accept: application/problem+json`, la frontera responde con RFC 9457 Problem Details (`application/problem+json`).
5. **Optimización de Paso Upstream:**
   - Para solicitudes válidas, la frontera inyecta el payload serializado en la cabecera interna `x-jopoi-trace-payload`, permitiendo que el Server Component en `page.tsx` lo consuma directamente sin duplicar transacciones ni generar contención en el pool de PostgreSQL.

---

## 2. Render Inicial Server-Side sin JavaScript (`D11`, `AUD-10`, `S22-19`)

En [`src/app/trazabilidad/[traceId]/page.tsx`](../src/app/trazabilidad/[traceId]/page.tsx) y [`src/components/trace-reader.tsx`](../src/components/trace-reader.tsx):

1. **Consulta al Servicio Compartido (Sin Fetch Servidor→API):**
   - El Server Component obtiene la trazabilidad mediante la cabecera inyectada o invocando directamente [`publicTraceReader().getTrace(traceId)`](../src/server/traces/queries.ts). Nunca realiza peticiones HTTP a su propio dominio (`http://localhost.../api/...`).
2. **Historial Completo en el Documento Inicial:**
   - El HTML inicial contiene todo el detalle necesario para la lectura:
     - Datos del escenario: material, descripción, generador y comprador simulados, ruta y distancia.
     - Cantidades: declaración de peso y humedad, recepción e incidencias si corresponden.
     - Línea de tiempo completa: hitos ordenados, roles simulados, fechas de aplicación y confirmación, resúmenes de integridad y contraste histórico.
     - Detalles técnicos: elemento `<details>` nativo expandible sin JavaScript para consultar hashes SHA-256 canónicos JCS y payloads indentados.
     - Enlaces textuales: vínculos `<a>` a los endpoints de mirror node de Hedera (`links.transaction`, `links.topic`, `links.message`).
3. **Aviso `<noscript>` Informativo:**
   - Se aclara al usuario que el historial y los enlaces están disponibles inmediatamente en la página, y que JavaScript solo se requiere para el contraste en vivo con el mirror node y la generación dinámica del código QR.

---

## 3. Interacción Progresiva y Cero Hydration Mismatches (`D11`, `S22-21`)

1. **Estado Inicial en `useReadResource`:**
   - En [`src/frontend/use-read-resource.ts`](../src/frontend/use-read-resource.ts) se añadió soporte para `initialData?: T`.
   - Cuando se provee `initialData`, el estado arranca directamente en `status: "ready"`, evitando mostrar esqueletos o avisos de carga en el HTML del servidor y durante la hidratación.
   - En el cliente, la carga inicial (`revision === 0`) omite el fetch redundante (`initialSkip`), preservando la lectura server-side sin duplicar tráfico en el montaje.
2. **Reserva de Geometría en Código QR:**
   - En [`src/components/trace-share.tsx`](../src/components/trace-share.tsx), el contenedor del código QR utiliza una figura con ancho fijo de 256px y placeholder con `aspect-ratio: 1`, garantizando que la carga asíncrona de `qrcode` no genere desplazamientos de diseño (CLS = 0).
   - El enlace textual canónico y la dirección completa están presentes en el marcado inicial.
3. **Invariantes Operativas y Seguridad:**
   - La consulta pública no emite `Set-Cookie`, no crea registros de sesión y no incrementa el cupo de recorridos.
   - Las lecturas de trazabilidad y prefetches no generan mensajes HCS ni consumen saldo de red.

---

## 4. Evidencia de Verificación (`D21`, `S22-19`)

- **Prueba automatizada:** `tests/api/seguridad.test.ts` (`S22-19 · historial inicial sin JS, status reales 404/410/503 antes del shell y sin consumo de cupo ni envíos HCS`).
- **Casos verificados:**
  1. Consulta HTTP directa devuelve `200` con `Cache-Control: no-store` y `Vary: Accept`.
  2. Presencia en el HTML inicial de material, generador, comprador, ruta, pesajes, eventos, digests y enlaces textuales.
  3. Recorrido inexistente devuelve `404 Not Found` real con HTML seguro antes del shell.
  4. Recorrido sintácticamente inválido devuelve `404 Not Found`.
  5. Ruta sin identificador devuelve `404 Not Found`.
  6. Recorrido vencido (7 días) devuelve `410 Gone` real tanto en navegación directa como en prefetch RSC.
  7. Negociación `Accept: application/problem+json` devuelve estructura RFC 9457 adecuada.
  8. Ausencia de consumo de cupo de recorridos y ausencia de envíos HCS adicionales.
