# Reglas de Negocio

Este documento cataloga las reglas de negocio e invariantes del dominio de **Jopói**. Cada regla cuenta con un identificador unívoco (`RN-xx`) citado en el código fuente (`src/domain/`) y en las pruebas automatizadas (`tests/rules/`, `tests/api/`).

---

## 1. Declaración y Lotes de Biomasa

### RN-01 — Cantidad declarada positiva
La cantidad de biomasa declarada en un lote debe ser un valor positivo estrictamente mayor a cero y representarse con precisión exacta en gramos.
- **Origen:** Requisito físico de pesaje agroindustrial.
- **Se aplica en:** `src/domain/operation-rules.ts` (función `validateDraft()`).
- **Consecuencia de incumplimiento:** Rechazo con error `INVALID_QUANTITY`.

### RN-02 — Rango de humedad admisible
La humedad declarada del material debe ubicarse entre 0.00% y 100.00% inclusive, representada internamente en centésimas de porcentaje.
- **Origen:** Especificación técnica agronómica.
- **Se aplica en:** `src/contracts/operation-contracts.ts` y `validateDraft()`.
- **Consecuencia:** Error de validación Zod / rechazo de comando.

### RN-03 — Inmutabilidad pospublicación
Un lote publicado (`PUBLISHED` o estados posteriores) no puede ser modificado en sus valores declarados (cantidad y humedad).
- **Origen:** Integridad contractual y trazabilidad.
- **Se aplica en:** `src/domain/operation-machine.ts`.
- **Consecuencia:** Error `CANNOT_EDIT_PUBLISHED_LOT`.

---

## 2. Coordinación y Aprobación

### RN-04 — Límite de humedad del comprador
Un lote publicado no puede ser aprobado si la humedad declarada supera el límite máximo estipulado por el comprador asignado en el escenario (35.00%).
- **Origen:** Requisito de eficiencia en calderas industriales.
- **Se aplica en:** `src/domain/operation-rules.ts` (`canApprove()`).
- **Consecuencia:** Si la humedad > 35%, la aprobación se bloquea y el coordinador está obligado a rechazar el lote invocando el motivo `HUMIDITY_ABOVE_LIMIT`.

### RN-05 — Rechazo motivado
El rechazo de un lote exige obligatoriamente un código de motivo válido perteneciente al catálogo precargado del sistema (`HUMIDITY_ABOVE_LIMIT`, `CONTAMINATED_MATERIAL`, `UNAVAILABLE_CAPACITY`).
- **Origen:** Transparencia y auditoría operativa.
- **Se aplica en:** `src/contracts/operation-contracts.ts`.
- **Consecuencia:** Rechazo de la solicitud si no se suministra un motivo válido.

---

## 3. Transporte y Asignación de Viaje

### RN-06 — Compatibilidad quíntuple de transporte
Un viaje de retorno solo puede ser asignado a un lote si satisface simultáneamente 5 condiciones de compatibilidad:
1. **Material:** El transportista admite el tipo de biomasa (`CHIPS_SIN_TRATAR`).
2. **Capacidad de carga:** La capacidad máxima del camión es mayor o igual a la cantidad declarada del lote.
3. **Carrocería:** El vehículo cuenta con carrocería apta (volcador o piso móvil para granel).
4. **Ruta:** El trayecto del viaje coincide con el corredor de origen y destino del lote.
5. **Ventana horaria:** Existe solapamiento temporal de duración positiva entre la disponibilidad del lote y el horario del transportista.
- **Origen:** Factibilidad física y legal del transporte de cargas.
- **Se aplica en:** `src/domain/compatibility.ts`.
- **Consecuencia:** Si una sola condición falla, el viaje se declara incompatible y no puede ser asignado.

### RN-07 — Elección manual explicada
El sistema calcula y expone las razones de compatibilidad de cada viaje disponible, pero la asignación requiere la confirmación explícita y manual del Coordinador (sin asignación oculta por algoritmos de caja negra).
- **Origen:** Principio de diseño centrado en el operador.
- **Se aplica en:** Interfaz de usuario y comando `ASSIGN`.

