# S22-21 · Aplicar CSP estricta sin romper tema, formularios ni QR (`D09`, `D11`, `D12`, `AUD-06`)

## Trazabilidad y objetivos

- **Spec S22:** historias 43, 44, 53, 56, 57 y 85; decisiones `D09`, `D11` y `D12`; hallazgo de auditoría `AUD-06`; escenarios `S22-15`, `S22-19`, `S22-21` y `S22-22`.
- **Objetivo:** Proteger las páginas de la aplicación frente a scripts y frames no autorizados con una Content-Security-Policy (CSP) restrictiva y cabeceras efectivas, preservando la operatividad del tema, formularios y código QR, y manteniendo una decisión técnica explícita sobre render estático con hashes y render dinámico con nonces.

---

## 1. Política de Seguridad CSP Restrictiva (`D09`, `AUD-06`, `S22-15`)

En [`src/server/security/headers.ts`](../src/server/security/headers.ts), se centralizan la política de seguridad y la construcción de cabeceras efectivas:

1. **Directivas Fundamentales de CSP:**
   - `default-src 'self'`: Restringe la carga de cualquier recurso no especificado al origen propio.
   - `script-src 'self' <hashes> <nonce>`:
     - Autoriza los bundles JavaScript de Next.js (`'self'`).
     - Autoriza el script de bootstrap de tema mediante su hash SHA-256 inmutable (`'sha256-6ksMzoIWXuojp33+exRxOsv2d21Si4LWiJWnnC9w1gI='`).
     - Autoriza los cargadores de chunks de Turbopack, las funciones de hidratación y los payloads RSC estáticos mediante hashes criptográficos.
     - En rutas dinámicas, autoriza scripts en tiempo de render mediante un `nonce` criptográfico por solicitud.
     - **Sin `'unsafe-inline'` general:** Ningún script inline no autorizado puede ejecutarse.
     - `'unsafe-eval'` se habilita estrictamente en desarrollo local para las herramientas de diagnóstico y reconstrucción de stack traces de React; en producción queda **terminantemente excluido**.
   - `object-src 'none'`: Bloquea completamente la ejecución de plugins, Flash o applets heredados.
   - `base-uri 'none'`: Impide la inyección de etiquetas `<base href="...">` que pudieran alterar la resolución de enlaces relativos.
   - `form-action 'self'`: Garantiza que los formularios (como el de solicitud de demo) sólo puedan enviar datos al mismo origen.
   - `frame-ancestors 'none'`: Prohíbe que la aplicación sea embebida en `<iframe>`, `<frame>`, `<embed>` o `<object>` en cualquier sitio web, neutralizando ataques de clickjacking.

2. **Excepciones Justificadas (`D09`):**
   - `style-src 'self' 'unsafe-inline'`: Justificada para la inyección de estilos de componentes Next.js, CSS Modules, Tailwind y variables de tema (`light`/`dark`).
   - `img-src 'self' data:`: Justificada para admitir assets locales y la generación en navegador del código QR de trazabilidad en formato `data:image/png;base64,...`.
   - `font-src 'self'`: Justificada para servir fuentes tipográficas empaquetadas localmente (`next/font/local` con Barlow Semi Condensed y `@fontsource-variable/dm-sans`).
   - `connect-src 'self' https://testnet.mirrornode.hedera.com`: Justificada para llamadas API propias y el contraste voluntario de hitos directamente contra el Mirror Node oficial de Hedera testnet.
   - **Sin CORS abierto:** No se introduce `Access-Control-Allow-Origin: *` ni se admiten orígenes externos no justificados.

---

## 2. Arquitectura Híbrida: Prerender Estático con Hashes y Subárbol Dinámico con Nonce (`D09`, `D11`, `D12`)

La spec (`D09`, `D11`) establece la preferencia por mantener la landing prerenderizada y el uso de nonces en subárboles dinámicos, documentando la decisión técnica:

1. **Páginas Estáticas (`/` y `/demo`):**
   - Se conservan como prerenderizadas estáticamente en el build de producción Turbopack (`○ (Static)`), garantizando CDN caching, cero latencia de cómputo en origen y CLS=0.
   - Para proteger estas páginas sin recurrir a dynamic rendering forzado ni a `unsafe-inline`, `collectBuildScriptHashes()` inspecciona los artefactos estáticos del build (`.next/server/app/*.html`) e incorpora los hashes SHA-256 de los scripts inline de Turbopack e hidratación inicial a la directiva `script-src`.
2. **Rutas Dinámicas (`/trazabilidad/*`):**
   - En [`src/proxy.ts`](../src/proxy.ts) y [`src/server/traces/page-boundary.ts`](../src/server/traces/page-boundary.ts), cada solicitud genera un nonce aleatorio de 128 bits base64 (`crypto.randomUUID()`).
   - El nonce se propaga a la solicitud mediante el encabezado `x-nonce` y la directiva `script-src 'nonce-<nonce>'` en `Content-Security-Policy`.
   - Next.js asocia automáticamente el nonce a los fragmentos de script generados durante el render en el servidor.
3. **Páginas de Error y Frontera Segura:**
   - Las respuestas de error (404, 410, 429, 503) entregadas por `renderSafePageResponse` emiten HTML puro o Problem Details con la política de seguridad completa, garantizando que un fallo o denegación no degrade las cabeceras de protección.

---

## 3. Cabeceras Efectivas y Frontera HTTPS (`D09`, `S22-15`)

