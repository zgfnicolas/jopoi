# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Confirmado por el usuario en Q1–Q31: Next.js, PostgreSQL en Neon Free con Prisma y JSONB, Vercel Hobby y Hedera HCS testnet. Presupuesto cero. NoSQL, planes pagos, tarjetas y upgrades automáticos quedan fuera.

## Users

Personas que quieren conocer y evaluar el concepto de Jopói, incluidos compradores industriales y posibles aliados de Corrientes. Un visitante representa generador, coordinador, transportista y comprador dentro de una sesión anónima.

## Product Purpose

Prototipo personal para demostrar cómo coordinar un lote de chips forestales sin tratar, un comprador y un transporte compatible. El visitante debe entender el beneficio económico ilustrativo y completar una entrega, un rechazo o una incidencia con trazabilidad real en testnet.

## Positioning

Coordina abastecimiento regional y aprovechamiento de viajes de retorno con compatibilidad explícita y evidencia verificable. No es un mercado comercial activo ni acredita entregas físicas reales.

## Operating Context

Caso ficticio del corredor de Santa Rosa, Corrientes. Una operación incluye un lote completo, un comprador y un viaje. Empresas, rutas, evidencia e importes precargados son ilustrativos. QR abre trazabilidad pública de solo lectura. El formulario real solicita conocer el prototipo.

## Capabilities and Constraints

El alcance completo y sus criterios están en docs/alcance-demo.md. Roles simulados, persistencia SQL, aislamiento por sesión, máximo tres recorridos en 24 horas y 100 mensajes HCS diarios globales. El servidor Jopói firma en testnet. SQL guarda primero la acción y el pendiente; reintentos acotados y barrido diario. Sin offline completo, pagos, GPS, IA, subida de archivos, wallets, correos ni calendarios. Los contactos vencen a los 90 días y los recorridos a los siete días.

## Brand Commitments

Nombre Jopói, elegido por el usuario. Comunicación clara, coloquial y en español; explicar el beneficio antes de blockchain. No existe una identidad visual previa aprobada ni archivos de logo en este repositorio.

## Evidence on Hand

JOPOI.md contiene el historial y docs/ el alcance aprobado. No existen testimonios, clientes, entregas, ahorros observados ni resultados de validación comercial que puedan presentarse como reales. La evidencia del recorrido será de demostración y estará identificada.

## Product Principles

- Mostrar cómo funciona antes de sumar explicaciones técnicas.
- Hacer visible qué es ficticio y qué se registra realmente en testnet.
- Mantener la operación y su estado de red distinguibles.
- Respetar presupuesto cero y mostrar indisponibilidad sin inventar confirmaciones.

## Scope Confirmation

Q31 confirma el cierre del alcance compartido. El usuario aclaró que primero deben prepararse las specs y que todavía no se debe escribir código. El diseño visual y los detalles técnicos se documentarán dentro del alcance antes de implementar.
