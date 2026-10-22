# S16 · Preparación de entrega, despliegue gratuito y operación

Área: Entrega · integración de backend y frontend. Tamaño relativo: L. Dependencias: S01–S15.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

Una demo local no completa el objetivo de compartir una URL, pero publicarla sin controlar configuración, migraciones, cuotas y finalidad puede introducir costos o una integración incompleta.

## Solution

Especificar una entrega reproducible para Vercel Hobby, Neon Free y HCS testnet, con configuración privada, mantenimiento diario y recuperación documentada. La publicación posterior se valida en la etapa final de pruebas.

## User Stories

1. Como responsable del prototipo, quiero una entrega reproducible, para preparar la demo sin pasos ocultos.
2. Como responsable del prototipo, quiero publicar en Vercel Hobby, para compartir una URL con gasto cero.
3. Como responsable del prototipo, quiero conectar Neon Free sin tarjeta ni upgrades, para conservar el presupuesto.
4. Como responsable del prototipo, quiero configurar claves solo en el servidor, para no exponer el operador.
5. Como responsable del prototipo, quiero preparar el topic y saldo de prueba, para demostrar HCS real.
6. Como responsable del prototipo, quiero que el mantenimiento diario esté protegido, para operar pendientes y retención.
7. Como responsable del prototipo, quiero recuperar el escenario tras un reset de testnet, para preparar otra demostración.
8. Como visitante, quiero una explicación honesta cuando una dependencia se suspenda, para comprender la disponibilidad del prototipo.

## Implementation Decisions

- Esta spec prepara el candidato a entrega. No despliega ni contrata nada durante su redacción. La versión no se declara terminada hasta completar S17 y S18.
- Documentar requisitos de entorno, instalación, configuración, generación de cliente SQL, migraciones, activos de ejemplo y ejecución local. Reutilizar el scaffold existente solo después de revisar su compatibilidad con estas specs.
- Destino Vercel Hobby con URL del proveedor y Neon Free; no comprar dominio, añadir tarjeta, contratar Pro ni habilitar upgrades automáticos. No sustituir el hosting para resolver límites sin cambiar primero el alcance con el usuario.
- Conservar finalidad de prototipo personal y solicitud para conocerlo. La publicación no afirma validación comercial ni aprobación formal de elegibilidad otorgada por Vercel.
- Separar configuración local de publicación y datos de pruebas de solicitudes reales. Las migraciones se aplican de forma explícita al destino elegido y sin reiniciar bases vigentes para corregir un error de desarrollo.
- Configurar conexión pooled de aplicación y conexión de migraciones adecuada; limitar conexiones y trabajo para la capa gratuita. Si no existe recurso configurado, registrar el requisito faltante sin simular disponibilidad.
- Configurar exclusivamente operador y topic testnet y fondos ficticios. Preparar instrucciones para crear o recrear un topic y registrar nueva generación; no reenviar automáticamente eventos históricos con otra identidad de red.
- Una invocación diaria protegida procesa pendientes y limpieza con lotes acotados, según S10. La frecuencia no se amplía a cada hora para simular capacidades de un plan pago.
- Registros operativos mínimos: conteos de pendientes, confirmados, discrepantes, pausados, intentos y borrados, más códigos de error. No registrar contactos, tokens, bytes privados ni claves.
- Antes de anunciar la URL como terminada, comprobar configuración, resultado de build, migraciones y evidencias de aceptación de S18. Si falta acceso del usuario a una cuenta o servicio, reportarlo como pendiente concreto.
- Documentar recuperación: dependencia suspendida, cuota agotada, secreto rotado, cron perdido y reset de testnet. La recuperación no elimina SQL vigente ni convierte datos ficticios en entregas reales.
- La preparación visual exploratoria no equivale a frontend terminado; el estado de entrega se informa con evidencia real.

### Criterios de aceptación

1. Existe una secuencia reproducible para preparar local y publicación gratuita sin valores secretos.
2. Las necesidades de cuenta y permisos quedan identificadas sin contratar ni crear servicios automáticamente en esta fase.
3. El candidato puede configurarse sin mainnet ni servicios pagos.
4. El mantenimiento diario, la retención y la recuperación tienen instrucciones coherentes con S10.
5. La entrega final solo se marca aceptada cuando S17 y S18 registran sus resultados, sin confundir preparación con publicación efectiva.

## Testing Decisions

Las specs de creación y ejecución de pruebas son S17 y S18, situadas después de esta preparación por pedido del usuario. Un despliegue candidato puede servir para la aceptación final, pero no sustituye esas verificaciones.

## Out of Scope

Publicar durante esta fase documental, contratos o términos aceptados en nombre del usuario sin autorización aplicable, pagos, dominios pagos, SLA comercial y lanzamiento de ventas.

## Further Notes

Q26–Q29 y ADR 0003. Las condiciones y cuotas se volverán a comprobar al ejecutar la entrega; no se garantiza que un proveedor mantenga indefinidamente la misma oferta.