En [`next.config.ts`](../next.config.ts) y [`src/server/traces/page-boundary.ts`](../src/server/traces/page-boundary.ts):

1. **Cabeceras Globales de Seguridad:**
   - `X-Content-Type-Options: nosniff`: Evita que el navegador realice MIME-type sniffing en respuestas HTTP.
   - `Referrer-Policy: strict-origin-when-cross-origin`: Restringe el envío de la URL de referencia a navegación cruzada y protege rutas internas.
   - `X-Frame-Options: DENY`: Defensa en profundidad junto a `frame-ancestors 'none'`.
2. **HSTS Condicional a la Frontera Aplicable (RFC 6797):**
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`:
     - Se aplica exclusivamente cuando el transporte es seguro (`request.url.startsWith("https:")` o encabezado `x-forwarded-proto: https` proveniente del terminador TLS/hosting).
     - Se omite en transporte HTTP plano (como en arneses locales), respetando estrictamente el RFC 6797 que prohíbe emitir HSTS en canales no cifrados.
3. **Soporte de Ensayo Report-Only:**
   - `getSecurityHeaders` y `buildContentSecurityPolicy` admiten la opción `reportOnly` y la variable de entorno `JOPOI_CSP_REPORT_ONLY="true"`.
   - En modo ensayo, se emite `Content-Security-Policy-Report-Only` para auditoría previa; por defecto en producción se aplica enforcement estricto con `Content-Security-Policy`.

---

## 4. Preservación de Experiencia: Tema, Formulario y QR (`D09`, `D11`, `S22-15`)

1. **Bootstrap y Selector de Tema:**
   - El script inline en `<head>` de [`src/app/layout.tsx`](../src/app/layout.tsx) ejecuta la lectura sincrónica de `localStorage.getItem("jopoi.theme")`.
   - El hash SHA-256 está fijado en `THEME_BOOTSTRAP_HASH` y coincide bit a bit con el script inyectado, permitiendo que el tema se aplique instantáneamente sin FOUC y sin requerir `unsafe-inline`.
2. **Formulario de Contacto y Solicitud de Demostración:**
   - El formulario en [`src/components/demo-request-form.tsx`](../src/components/demo-request-form.tsx) realiza validación y envío a `/api/demo-requests`.
   - La directiva `form-action 'self'` y `connect-src 'self'` garantizan su funcionamiento sin bloqueos de CSP.
3. **Visualización y Generación de Código QR:**
   - El componente [`src/components/qr-code.tsx`](../src/components/qr-code.tsx) genera la imagen QR de la URL de trazabilidad en memoria y la renderiza mediante una imagen con URI `data:image/png;base64,...`.
   - La directiva `img-src 'self' data:` permite este flujo manteniendo bloqueada cualquier imagen externa no autorizada.

---

## 5. Verificación y Calidad

- **Pruebas de Contratos:**
  - [`tests/contracts/boundary.test.ts`](../tests/contracts/boundary.test.ts) valida:
    - Directivas completas de `buildContentSecurityPolicy` (default, script, object, base-uri, form-action, frame-ancestors, img, style, font, connect).
    - Exclusión de `unsafe-inline` y `unsafe-eval` en modo producción.
    - Presencia de `unsafe-eval` en modo desarrollo.
    - Soporte de nonces en `script-src`.
    - Cabeceras `nosniff`, `Referrer-Policy`, `DENY` y emisión condicional de HSTS en HTTPS frente a omisión en HTTP.
    - Alternancia ensayable a `Content-Security-Policy-Report-Only`.
    - Emisión íntegra de cabeceras en `renderSafePageResponse` para HTML y Problem Details.
- **Pruebas HTTP y Frontera de Seguridad:**
  - [`tests/api/seguridad.test.ts`](../tests/api/seguridad.test.ts) (escenario `S22-15`):
    - Comprueba cabeceras CSP, nosniff, referrer, DENY en `GET /`, `GET /demo`, `GET /trazabilidad/:traceId` y `GET /trazabilidad/unknown` (404).
    - Comprueba que en HTTP plano HSTS es nulo y con `X-Forwarded-Proto: https` emite HSTS estricto.
    - Comprueba la coincidencia exacta del hash del script de tema inyectado en el HTML.
- **Pruebas E2E en Navegador Real (Chromium):**
  - [`tests/e2e/seguridad.spec.ts`](../tests/e2e/seguridad.spec.ts) (escenario `S22-UI-03`):
    - Verifica que el navegador reciba las cabeceras CSP efectivas sin `unsafe-inline`.
    - Verifica la interacción del selector de tema y formulario en vivo.
    - Comprueba que una inyección dinámica de script no autorizada sea efectivamente bloqueada por el navegador.
- **Quality Gates:**
  - `npm run typecheck` (0 errores)
  - `npm run typecheck:strict` (0 diagnósticos)
  - `npm run typecheck:api` (0 diagnósticos)
  - `npm run lint` (Biome: 234 archivos aprobados)
  - `npm run test:contracts` (23 pruebas aprobadas)
  - `npm run test:domain` (54 pruebas aprobadas)
  - `npm run test:cli` (24 pruebas aprobadas)
  - `npm run test:observability` (4 pruebas aprobadas)
  - `npm run test:security` (7 pruebas aprobadas)
  - `npm run test:ui:tokens` (2 pruebas aprobadas)
  - `npm run api:check` (OpenAPI sincronizado)
  - `npm run build` (Build de producción Turbopack exitoso)
