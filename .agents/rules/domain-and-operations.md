---
trigger: glob
globs: "**/src/domain/**/*.ts, **/src/shared/**/*.ts"
description: "Reglas de negocio Q30, máquina de estados, precisión decimal y eventos canónicos JCS/SHA-256."
---

# Reglas de Dominio y Contratos Compartidos (S02, S06, S07)

- **Pureza de dominio:** `src/domain/` no realiza I/O, consultas SQL, llamadas HTTP ni lecturas de `process.env`.
- **Vocabulario:** Usar los términos exactos definidos en `@GLOSSARY.md`.
- **Aritmética exacta:** Cantidades de peso en gramos usando `BigInt` (`declaredGrams`, `receivedGrams`) y humedad en centésimas enteras (`humidityHundredths`, 0 a 10000). Nunca usar `number` de punto flotante para cálculos de peso o importes.
- **Máquina de estados (`RunState`):**
  - Camino conforme: `DRAFT` → `PUBLISHED` → `APPROVED` → `ASSIGNED` → `PICKED_UP` → `RECEIVED`.
  - Desde `PUBLISHED` puede pasar a `REJECTED`. Desde `PICKED_UP` puede pasar a `INCIDENT`.
  - `RECEIVED`, `REJECTED` e `INCIDENT` son estados terminales inmutables.
- **Validaciones Q30:**
  - Cantidad declarada positiva y humedad entre 0% y 100%.
  - Bloquear aprobación si la humedad supera el máximo del comprador precargado.
  - Bloquear asignación si el viaje es incompatible (material, capacidad, carrocería, ruta u horario).
  - Peso recibido positivo; solo permite `RECEIVED` si coincide con el peso declarado (cualquier diferencia exige `INCIDENT`).
- **Eventos y Hashes (S07):** Los payloads públicos usan esquema v1, se canonicalizan con RFC 8785 (`canonicalize`) y se resumen con SHA-256 antes de encolarse para HCS.
