# S22-05 · Edición e intenciones tipadas del panel

Fecha: 2026-10-31. Alcance: ticket 05, D06/D19 y partes aplicables de S22-03/S22-10/S22-11. Se mantiene el contrato HTTP existente y la experiencia de roles simulados. No hay cambios de esquema, dependencias ni despliegues externos.

## Intención y estado de solicitud

El controlador usa `OperationIntent`, introducido en el ticket 03. Cada variante requiere sus datos: bootstrap/start/reset tienen rutas concretas; command exige recorrido, acción y versión esperada; retry exige recorrido e hito. Todas conservan el body serializado original, incluido su `requestId`, sin reconstruirlo al reintentar.

La actividad distingue `loading`, `submitting` e `idle`. La resolución distingue `ready`, `pending`, `confirmed`, `uncertain` y `conflict`; pending/confirmed/uncertain requieren la intención correspondiente. La actividad de lectura es independiente de esa resolución: actualizar una lectura puede mostrar un snapshot nuevo mientras conserva una intención incierta que sigue bloqueando escrituras. El ref sincronizado y el lock impiden que dos eventos anteriores al siguiente render creen intenciones simultáneas.

- Una respuesta perdida, inválida, 429 temporal o error 5xx conserva la intención. Solo el botón de reintento manual vuelve a enviar sus mismos bytes y clave.
- Una lectura exitosa no confirma por inferencia el POST incierto, no lo reenvía ni permite otra escritura mientras siga pendiente de resolución.
- Un POST confirmado permanece confirmado aunque falle el GET posterior. Se bloquea otra escritura hasta recuperar una lectura válida; no se ofrece reenviar el POST ya confirmado.
- Un conflicto conserva la edición. La lectura del estado actual no basta para habilitar otro envío: el participante debe revisar y elegir usar los datos guardados o conservar su edición para enviar una intención nueva contra la versión actual.
- Al recuperar una sesión inicial, primero se comprueba si llegó su cookie HttpOnly. Solo después de confirmar ese paso se captura la intención de crear el recorrido.

El borrador y la intención siguen siendo memoria transitoria. **Actualizar lectura** conserva ambos; recargar o abandonar el documento los pierde y recupera únicamente el snapshot SQL disponible. La recarga no repite un POST ni inventa la confirmación de la intención perdida. No se agregan credenciales ni intenciones a localStorage/sessionStorage.

## Validación y perfil estricto

La selección de rol usa el schema runtime de roles en lugar de una assertion. El rol esperado se obtiene de un mapa exhaustivo de los ocho estados, con null para terminales. Las filas económicas se modelan como tuplas para que un índice ausente no llegue al formateador.

Los transportes mantienen validación de éxito y error. La identificación de códigos usa propiedades propias del catálogo, sin casts ni aceptar nombres del prototipo; también se contrasta el status HTTP. Los metadatos opcionales ausentes se omiten al construir errores. Los componentes de campos admiten explícitamente undefined como ausencia de texto de ayuda/error; esto se limita a props de presentación, sin relajar los contratos de dominio.

Se corrigieron accesos a grupos de expresiones regulares e índices del historial. Frontend y componentes quedan sin diagnósticos con `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. La puerta agrega esas áreas a las ya exigidas en servidor/dominio y prueba un fallo estricto real en frontend. Permanecen visibles 59 diagnósticos en scripts/tests hasta los tickets 06–07.

## Verificación

Las pruebas de navegador interactúan con controles y observan HTTP. Inyectan pérdida de respuesta antes o después de llegar al servidor, fallo del GET posterior a un POST confirmado y pérdida de respuesta de reintento de publicación. El conflicto se produce mediante otra pestaña con la misma sesión. No inspeccionan estado de React ni sustituyen funciones internas.

Se aprobaron los cinco escenarios nuevos S22-UI-01–04 (UI-02 tiene dos variantes) y cuatro regresiones: E2E-03, E2E-06, E2E-11 y S21-UI-02. Son **9 escenarios distintos en Chromium desktop**, ejecutados en dos tandas; la última aprobó sus 7 casos seleccionados. No se ejecutó la matriz completa de navegadores/temas.

El interceptor que simula pérdida de respuesta se retira antes de recargar el documento, para restituir la caché normal del navegador. La observación de requests permanece activa y sigue detectando cualquier POST extra. No se aumentaron timeouts ni se retiraron aserciones: se corrigió la interferencia del fixture con la descarga de bundles de desarrollo. Un caso bloqueado durante el arranque del servidor también se repitió y aprobó.

Al verificar el gate, el fixture de auditoría alcanzó su deadline al iniciar npm y la suite quedó retenida. Se serializaron sus archivos de seguridad y se registra cada socket aceptado desde el evento de conexión, para incluirlo en la limpieza aunque falle el handshake del cliente. Se mantienen las siete comprobaciones y sus presupuestos originales; esto no cambia el transporte de la aplicación ni sus dependencias.

Para reproducir la selección completa, usá directamente la CLI de Playwright; así el wrapper de npm en Windows no interpreta los separadores del filtro:

```powershell
node node_modules/@playwright/test/cli.js test --project=chromium-desktop --grep 'S22-UI|E2E-03|E2E-06|E2E-11|S21-UI-02'
```

Los recursos de PostgreSQL y HCS son aislados, con ledger controlado y sin envíos a testnet real. La evidencia local no acredita CI remoto ni aceptación global de S22.

### Cierre local

`quality:check` aprobado: generación/validación Prisma, tipos vigentes, lint, informe estricto, **4 controles negativos del gate, 7 pruebas de seguridad, 54 de dominio/persistencia, 19 CLI, 2 de tokens UI, 49 HTTP y build de producción**. Se conservan los 59 diagnósticos de scripts/tests; servidor, dominio, frontend y componentes quedan sin diagnósticos y protegidos contra regresión por el gate.

El ticket 05 queda completado localmente. Se espera confirmación antes de implementar el 06.
