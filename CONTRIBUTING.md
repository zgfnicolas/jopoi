# Cómo contribuir a Jopói

Esta guía reúne los requisitos de entorno, el flujo de trabajo con Git, las suites de verificación y la configuración recomendada para trabajar con **Antigravity CLI (`agy`)**.

## 1. Entorno de desarrollo

- **Node.js:** `>=24.0.0 <25` (fijado en `.node-version`).
- **PostgreSQL:** Instancia local de PostgreSQL 17+. En Windows existe soporte para PostgreSQL portable con `npm run db:local:setup` y `npm run db:local`; en Linux/macOS conectá `.env.local` a tu servicio local de PostgreSQL.

### Variables de entorno

1. Copiá `.env.example` a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Generá secretos independientes de 32 bytes para `SESSION_SECRET` y `CRON_SECRET`:
   ```bash
   node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   ```
3. **Regla estricta:** Ninguna variable del entorno puede llevar el prefijo `NEXT_PUBLIC_` ni versionarse en el repositorio.
4. Para enviar hitos reales a Hedera testnet, completá `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` (DER hexadecimal), `HEDERA_TOPIC_ID` y `HCS_CONFIGURATION_GENERATION`. El desarrollo y los tests locales funcionan sin consumir testnet.

### Puesta en marcha

```bash
npm install
npm run db:validate
npm run dev
```

## 2. Configuración de Antigravity CLI (`agy`)

El repositorio incluye configuración específica para Antigravity CLI dentro de `.agents/` y en la raíz (`AGENTS.md`, `GEMINI.md`):

- **Permisos globales y sandbox:** Antigravity CLI lee los permisos desde `~/.gemini/antigravity-cli/settings.json` (fuera del repositorio). Copiá la plantilla recomendada para activar el sandbox de terminal y las reglas `allow` / `ask` / `deny`:
  ```bash
  mkdir -p ~/.gemini/antigravity-cli
  cp docs/antigravity-settings.example.json ~/.gemini/antigravity-cli/settings.json
  ```
  Luego verificá en `agy` ejecutando `/permissions`.
- **Hooks obligatorios del proyecto (`.agents/hooks.json`):**
  - `PreToolUse` (`scripts/hooks/protect-jopoi.sh`): bloquea la lectura/edición de `.env*` reales (salvo `.env.example` y `.env.candidate.example`), `secrets/`, `.git/`, migraciones existentes en `prisma/migrations/`, `JOPOI.md` (2.4 MB) y comandos destructivos (`rm -rf`, `sudo`, `git reset --hard`, `git push --force`, `prisma migrate reset`); además pide confirmación explícita (`force_ask`) para `git push`, `db:migrate`, `hedera:topic`, `acceptance:live` y comandos de Vercel/Prisma.
  - `PostToolUse` (`scripts/hooks/post-edit-ui.sh`): dispara comprobaciones UI no bloqueantes al editar archivos `.tsx` o `.css`.
  - Verificá que los hooks estén cargados dentro de `agy` con `/hooks`.
- **Reglas modulares (`.agents/rules/`):** Se cargan automáticamente según los archivos editados (`domain`, `server/api`, `prisma`, `hedera`, `frontend/ui`, `tests`).
- **Subagentes revisores (`.agents/agents/`):** Podés invocarlos en `agy` con `@code-reviewer`, `@security-sql-auditor` y `@ui-a11y-reviewer`, además de `@research` para explorar `docs/specs/` sin saturar el contexto principal.
- **Verificación escalonada (`/jopoi-verify`):** Ejecuta en orden las compuertas locales de calidad.
- **Planes por fase (`docs/plans/`):** Para cambios en `src/domain/`, `src/server/` o `prisma/schema.prisma`, usá `/plan` o creá un plan en `docs/plans/AAAA-MM-DD_nombre.md` y avanzá una fase por revisión.

## 3. Flujo de trabajo y estándares

- **Commits:** Usar Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Arquitectura en 5 capas (`src/`):** Respetar la frontera entre `app`, `components`/`frontend`, `shared`, `domain` (puro, sin I/O) y `server` (`server-only`).
- **Vocabulario:** Usar los términos definidos en [GLOSSARY.md](GLOSSARY.md).
- **TypeScript:** Modo estricto, sin `any`, ESM (`"type": "module"`).

## 4. Verificaciones antes de abrir un PR

| Comando | Qué valida |
| --- | --- |
| `npm run typecheck` | Compilación de tipos TypeScript (`tsc --noEmit`) |
| `npm run db:validate` | Validez del esquema `prisma/schema.prisma` |
| `npm run test:ui:tokens` | Cumplimiento de tokens de diseño CSS (S20) |
| `npm run test:cli` | Contratos CLI de entrega y seguridad (S16/S21) |
| `npm run test:api` | Suite de integración y API HTTP contra PostgreSQL aislado (S17/S21) |
| `npm run test:e2e` | Recorridos de navegador en Chromium y WebKit móvil con Playwright (S18) |
| `npm run delivery:check` | Chequeo offline de preparación de entrega (S16) |

Si un cambio modifica reglas de negocio, contratos de API, esquema SQL o arquitectura, actualizá el documento correspondiente en `docs/` y agregá una entrada en `CHANGELOG.md` dentro del mismo PR.
