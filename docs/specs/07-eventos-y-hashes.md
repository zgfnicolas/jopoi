# S07 · Eventos inmutables, hash y pendiente transaccional

Área: Backend · trazabilidad local. Tamaño relativo: M. Dependencias: S03, S06.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

Guardar un estado sin su evidencia o recalcular después un evento con datos distintos impide contrastar lo que realmente se declaró. Una llamada de red dentro de una transacción tampoco resuelve la consistencia entre SQL y Hedera.

## Solution

Crear por cada hito un evento público inmutable y un pendiente durable dentro de la misma transacción que la acción, con contenido y representación canónica versionados.

## User Stories

1. Como persona que consulta trazabilidad, quiero ver cada declaración original, para contrastar su huella.
2. Como visitante, quiero que guardar un borrador no envíe mensajes, para comprender qué acciones generan evidencia.
3. Como coordinador representado, quiero que una acción y su evento se guarden juntos, para no perder el historial.
4. Como visitante, quiero que un fallo de red conserve el pendiente, para continuar sin una confirmación inventada.
5. Como persona que consulta trazabilidad, quiero distinguir hora de la aplicación y hora de consenso, para interpretar el registro.
6. Como responsable del prototipo, quiero que el hash excluya contactos y secretos, para mantener privado el acceso.
7. Como desarrollador, quiero que el mismo detalle produzca la misma huella, para permitir verificación independiente.
8. Como visitante, quiero que repetir una acción no genere dos hitos, para conservar un historial coherente.

## Implementation Decisions

- Tipos de evento v1: LOT_PUBLISHED, LOT_APPROVED, LOT_REJECTED, TRANSPORT_ASSIGNED, PICKUP_CONFIRMED, RECEIPT_ACCEPTED y RECEIPT_ISSUE_REPORTED. Cada ejecución recorre una rama; un camino conforme emite cinco hitos, no los siete tipos.
- El evento público contiene versión, marca demo, red testnet, identificador público aleatorio de recorrido, identificador de evento, ordinal, tipo, rol simulado, instante de aplicación y detalle del estado resultante.
- Detalle permitido por lista explícita: material y escenario versionados, cantidad declarada, humedad, comprador ficticio, viaje ficticio si existe, peso recibido si corresponde y motivo precargado. No copiar objetos internos completos ni campos libres de contactos.
- Fechas de aplicación en UTC e ISO 8601; pesos y humedad como cadenas decimales canónicas con precisión fija. El timestamp de consenso y otros resultados posteriores de red no forman parte del detalle original.
- Propuesta de representación v1: JSON Canonicalization Scheme de RFC 8785 para el payload y SHA-256 sobre sus bytes UTF-8. Rechazar datos no válidos en vez de modificarlos después de calcular el hash. La normalización de cantidades ocurre antes de crear el evento.
- El hash se conserva en hexadecimal minúsculo. La envoltura HCS contiene versión, demo, identificadores públicos, ordinal, tipo, rol y digest; no el contacto ni el token. El digest no se incluye dentro del objeto del cual se calcula a sí mismo.
- Guardar estado, versión, evento y pendiente de publicación dentro de una sola transacción SQL. Una excepción revierte el conjunto y no habilita envío externo.
- Ordinal único y creciente dentro del recorrido; HCS puede intercalar mensajes de distintos recorridos. No exigir secuencias de topic consecutivas para un único recorrido.
- Datos del evento y hash inmutables después del commit. Estado de envío, intentos, lease, transacción, secuencia y verificación son metadatos mutables de publicación y se conservan separados del payload.
- Conservar recibo idempotente del comando, incluso si solo guarda borrador. Una respuesta repetida puede informar el evento original junto con el estado actual, sin crear otro evento.
- El primer borrador aún puede tener consulta sin eventos; eso se presenta como ausencia de hitos, no como prueba de red.

### Criterios de aceptación

1. Cada hito confirmado localmente tiene exactamente un evento lógico y un pendiente asociado.
2. La serialización del mismo payload es reproducible entre productor y verificador.
3. Modificar un dato público del evento provoca un hash distinto; cambiar metadatos de envío no reescribe el hash original.
4. Un fallo SQL no deja un evento ni un envío externo huérfanos.
5. La lista pública no contiene datos privados de sesión ni del formulario.

## Testing Decisions

S17 verificará comportamiento transaccional, idempotencia y contraste de payload/hash desde la API pública. Los vectores canónicos serán literales independientes; no se probará el hash repitiendo el mismo algoritmo en la expectativa.

## Out of Scope

Event sourcing completo, certificados ambientales, HTS, IPFS, contratos inteligentes, archivos subidos y publicación de datos privados.

## Further Notes

Q20–Q22 y ADR 0002. Referencia técnica propuesta: [RFC 8785, JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785). Esta spec define contenido para revisión; no ha generado eventos ni hashes reales.
