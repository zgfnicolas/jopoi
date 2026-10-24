# S13 · Landing del prototipo y formulario Book a demo

Área: Frontend · entrada al producto. Tamaño relativo: M. Dependencias: S02, S05, S12.
Estado: implementada; revisión visual pendiente por falta de navegador conectado. Ver [implementación y límites](../landing-y-solicitud-de-demo.md). Pruebas de comportamiento reservadas a S17/S18.

## Problem Statement

La persona que llega debe entender qué resuelve Jopói y cómo probarlo o solicitar conocer el prototipo, sin confundir una demo personal con un servicio comercial validado.

## Solution

Definir una landing clara con explicación del caso forestal, ejemplo económico identificado y dos accesos distintos: probar la demo y dejar una solicitud real.

## User Stories

1. Como visitante nuevo, quiero entender el beneficio en los primeros contenidos, para decidir si explorar.
2. Como generador potencial, quiero reconocer qué se hace con el material sobrante, para entender mi lugar en el caso.
3. Como comprador potencial, quiero comprender abastecimiento y costo de traslado, para evaluar el concepto.
4. Como transportista potencial, quiero entender la compatibilidad del retorno, para no interpretar cualquier camión como disponible.
5. Como visitante, quiero abrir la demo directamente, para probar sin dejar un contacto obligatorio.
6. Como persona interesada, quiero solicitar conocer el prototipo mediante Book a demo, para dejar mi interés.
7. Como persona interesada, quiero ver errores de formulario y confirmación veraz, para saber si se recibió la solicitud.
8. Como visitante, quiero reconocer qué es ilustrativo y qué funciona realmente en testnet, para evaluar con información honesta.

## Implementation Decisions

- Orden narrativo: beneficio de coordinar material y transporte; ejemplo forestal y participantes; recorrido a grandes rasgos; explicación breve de trazabilidad; accesos a probar y conocer el prototipo. Evitar comenzar por siglas blockchain.
- CTA «Probar demo» navega al recorrido sin exigir el formulario de contacto. CTA «Book a demo» lleva al formulario de la propia experiencia; no abre agenda ni checkout.
- Identificar finalidad personal, escenario ficticio y lanzamiento comercial posterior. No incluir clientes, testimonios, contratos, toneladas recuperadas o cifras ambientales inventadas.
- Los importes del ejemplo provienen de S02 y se etiquetan como ilustrativos. No convertir la tarifa de ejemplo en una oferta comercial o suscripción vigente.
- Formulario con nombre, email, empresa y mensaje opcional; etiquetas y errores en español. Uso exclusivo de la API de S05, sin integraciones de correo, calendario ni CRM.
- Confirmación después de respuesta persistida. Ante indisponibilidad, conservar campos y permitir reintento idempotente. El texto no afirma que se envió un correo ni que se reservó un horario.
- Mostrar cómo participan generador, coordinador, transportista y comprador sin crear cuatro procesos de alta.
- Explicar que el QR abre el historial y que Hedera conserva declaraciones, no prueba automáticamente una carga física ni certifica carbono.
- Mantener la información principal y enlaces utilizables incluso si el backend de demo está indisponible; el acceso a la operación muestra su estado real.

### Criterios de aceptación

1. Un visitante identifica beneficio, carácter del prototipo y las dos acciones principales.
2. Probar no obliga a enviar contacto y Book a demo no implica una reserva.
3. Un envío guardado confirma; uno fallido conserva los campos y no simula éxito.
4. No aparecen afirmaciones de validación comercial ni pruebas de impacto inexistentes.
5. El contenido principal y el formulario son utilizables en móvil y teclado.

## Testing Decisions

S18 verificará la entrada, navegación y formulario en navegador; S17 ya cubre persistencia e idempotencia del contacto. No se crea una suite en esta spec.

## Out of Scope

Campaña comercial, tarifas reales, testimonios ficticios, agenda, correo automático, checkout y muro de registro para probar.

## Further Notes

Q1, Q4, Q10, Q12 y Q27. Esta superficie comunica el alcance de prototipo personal acordado para Vercel Hobby.
