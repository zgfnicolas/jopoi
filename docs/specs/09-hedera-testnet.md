# S09 · Adaptador HCS real y verificación en testnet

Área: Backend · integración externa. Tamaño relativo: L. Dependencias: S01, S07.
Estado: implementada por instrucción posterior, con migración aplicada y comprobada en PostgreSQL local; pruebas de comportamiento reservadas a S17/S18. Ver [adaptador y preparación de testnet](../hedera-testnet.md).

## Problem Statement

Una demo con botones simulados no satisface la exigencia de Hedera funcionando, pero un timeout tampoco permite afirmar que una transacción falló ni crear otra sin comprobar.

## Solution

Integrar exclusivamente HCS testnet, preparar y conservar cada transacción antes de enviarla y consultar receipt y mirror node para informar confirmación y contraste reales.

## User Stories

1. Como visitante, quiero que los hitos lleguen realmente a testnet, para conocer una integración funcional.
2. Como persona que consulta trazabilidad, quiero acceder a identificadores de red, para comprobar el registro fuera de Jopói.
3. Como persona que consulta trazabilidad, quiero distinguir confirmación de disponibilidad en mirror node, para interpretar una demora.
4. Como responsable del prototipo, quiero firmar desde el servidor, para no exigir wallets a visitantes.
5. Como responsable del prototipo, quiero consumir únicamente HBAR de prueba, para conservar gasto cero.
6. Como visitante, quiero que una respuesta incierta siga identificada como pendiente, para no recibir información falsa.
7. Como responsable del prototipo, quiero conservar el identificador de transacción antes del envío, para reconciliar un resultado perdido.
8. Como persona que consulta trazabilidad, quiero ver una discrepancia de hash, para no confundir disponibilidad de un mensaje con coincidencia.

## Implementation Decisions

- Servidor con SDK compatible de Hedera, cliente fijado a testnet y operador privado. No permitir seleccionar mainnet desde parámetros del navegador ni como fallback de configuración.
- Topic de demostración sin tarifas personalizadas ni dependencias de tokens. Su preparación y recuperación se documentan; el recurso se crea después, no durante la redacción de esta spec.
- Preparar y firmar la transacción; persistir transactionId, topic, red, generación de configuración y representación reutilizable antes de cualquier envío. Si no puede persistirse, no enviar.
- Envoltura compacta y versionada de S07. Comprobar tamaño y usar una sola unidad de mensaje para que un hito lógico no se fragmente en varias publicaciones no contempladas.
- Consultar el resultado conocido antes de repetir. Un identificador de transacción no se reemplaza automáticamente mientras su resultado sea incierto. La reutilización o nueva preparación debe respetar la semántica del SDK y el estado definitivo observado.
- Receipt exitoso acredita confirmación e informa secuencia cuando esté disponible. Mirror node permite leer el mensaje y timestamp de consenso para contrastarlo con el digest y los identificadores esperados.
- Confirmación y verificación son ejes separados: no consultado, pendiente, coincidente, discrepante o no disponible. Un receipt confirmado puede coexistir con verificación pendiente por demora del mirror.
- Un timeout de envío o consulta produce resultado incierto y conserva el identificador. Un rechazo definitivo conserva su código categorizado. No filtrar mensajes que incluyan conexiones, claves o datos internos.
- Comprobar topic, identificador de evento, recorrido, ordinal y digest del mensaje remoto. Encontrar cualquier mensaje o un hash calculado solo sobre SQL no prueba coincidencia en red.
- Saldo de prueba agotado, topic inválido o configuración incompleta mantienen la acción SQL y suspenden el envío con explicación. No comprar HBAR reales ni crear un comprobante simulado.
- Después de un reset de testnet, conservar la confirmación histórica registrada y señalar si no puede verificarse actualmente. No cambiar silenciosamente el topic de un evento ya preparado; una nueva generación identifica nuevos recorridos.
- Cliente y tiempos de red acotados por ejecución. Sin suscripción permanente ni proceso residente para escuchar eventos.
- Concreción confirmada: DER hexadecimal para claves; HCS_CONFIGURATION_GENERATION explícita y vinculación inmutable por recorrido al primer hito con metadata, o al preparar su primer envío si faltaba metadata. La acción SQL sigue disponible sin credenciales.
- Usar @hiero-ledger/sdk 2.90.1, preparación persistida y marcador durable previo al envío. No conectar disparadores operativos hasta S10; el CLI de topic prepara, envía una sola vez o recupera un journal privado.

### Criterios de aceptación

1. Un hito controlado produce transactionId, topic y secuencia consultables en testnet sin exponer claves.
2. Una transacción incierta no provoca otra nueva por el mero hecho de recargar.
3. Confirmación exitosa, mirror demorado, hash discrepante y red indisponible se distinguen.
4. El adaptador no utiliza mainnet ni recursos pagos, incluso si se agotan los fondos de prueba.

## Testing Decisions

S17 sustituirá únicamente la frontera externa de Hedera para fallos deterministas, con SQL real. S18 reserva una comprobación controlada contra testnet real, registrada como evidencia separada y dentro de la cuota; un doble de red no cuenta como prueba real.

## Out of Scope

HTS, wallets de visitantes, firmas de empresas independientes, mainnet, pagos reales, créditos de carbono y migración automática de evidencias entre topics.

## Further Notes

Q15, Q20–Q22 y ADR 0002. Sustento ya reunido en la documentación de infraestructura: [envío HCS](https://docs.hedera.com/native/consensus/submit-message) y [receipt](https://docs.hedera.com/native/transactions/receipt). La spec no afirma que ya exista un topic operativo.
