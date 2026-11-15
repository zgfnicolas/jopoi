# Hoja de Ruta (Roadmap) — Jopói

Este documento traza las fases de evolución del producto organizadas en el formato **Ahora / Próximo / Más adelante**, priorizando hitos de valor y criterios de salida verificables por sobre estimaciones de fechas rígidas.

---

## 1. Ahora — v0.22 (Prototipo Completo y Profesionalizado)

**Objetivo:** Consolidar un prototipo de demostración interactivo, robusto y auditable para el caso de chips forestales en Corrientes, con presupuesto de infraestructura cero y suite completa de pruebas.

### Entregables completados
- [x] Recorrido guiado de 6 estados con simulación de 4 roles (Generador, Coordinador, Transportista, Comprador).
- [x] Motor de compatibilidad de fletes de retorno y cálculo de beneficio económico ilustrativo.
- [x] Trazabilidad verificable con anclaje de 5 hitos en Hedera Consensus Service testnet (RFC-8785 JCS + SHA-256).
- [x] Consulta pública mediante código QR y enlace web de solo lectura sin autenticación requerida.
- [x] Formulario de contacto real para solicitudes de demostración con retención a 90 días.
- [x] Sistema de diseño accesible en modo Claro y Oscuro conforme a WCAG 2.1 nivel AA.
- [x] Suite de observabilidad in-house, RUM privado, SLOs, runbooks y ensayos de recuperación ante desastres (DRP).
- [x] Validación reproducible y puertas de calidad automatizadas (S22).

**Criterio de salida:** 100% de las suites de prueba locales en verde (`npm test`, `npm run test:api`, `npm run test:observability`, `npm run test:e2e`), matrices de evidencia generadas y documentación canónica actualizada.

---

## 2. Próximo — v1.0 (Piloto Controlado en Corrientes)

**Objetivo:** Ejecutar una prueba piloto en el terreno agroindustrial con un aserradero generador, una planta compradora y transportistas reales del corredor de Santa Rosa.

### Hitos planificados
- **Identidad verificada de participantes:**
  - Incorporar autenticación federada o firmas delegadas simples para que generador y comprador operen bajo su CUIT/Razón Social real.
- **Integración de comprobantes de pesaje:**
  - Carga asistida del ticket de báscula de pesaje de ingreso a planta para contrastar automáticamente contra el peso declarado.
- **Canal de notificación para transportistas:**
  - Envío de alertas de viajes disponibles mediante WhatsApp Business API o correo electrónico para agilizar la confirmación del flete de retorno.
- **Panel de administración comercial privado:**
  - Gestión interna protegida de solicitudes de contacto y métricas agregadas de toneladas coordinadas.

**Criterio de salida:** 30 días continuos de operación en el corredor piloto con al menos 10 viajes reales coordinados, sin discrepancias operativas ni incidentes de disponibilidad.

---

## 3. Más adelante — v2.0 (Red Regional y Escalamiento)

**Objetivo:** Expandir la plataforma a múltiples corredores logísticos y consolidar el modelo de negocio cooperativo.

### Hitos estratégicos
- **Multi-corredor y consolidación de lotes:**
  - Soporte para subproductos adicionales (aserrín, cáscara de arroz, bagazo) y algoritmos de optimización para consolidación de cargas parciales.
- **Liquidación y pagos automáticos:**
  - Integración de liquidación financiera contra entrega conforme (escrow de flete y factura digital).
- **Anclaje en Hedera Mainnet:**
  - Migración controlada de tópicos HCS a red principal con modelo de fondeo sustentable por transacción.
- **Certificación de huella de carbono y créditos ambientales:**
  - Emisión de reportes auditables de reducción de emisiones de CO₂ por eliminación de kilómetros en vacío.
