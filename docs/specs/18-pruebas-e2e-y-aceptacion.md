# S18 · Pruebas de navegador y aceptación final

Área: Pruebas · sistema completo. Tamaño relativo: XL. Dependencias: S12–S17.
Estado: suite local y herramientas de aceptación implementadas. La aceptación del candidato publicado, planes gratuitos y cinco hitos reales de testnet requiere evidencia externa; permanece bloqueada hasta obtenerla. Ejecución y resultados: [documentación S18](../pruebas-e2e-y-aceptacion.md). Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

Una API correcta no demuestra que una persona comprenda el beneficio, complete el flujo desde móvil o vea una integración real de Hedera en la URL publicada.

## Solution

Ejecutar al final recorridos de navegador y una aceptación controlada del candidato gratuito, con evidencia separada de pruebas deterministas y de testnet real.

## User Stories

1. Como visitante nuevo, quiero comprender el prototipo y sus dos accesos, para empezar sin una explicación externa.
2. Como visitante, quiero completar conformidad, rechazo e incidencia, para explorar el alcance acordado.
3. Como visitante móvil, quiero usar todos los controles esenciales, para probar desde mi teléfono.
4. Como visitante que usa teclado, quiero navegar formularios y mensajes, para completar tareas sin ratón.
5. Como persona interesada, quiero saber si se guardó mi solicitud, para confiar en la confirmación.
6. Como persona que recibe un QR, quiero leer sin obtener permisos de edición, para consultar el historial.
7. Como visitante, quiero ver correctamente pendientes, fallos y cuota, para no confundirlos con éxito.
8. Como responsable del prototipo, quiero comprobar cinco hitos reales en testnet, para acreditar la integración de la demo.
9. Como responsable del prototipo, quiero un informe de aceptación con bloqueos concretos, para no declarar terminada una integración sin credenciales.
10. Como responsable del prototipo, quiero verificar gasto cero y mantenimiento diario, para entregar dentro de las restricciones.

## Implementation Decisions

- Esta es la última spec del orden. Requiere el comportamiento de S01–S16 y los resultados de S17; no vuelve a introducir TDD ni suites anticipadas contra la indicación del usuario.
- Frontera complementaria confirmada: navegador real actuando como visitante sobre la aplicación. Usar selectores por rol, etiqueta y texto significativo; no depender de clases CSS ni estructura interna de componentes.
- Recorridos deterministas sobre entorno aislado con SQL real y proveedor externo controlado. Dos contextos de navegador permiten comprobar separación y compartir consulta sin compartir cookie.
- Ejecutar en escritorio y móvil, con navegación por teclado y mensajes de error observables. Verificar que el contenido no queda cortado ni requiere descubrir controles fuera del orden de lectura.
- No repetir cada combinación de regla de S17 en navegador; concentrarse en tareas completas, navegación, formularios, confirmaciones, recuperación y comprensión de estados.
- Prueba real separada sobre un recorrido sintético controlado con configuración testnet explícita: publicar, aprobar, asignar, retirar y recibir; registrar los cinco eventos y contrastar el detalle con sus mensajes.
- Registrar por hito identificador público, transactionId, topic, secuencia, digest y resultado observado; sin claves ni datos personales. Respetar el cupo y no limpiar mensajes de red para repetir la prueba.
- Si falta acceso a Vercel, Neon, operador, topic o saldo ficticio, marcar la aceptación afectada como bloqueada y describir exactamente el requisito. No sustituirla por un doble de red ni declarar aprobación global.
- El candidato publicado mantiene finalidad personal, formulario real para conocer el prototipo, presupuesto cero y ausencia de upgrades. No se usa la prueba como lanzamiento comercial.
- Resultados mínimos: escenario, entorno, fecha, evidencia, aprobado/fallido/bloqueado y recuperación pendiente. El estado final del producto se deriva de evidencia, no de que compiló o abrió una página.

### Criterios de aceptación

1. Las tareas esenciales funcionan en escritorio, móvil y teclado con datos de ejemplo identificados.
2. Se completan los tres terminales y el reingreso al recorrido sin consumo accidental de cupo.
3. Formulario, QR y consulta compartida tienen resultado observable y respetan privacidad.
4. Existe evidencia separada de los cinco hitos reales de un camino conforme en testnet.
5. Todos los criterios del alcance tienen resultado explícito; cualquier bloqueo impide declarar terminada esa parte.
6. La URL, los recursos y el mantenimiento cumplen el presupuesto y la frecuencia diarios acordados.

## Testing Decisions

Confirmado: API pública en S17 y navegador aquí. La implementación usa Playwright con Chromium de escritorio y WebKit móvil emulado, PostgreSQL aislado y HCS/mirror controlados. La comprobación real permanece separada y exige candidato y evidencia explícitos.

### Matriz de casos

| Caso | Escenario | Resultado esperado |
| --- | --- | --- |
| E2E-01 | Entrada | El visitante comprende material, coordinación y finalidad del prototipo antes de encontrar detalles técnicos. |
| E2E-02 | Accesos independientes | Probar abre sin formulario obligatorio; Book a demo solicita conocer el prototipo sin reservar horario. |
| E2E-03 | Conformidad | Se recorre generador, coordinador, transportista y comprador con rol simulado visible. |
| E2E-04 | Rechazo | Humedad alta bloquea aprobación y permite rechazo con motivo; no se reabre el terminal. |
| E2E-05 | Incidencia | Peso distinto exige incidencia y conserva ambos valores; no se presenta como recepción conforme. |
| E2E-06 | Persistencia y cupo | Recargar recupera estado; dos reinicios completan tres exploraciones; otro inicio queda bloqueado. |
| E2E-07 | Contacto | Errores conservan campos; guardado real confirma; falla SQL no simula correo, reserva ni éxito. |
| E2E-08 | Compartir y QR | Otra sesión abre lectura sin controles de escritura; el QR no contiene secretos y tiene enlace textual. |
| E2E-09 | Estados de red | Pendiente, incertidumbre, cuota, confirmación y discrepancia se comprenden sin equipararlos. |
| E2E-10 | Responsive y teclado | Acciones, etiquetas, foco y mensajes funcionan en los tamaños previstos sin ocultar información esencial. |
| E2E-11 | Vencimiento | Sesión vencida bloquea escritura y recorrido vencido deja de mostrar datos, incluso desde un enlace guardado. |
| E2E-12 | Testnet real | Cinco hitos del camino conforme están confirmados y su contenido puede contrastarse, con evidencia de identificadores. |
| E2E-13 | Entrega gratuita | La URL corresponde al candidato Hobby, PostgreSQL a Neon Free y la configuración usa testnet sin tarjetas ni compras. |
| E2E-14 | Operación diaria | Se comprueba el punto protegido de mantenimiento y la política diaria, sin prometer puntualidad exacta. |
| E2E-15 | Contenido honesto | Sin clientes, testimonios o impactos inventados; valores, evidencia y roles ficticios identificados. |

## Out of Scope

Pruebas de carga masivas, certificación de accesibilidad, auditoría de carbono, operaciones físicas, contactos reales de terceros usados como fixtures y aprobación comercial.

## Further Notes

Cierra la secuencia backend → frontend → entrega → pruebas. S18 incorpora ejecución local de navegador; no se ha desplegado ni enviado transacciones reales de testnet durante esta implementación. El informe agregado conserva esos bloqueos.
