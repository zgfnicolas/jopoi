# 6. Hashing canónico RFC-8785 (JCS) y patrón Outbox para Hedera HCS

Fecha: 2026-10-23  
Estado: Aceptada  

## Contexto
Jopói ancla hitos del recorrido agroindustrial (declaración de lote, aprobación, asignación, retiro y recepción) en Hedera Consensus Service (HCS) testnet. La verificación pública requiere que cualquier auditor externo pueda reconstruir el payload JSON y obtener exactamente el mismo hash SHA-256 que el emitido en la red. Además, las redes distribuidas y mirror nodes presentan latencias y fallas transitorias de conectividad; un fallo o timeout de red externa no debe interrumpir la transacción local ni bloquear al usuario.

## Opciones consideradas
1. Envío síncrono bloqueante directo a HCS en la misma petición HTTP del usuario, con serialización `JSON.stringify()` estándar.
2. Formato binario propietario (Protobuf / Avro) con publicación síncrona.
3. Serialización canónica determinista según RFC-8785 (JSON Canonicalization Scheme - JCS) + SHA-256, con persistencia previa en base de datos local y despacho asíncrono desacoplado mediante patrón Outbox.

## Decisión
Adoptamos:
- **RFC-8785 (JCS) + SHA-256** para la canonización determinista de todos los eventos del dominio (`OperationEvent.payload` → `digest`).
- **Patrón Outbox relacional:** La mutación operativa y la creación del evento persisten primero en una transacción atómica de PostgreSQL junto con un registro de publicación en estado `QUEUED`.
- **Despacho desacoplado y reintentos idempotentes:** Un worker asíncrono procesa la cola de publicaciones hacia HCS, registrando transacciones firmadas, timestamps de consenso y gestionando reintentos con backoff exponencial y cupo diario.

## Motivos
- `JSON.stringify()` de JavaScript no garantiza ordenamiento determinista de claves ni formateo uniforme de números en diferentes plataformas o lenguajes. JCS normaliza el espaciado, orden léxico de claves y representación numérica IEEE-754.
- Desacoplamiento de resiliencia: la experiencia del usuario nunca sufre tiempos de espera ni fallos si la red testnet de Hedera experimenta demoras.

## Consecuencias
- (+) Garantía matemática de reproducibilidad en auditorías de trazabilidad pública y código QR.
- (+) Resiliencia total de la aplicación frente a caídas temporales del mirror node o de la red Hedera.
- (−) La confirmación definitiva en red no es instantánea en la base de datos (requiere distinguir entre estado operativo local y estado de confirmación de red `CONFIRMED`).
