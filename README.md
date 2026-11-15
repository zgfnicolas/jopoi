# Jopói

Prototipo personal de coordinación B2B de subproductos agroforestales (chips de madera) y fletes de retorno en el corredor de Santa Rosa, Corrientes, con anclaje verificable en Hedera Consensus Service (HCS) testnet y presupuesto de infraestructura cero.

---

## Funcionalidades principales

- **Recorrido guiado multi-rol:** Experimentación interactiva de los roles Generador, Coordinador, Transportista y Comprador en una sesión anónima de 24 horas.
- **Cálculo de ahorro logístico:** Motor de beneficios económicos que cuantifica el aprovechamiento de capacidad ociosa en viajes de retorno.
- **Trazabilidad criptográfica inmutable:** Registro de hitos operativos mediante hashes canónicos RFC-8785 (JCS) + SHA-256 publicados en Hedera Consensus Service testnet.
- **Consulta pública y QR:** Verificación de solo lectura compartible para receptores y auditores sin requerir autenticación ni wallets.
- **Solicitud de demostración comercial:** Formulario real de contacto para interesados y aliados agroindustriales.
- **Observabilidad y RUM privado:** Métricas operativas, SLOs, presupuestos de rendimiento y runbooks integrados sin dependencias SaaS de terceros.

---

## Stack tecnológico

- **Frontend:** Next.js 16 (App Router), React 19, componentes accesibles con tokens CSS semánticos y soporte para modo Claro y Oscuro.
- **Backend & API:** Next.js Route Handlers y Server Actions con validación Zod discriminada y negociación Problem Details (RFC-7807/9457).
- **Base de datos:** PostgreSQL 16 con Prisma ORM, JSONB para metadatos flexibles, desplegado en Neon Serverless (Vercel Marketplace).
- **Infraestructura & Red:** Hosting en Vercel Hobby (presupuesto cero) y Hedera Hashgraph HCS testnet.

---

## Inicio rápido

### Requisitos previos
- Node.js 24.x LTS
- PostgreSQL 16 local o instancia remota compatible

### Pasos
```bash
# 1. Clonar el repositorio
git clone https://github.com/usuario/jopoi.git
cd jopoi

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Instalar dependencias
npm install

# 4. Generar cliente de base de datos y correr migraciones
npm run db:generate
npm run db:migrate

# 5. Iniciar servidor de desarrollo
npm run dev
```

La aplicación queda accesible en [http://localhost:3000](http://localhost:3000).

---

## Documentación

La suite de documentación sigue la estructura canónica organizada en 4 ejes + agentes de IA:

### Negocio y Producto
- [Requisitos del producto (PRD)](docs/prd.md) — Visión, alcance, historias de usuario y criterios de aceptación.
- [Roles y permisos](docs/roles.md) — Matriz de permisos por rol simulado y reglas de sesión.
- [Reglas de negocio](docs/business_rules.md) — Catálogo de invariantes normativas (`RN-01` a `RN-15`).

### Técnico y Arquitectura
- [Arquitectura de software (SAD)](docs/sad.md) — Estructura arc42 con diagramas C4 (contexto y contenedores).
- [Modelo de datos](docs/data_model.md) — Diagrama ER en Mermaid, diccionario de datos y políticas referenciales.
- [Decisiones de arquitectura (ADR)](docs/adr/) — Registro histórico de decisiones técnicas tomadas.
- [Glosario de dominio](docs/glossary.md) — Vocabulario y terminología agroindustrial y técnica.
- [Sistema de diseño](DESIGN.md) — Ficha de abastecimiento industrial, tokens y componentes accesibles.

### Gestión y Operaciones
- [Cómo contribuir](CONTRIBUTING.md) — Entorno, flujo de Git, estándares de código y pruebas.
- [Registro de cambios (Changelog)](CHANGELOG.md) — Historial de versiones y entregas.
- [Hoja de ruta (Roadmap)](docs/roadmap.md) — Fases *Ahora*, *Próximo* y *Más adelante*.
- [Despliegue y DRP](docs/deployment.md) — Guía de publicación en Vercel/Neon y plan de recuperación ante desastres.
- [Confiabilidad y Observabilidad](docs/observability.md) — SLIs, SLOs, RUM y catálogo de runbooks operativos.
- [Estrategia de pruebas](docs/testing.md) — Organización de suites unitarias, de API, E2E y puertas de calidad.

### Agentes de IA
- [Instrucciones para agentes (AGENTS.md)](AGENTS.md) — Estándar abierto con comandos, capas y reglas inviolables.
- [Planes por fase](docs/plans/) — Metodología de planificación supervisada por fases.

---

## Estado del proyecto

**Versión:** 0.22.0  
**Estado:** Prototipo funcional completo y profesionalizado. Cierre de la especificación S22 (32 tickets ejecutados y verificados localmente).

---

## Licencia

Distribuido bajo la licencia MIT. Consultar [LICENSE](LICENSE) para más información.