---

## 4. Retiro, Recepción y Cierre

### RN-08 — Tolerancia de peso cero en la demostración
En el prototipo actual, la conformidad de recepción exige coincidencia exacta entre el peso recibido en destino y el peso declarado en origen. Cualquier diferencia (merma o exceso) obliga a cerrar la operación como incidencia.
- **Origen:** Simplificación pedagógica explícita para la demo (no representa un estándar industrial comercial).
- **Se aplica en:** `src/domain/operation-rules.ts` (`canReceiveConforme()`).
- **Consecuencia:** Ante cualquier discrepancia en el pesaje, la acción `RECEIVE` queda deshabilitada y se exige ejecutar `INCIDENT`.

### RN-09 — Incidencia tipificada en destino
El reporte de incidencia de recepción exige seleccionar un motivo del catálogo (`WEIGHT_DISCREPANCY`, `MOISTURE_DISCREPANCY`, `FOREIGN_OBJECTS`, `TRANSPORT_DAMAGE`).
- **Origen:** Estandarización de reclamos y resolución.
- **Se aplica en:** `src/contracts/operation-contracts.ts`.

### RN-10 — Terminalidad de estados
Los estados `RECEIVED` (recibido conforme), `REJECTED` (rechazado) e `INCIDENT` (cerrado con incidencia) son **estrictamente terminales**. Ningún comando posterior puede reabrir o mutar la operación.
- **Origen:** Seguridad jurídica e inmutabilidad de registros.
- **Se aplica en:** `src/domain/operation-machine.ts`.

---

## 5. Cuotas, Sesiones y Retención

### RN-11 — Límite de recorridos por sesión
Cada sesión de usuario tiene un cupo máximo de 3 recorridos en su ciclo de vida de 24 horas. Reiniciar un recorrido consume un nuevo slot de la cuota.
- **Origen:** Protección contra abuso de recursos en infraestructura gratuita.
- **Se aplica en:** `src/server/db/session-service.ts`.
- **Consecuencia:** Al alcanzar 3 recorridos, se bloquea la creación de nuevos lotes.

### RN-12 — Cuota global de emisión en testnet
El sistema aplica un límite global de 100 mensajes diarios enviados a Hedera Consensus Service.
- **Origen:** Control estricto de presupuesto cero y preservación de balance de faucet testnet.
- **Se aplica en:** `src/server/hcs/quota-service.ts`.
- **Consecuencia:** Si el cupo diario se agota, los eventos se guardan localmente en PostgreSQL (`QUEUED` / `PAUSED_QUOTA`) informando al usuario el estado de pausa.

### RN-13 — Retención y caducidad de datos
- Los recorridos operativos y sus eventos expiran a los 7 días de su creación.
- Las solicitudes de demostración y contactos expiran a los 90 días.
- La depuración física se efectúa durante el barrido diario de mantenimiento.
- **Origen:** Privacidad por diseño y optimización del almacenamiento en PostgreSQL Neon Free.
- **Se aplica en:** `scripts/maintenance.ts` y consultas con filtro `expiresAt`.

---

## 6. Criptografía y Persistencia

### RN-14 — Determinismo en la canonización de payloads
El hash digest de cada evento operativo se calcula aplicando SHA-256 sobre la representación JSON canónica bajo el estándar RFC-8785 (JSON Canonicalization Scheme - JCS).
- **Origen:** Verificabilidad independiente y reproducibilidad sin ambigüedad de formato.
- **Se aplica en:** `src/domain/hashing.ts`.

### RN-15 — Desacoplamiento transaccional (Persistencia antes de emisión)
Toda acción del usuario persiste primero atómicamente en PostgreSQL junto con su recibo de comando y registro de evento. La publicación en Hedera HCS se ejecuta de manera desacoplada (patrón Outbox).
- **Origen:** Resiliencia ante fallos transitorios de red externa.
- **Se aplica en:** `src/server/operations/command-handler.ts`.
- **Consecuencia:** Una caída o lentitud en Hedera no anula ni revierte la transacción guardada en la base de datos local.
