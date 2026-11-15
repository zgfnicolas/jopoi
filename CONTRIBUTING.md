# Cómo contribuir en Jopói

Este documento define el entorno de desarrollo, el flujo de trabajo con Git, los estándares de código y las pautas de verificación para contribuir al proyecto.

---

## 1. Entorno de desarrollo

### Requisitos previos
- **Node.js:** Versión 24.x LTS (compatible con `.node-version`).
- **PostgreSQL:** Versión 16 (local o contenedor Docker / instancia Neon).
- **npm:** Versión compatible con Node 24.

### Configuración inicial
1. Clonar el repositorio y acceder al directorio:
   ```bash
   git clone https://github.com/usuario/jopoi.git
   cd jopoi
   ```
2. Configurar variables de entorno locales:
   ```bash
   cp .env.example .env
   ```
   *Nota: Nunca agregues secretos de producción ni claves privadas reales en `.env`.*
3. Instalar dependencias del proyecto:
   ```bash
   npm install
   ```
4. Generar el cliente de Prisma y aplicar migraciones en la base de datos de desarrollo:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```
5. Iniciar el servidor de desarrollo local:
   ```bash
   npm run dev
   ```
   La aplicación queda disponible en `http://localhost:3000`.

---

## 2. Flujo de trabajo (GitHub Flow)

1. **Crear una rama de trabajo:** Ramas creadas desde `main` con nombres semánticos:
   - `feat/nombre-funcionalidad`
   - `fix/descripcion-error`
   - `docs/actualizacion-documento`
   - `refactor/area-optimizada`
2. **Commits semánticos (Conventional Commits):**
   - `feat:` nueva funcionalidad observable
   - `fix:` corrección de error o bug
   - `docs:` cambios en documentación
   - `test:` agregado o ajuste de pruebas
   - `refactor:` reorganización de código sin alterar comportamiento
   - `chore:` mantenimiento de dependencias o scripts auxiliares
3. **Control de calidad antes de abrir PR:**
   - Compilación y verificación de tipos: `npm run typecheck`
   - Linter y formato de código: `npm run lint`
   - Ejecución de pruebas locales: `npm test`
4. **Abrir Pull Request:**
   - Completar el formulario de `.github/pull_request_template.md`.
   - Requiere revisión aprobada y suite de CI en verde para mergear.

---

## 3. Estándares de código

- **TypeScript estricto:** Sin uso de tipo `any`. Tipado explícito en interfaces públicas y contratos.
- **Formateo y linter:** Biome (`npm run lint` y `npm run format`).
- **Arquitectura en capas:**
  - *Transporte:* `src/app/` (páginas, layouts, server actions) y `src/app/api/` (route handlers HTTP).
  - *Validación y Contratos:* `src/contracts/` con esquemas Zod discriminados.
  - *Dominio:* `src/domain/` (lógica pura de negocio, reglas de cálculo y máquinas de estado).
  - *Persistencia y Externos:* `src/server/db/` (Prisma) y clientes de integración.
  - Una capa solo interactúa con la inmediata inferior. Las vistas nunca importan el cliente Prisma directamente.
- **Accesibilidad y diseño:**
  - Respetar los tokens definidos en `DESIGN.md` y `src/app/globals.css`.
  - Contraste visual mínimo de 4.5:1 para texto normal y 3:1 para controles (WCAG 2.1 nivel AA).

---

## 4. Pruebas y verificación

El proyecto cuenta con suites automatizadas organizadas por nivel de aislamiento:

```bash
npm test                     # Corre pruebas unitarias y de dominio (Node test runner)
npm run test:api             # Pruebas de integración HTTP y persistencia aislada
npm run test:observability   # Validación de alertas, SLOs, runbooks y RUM
npm run test:e2e             # Pruebas de extremo a extremo con Playwright
npm run release:gate         # Validación completa de matriz de calidad y release
```

> **Regla de oro:** Todo PR que incorpore lógica de negocio o corrija un defecto debe incluir su correspondiente prueba automatizada.

---

## 5. Mantenimiento de la documentación

Si tu cambio modifica una regla de negocio (`RN-*`), la matriz de roles, una entidad del modelo de datos o una decisión de arquitectura:
1. Actualizar el documento correspondiente en `docs/` (`business_rules.md`, `roles.md`, `data_model.md`, `sad.md`).
2. Registrar la entrada pertinente en la sección `[Sin publicar]` de `CHANGELOG.md`.
3. Si se toma una decisión técnica estructural difícil de revertir, redactar un nuevo ADR en `docs/adr/`.

---

## 6. Configuración de Antigravity CLI (agy)

El proyecto está preparado para trabajar de manera nativa con **Antigravity CLI** (`agy`):

- **Instrucciones generales:** `AGENTS.md` (común a todos los agentes) y `GEMINI.md` (específico para Antigravity).
- **Reglas modulares:** Ubicadas en `.agents/rules/` con activación automática por glob (`api-contracts.md`, `ui-accessibility.md`) o decisión del modelo (`persistencia-db.md`).
- **Subagentes:** Utilizá `@code-reviewer` para auditar cambios pendientes antes de abrir un PR, y `@observability-auditor` para validar SLOs y runbooks.
- **Hooks de protección:** `.agents/hooks.json` bloquea automáticamente cualquier intento no autorizado de acceder a `.env` o ejecutar comandos destructivos.
- **Permisos recomendados:** Copiá la plantilla de [`docs/antigravity-settings.example.json`](docs/antigravity-settings.example.json) a tu archivo personal `~/.gemini/antigravity-cli/settings.json` para configurar `allow`, `ask` y `deny` junto con el sandbox de terminal.

