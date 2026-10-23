# Flujo y trazabilidad de la demo

Estado: decisiones confirmadas hasta Q30; barrido diario aceptado en Q28. Presupuesto cero y Vercel Free. Fuente vigente: [alcance](alcance-demo.md). No describe una integración ya implementada.

Actualización S07: ya existe [ejecución transaccional privada con eventos, hashes y pendientes](eventos-y-hashes.md). La API operativa corresponde a S08, y el envío/verificación real a S09/S10. Las explicaciones siguientes describen el flujo acordado; todavía no acreditan una integración de red funcionando.

## Acciones representadas

| Rol simulado | Acción | Restricción acordada |
| --- | --- | --- |
| Generador | Editar cantidad y humedad declaradas; publicar. | Edición solo en borrador. |
| Coordinador | Aprobar o rechazar con motivo; seleccionar transporte compatible. | Requisitos y alternativas de ejemplo precargados. |
| Transportista | Confirmar retiro. | Acción separada de consultar QR. |
| Comprador | Registrar peso recibido y confirmar recepción o incidencia. | No altera el peso declarado ni eventos anteriores. |

Q30 fijó cantidad positiva, humedad entre 0 y 100%, bloqueo de aprobación si excede el requisito del comprador y bloqueo de viaje incompatible. El peso recibido debe ser positivo: coincidencia con el declarado permite recepción conforme; una diferencia exige incidencia, con tolerancia cero solo como simplificación de la demo. Empresas, rutas, requisitos, precios, evidencia y motivos de ejemplo están precargados. Los visitantes representan estos roles, sin firmar por empresas independientes.

## Hitos registrados en testnet

1. Publicación del lote.
2. Aprobación o rechazo.
3. Asignación de transporte.
4. Confirmación de retiro.
5. Recepción conforme o incidencia.

El camino exitoso tiene cinco hitos. Guardar un borrador, cambiar de rol, abrir una página o escanear el QR no genera una transacción.

Cada evento expone identificadores públicos, tipo, rol simulado, marca de demo y hash del detalle. La especificación de implementación fijará una representación estable del detalle para calcular y contrastar ese hash. El formato tendrá versión para permitir interpretar correctamente los registros.

La consulta permite contrastar el detalle y la huella registrada, y muestra la confirmación de red disponible. Contactos, credenciales, secretos e identificadores privados de sesión quedan fuera del contenido público. La prueba acredita el registro de una declaración de demostración, no la verdad física de una carga.

## Persistencia y recuperación

La acción y el trabajo de publicación pendiente se guardan primero en PostgreSQL. El recorrido puede continuar cuando Hedera esté lento o indisponible. El estado operativo se distingue del estado de red: «recibido» no significa automáticamente «registro confirmado en Hedera».

Antes de reenviar se comprueba el resultado de la transacción conocida. Hay hasta tres intentos automáticos de envío y reintento manual acotado, sujetos a las cuotas. Consultar un resultado no se trata como una nueva acción del negocio.

La implementación debe conservar identificadores de evento y transacción, evitar repetir acciones locales ante doble clic y reconciliar resultados inciertos. No se promete atomicidad ni ejecución exactamente una vez entre PostgreSQL y Hedera.

Los estados visibles distinguen acción pendiente de envío, resultado de red pendiente, confirmación y error. Una consulta temporalmente vacía en mirror node no equivale por sí sola a un envío fallido. La disponibilidad del detalle para contrastar en mirror node se presenta por separado de un receipt confirmado.

**Ajuste aceptado en Q28:** se elimina la revisión horaria propuesta originalmente. Hay reconciliación durante la interacción, reintento manual y barrido automático diario junto con limpieza, sin un nuevo servicio externo. El trabajo persiste en SQL para retomarlo tras una ejecución fallida.

## Cuotas y retención

- Sesión anónima de 24 horas desde su creación.
- Tres recorridos por sesión, incluido el inicial. Reiniciar consume otro recorrido; no renueva la sesión.
- Máximo global configurable de 100 mensajes HCS diarios, aplicado en el servidor. Si se agota, se pausa el envío y se informa el pendiente; no se inventa confirmación.
- Los datos operativos vencen siete días después de crear el recorrido. Se impide su consulta una vez vencidos y se borran en la próxima ejecución diaria exitosa.
- Las solicitudes de contacto vencen 90 días después de su envío y se borran mediante esa limpieza.
- Limpiar PostgreSQL o reiniciar la experiencia no elimina mensajes ya enviados a testnet. La red testnet puede reiniciarse por su propia política.

## Condiciones de prueba derivadas

Se deberá comprobar aislamiento entre sesiones; secuencia y terminales; bloqueo de viaje incompatible; persistencia antes del envío; tratamiento de resultado incierto; ausencia de confirmaciones ficticias; hash contrastable; cuotas concurrentes; expiración y limpieza. Estas verificaciones forman parte de la aceptación funcional, no acreditan una operación comercial real.
