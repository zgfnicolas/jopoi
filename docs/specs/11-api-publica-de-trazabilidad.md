# S11 · API pública de trazabilidad y verificación

Área: Backend · consulta pública integrada. Tamaño relativo: L. Dependencias: S07, S09, S10.
Estado: implementada como base de consulta pública por instrucción posterior del usuario. Tipos, Prisma y build comprobados; comportamiento por API y testnet pendiente de S17/S18. Detalle: [implementación y contratos](../api-publica-de-trazabilidad.md).

## Problem Statement

Compartir el recorrido debe permitir comprobar sus declaraciones sin revelar sesiones o contactos y sin otorgar permiso para modificarlo. La verificación no puede basarse únicamente en datos locales.

## Solution

Exponer una proyección pública de solo lectura con eventos, estados de red y enlaces verificables; distinguir inexistencia, vencimiento, pendiente y discrepancia.

## User Stories

1. Como persona con un QR, quiero consultar sin registrarme, para comprender el historial.
2. Como persona que consulta trazabilidad, quiero ordenar los hitos del recorrido, para seguir lo ocurrido.
3. Como persona que consulta trazabilidad, quiero ver el detalle y su hash, para contrastar la declaración.
4. Como persona que consulta trazabilidad, quiero abrir una referencia de testnet, para comprobarla externamente.
5. Como visitante propietario, quiero compartir la consulta sin compartir mi sesión, para conservar mis permisos privados.
6. Como persona que consulta trazabilidad, quiero entender una verificación pendiente o fallida, para no asumir evidencia inexistente.
7. Como responsable del prototipo, quiero que un escaneo no genere un nuevo mensaje HCS, para conservar la cuota.
8. Como persona que consulta trazabilidad, quiero saber si la consulta venció, para no interpretar una pantalla vacía como recepción conforme.

## Implementation Decisions

- GET /api/traces/{traceId} devuelve solo la proyección pública vigente: marca demo, escenario ficticio, estado operativo, declaración, recepción si existe y eventos ordenados con sus estados públicos de red.
- GET /api/traces/{traceId}/events/{eventId}/verification permite consultar o recuperar contraste de lectura. Esa consulta no reenvía a HCS, no crea eventos ni actúa como cron público.
- El detalle público usa una lista explícita de atributos. Nunca serializar la sesión, relaciones de contactos, bytes firmados, leases, claves ni errores crudos del SDK.
- El resultado de verificación identifica evento, versión, digest local, digest remoto observado cuando exista, coincidencia de identificadores, topic, transactionId, secuencia y timestamp de consenso, con disponibilidad explícita.
- Si solo existe receipt exitoso, mostrar confirmado con verificación pendiente. Si el mensaje remoto difiere, mostrar discrepancia sin sobrescribir el payload original para hacerlo coincidir.
- Adjuntar URLs HTTPS de explorador o mirror de testnet construidas desde identificadores validados. No aceptar destinos arbitrarios enviados por visitantes.
- El identificador público aleatorio es localizador, no token de autorización. Ningún endpoint público cambia estado operativo, reinicia el recorrido, consume reintentos manuales o publica mensajes.
- Aplicar expiración operativa antes de construir el DTO. Recurso vencido devuelve 410 si se conoce esa condición; después del borrado puede devolver no disponible/404 sin reconstruir información privada. Ambas respuestas deben explicarse sin inventar historial.
- Cache de consultas, si se usa, no debe servir datos después del vencimiento ni congelar una confirmación pendiente como definitiva. La lectura de red tiene timeout y no provoca polling permanente.
- Errores de verificación preservan la distinción entre falta de disponibilidad, ausencia momentánea y discrepancia comprobada. No afirmar que el camión transportó físicamente el peso declarado.

### Criterios de aceptación

1. Un visitante sin sesión consulta el recorrido y no obtiene atributos privados.
2. Consultar o verificar no crea un mensaje ni consume una exploración.
3. El contraste usa el mensaje remoto cuando está disponible y detecta alteración del detalle.
4. Un recorrido vencido no continúa visible por cache o por una URL guardada.
5. Los enlaces externos refieren exclusivamente al registro testnet correspondiente.

## Testing Decisions

S17 cubrirá DTO, privacidad, caducidad y contraste a través de la API pública. S18 cubrirá abrir enlaces compartidos, leer estados y usar el QR sin convertirse en propietario.

## Out of Scope

Escritura pública, buscador de todas las operaciones, datos comerciales reales, certificación física y permanencia pública indefinida.

## Further Notes

Q9, Q17 y Q21. La consulta compartible es un producto de lectura; no acredita identidad de las empresas simuladas.
