# S03 · Persistencia relacional, precisión y migraciones

Área: Backend · datos persistentes. Tamaño relativo: S. Dependencias: S01, S02.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

La demo debe persistir acciones, aislar visitantes y conservar declaraciones verificables. Un esquema ambiguo puede mezclar datos privados y públicos o permitir que una edición cambie evidencia ya registrada.

## Solution

Definir PostgreSQL y Prisma como persistencia operativa, con relaciones y restricciones para sesiones, recorridos, lotes, operaciones, eventos, publicaciones, cuotas y contactos.

## User Stories

1. Como visitante, quiero recuperar mi recorrido al recargar, para continuar sin perder acciones guardadas.
2. Como visitante, quiero que mis cambios no alteren el recorrido de otra persona, para explorar de forma independiente.
3. Como comprador representado, quiero conservar peso declarado y recibido por separado, para explicar una diferencia.
4. Como persona que consulta trazabilidad, quiero ver el contenido original de cada evento, para contrastarlo con su hash.
5. Como responsable del prototipo, quiero eliminar datos vencidos sin borrar mensajes de testnet, para cumplir la retención acordada.
6. Como desarrollador, quiero restricciones de unicidad y relaciones claras, para evitar operaciones duplicadas.
7. Como responsable del prototipo, quiero migraciones reproducibles, para preparar una base gratuita sin reconstruir manualmente el esquema.
8. Como visitante, quiero saber que una acción no pudo guardarse, para no recibir una confirmación falsa.

## Implementation Decisions

- PostgreSQL con Prisma y JSONB para metadatos versionados. Sin segunda base NoSQL. No se implementa ni se aplica una migración durante esta fase de specs.
- Entidades lógicas: sesión anónima privada; recorrido de demo; declaración de lote; operación; recibo de comando idempotente; evento inmutable; publicación HCS con estado mutable; contador de cuota; solicitud de demo. Pueden agruparse físicamente cuando no se pierdan las restricciones descritas.
- La sesión conserva identidad interna, hash del token, creación, vencimiento y contador de recorridos. El recorrido conserva propietario, identificador público aleatorio, versión, creación, vencimiento y snapshot del escenario.
- Cada recorrido contiene un lote; una operación asignada referencia ese lote completo, un comprador y un viaje. Los estados previos a asignación pueden representarse sin inventar un acuerdo de transporte ya confirmado.
- El lote conserva cantidad declarada y humedad; la recepción añade peso recibido y motivo, sin sobrescribir la declaración. Edición solo en borrador, según S06.
- El evento conserva identificador, ordinal, tipo, rol simulado, fecha de aplicación, payload y hash inmutables. La publicación conserva por separado red, topic, identificador de transacción, intentos, próximo intento, confirmación, verificación y lease.
- Unicidad mínima: token de sesión hasheado; identificador público de recorrido; clave de comando por recorrido; ordinal de evento por recorrido; publicación por evento; contador por ámbito y fecha; clave idempotente de solicitud de contacto.
- Pesos en unidad canónica exacta y humedad decimal con precisión documentada. Propuesta v1: kg con hasta tres decimales, equivalentes a gramos enteros; humedad con dos decimales. Rechazar precisión no representable sin truncamiento silencioso.
- Una transición de estado, su evento y su pendiente de publicación se confirman en la misma transacción SQL. Un fallo revierte el conjunto. El envío a Hedera ocurre fuera de esa transacción.
- Aplicar control de versión o exclusión equivalente ante concurrencia. La cuota no se comprueba solo mediante lecturas sin bloqueo.
- Índices para propiedad, identificador público, vencimiento y trabajo pendiente. Borrado de recorridos vencidos elimina sus datos operativos asociados; conservar mensajes de testnet no implica conservar indefinidamente datos SQL.
- Conexión de aplicación preparada para pooling de Neon; conexión de migraciones gestionada por separado. El tamaño del pool debe respetar la capa gratuita y la duración acotada de las funciones.

### Criterios de aceptación

1. El modelo separa identidad privada, proyección pública, evento inmutable y estado mutable de publicación.
2. Las restricciones impiden dos eventos para el mismo comando y dos ordinales iguales en un recorrido.
3. La declaración original y el peso recibido se conservan de forma independiente.
4. Las migraciones y el borrado por vencimiento tienen una estrategia documentada sin pérdidas de datos vigentes.

## Testing Decisions

La verificación de persistencia y atomicidad se realizará a través de la API pública en S17, con PostgreSQL de prueba. No habrá tests dependientes de nombres de tablas o métodos privados.

## Out of Scope

Implementar el esquema ahora, almacenar archivos subidos, otra base de datos, event sourcing de toda la aplicación, mecanismos de producción de pago y migración de clientes reales.

## Further Notes

Q3, Q7–Q8, Q16, Q18 y Q20–Q25. No hay modelos funcionales ni migraciones previas que deban preservarse como contrato.
