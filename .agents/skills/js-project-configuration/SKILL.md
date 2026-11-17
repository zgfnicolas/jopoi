---
name: js-project-configuration
description: Configurar proyectos Node.js/Next.js/React reproducibles y con supply chain endurecida — runtime Node LTS fijado (24/26 LTS), npm 11/12 o pnpm 11 (allowScripts/allowBuilds, cooldown min-release-age, fuentes Git/URL bloqueadas), lockfile como contrato, variables de entorno validadas con Zod 4 y separación build-time/runtime (NEXT_PUBLIC_), CI en GitHub Actions y Dependabot/Renovate con cooldown.
---

# Configuración de proyectos JS/TS — SKL-JS-CONFIG-001 v2.0

Baseline (noviembre de 2026; verificar el calendario al crear un proyecto): Node.js 26 LTS (Active LTS desde el 28/10/2026, EOL abril de 2029) · Node 24 en Maintenance hasta abril de 2028 · npm 12 · pnpm 11 · TypeScript 6/7 · Next.js 16 · Vite. Skills relacionadas: `typescript-engineering`, `docker-production-containers`, `cicd-github-actions`, `web-security-baseline-python-ts`, `layered-architecture-python-ts`.

Principio rector: un clon limpio + un comando de instalación congelada produce el mismo árbol, el mismo build y el mismo artefacto en la laptop, en CI y en producción. Prioridades: Reproducibilidad → Seguridad de la supply chain → Correctitud → Simplicidad → Velocidad.

## 0. Modo de trabajo

### 0.1 Contexto a determinar
- `TIPO=` (app backend · app Next.js · SPA Vite · librería publicada · monorepo)
- `PM=` (npm 12 · pnpm 11 · yarn/bun solo si el repo ya los usa)
- `RUNTIME=` (Node 26 LTS · 24 Maintenance si hay bloqueo de dependencias)
- `DESPLIEGUE=` (contenedor · serverless · estático/CDN · plataforma gestionada)
- `REGISTRY=` (npmjs público · privado/proxy con scopes)

### 0.2 Formato de entrega
Archivos completos y comentados: `.node-version`, `package.json` (`scripts`, `engines`/`devEngines`, `allowScripts`), `.npmrc` y/o `pnpm-workspace.yaml`, `.gitignore`, `.env.example`, `src/config/env.ts`, workflow de CI, `renovate.json` o `dependabot.yml`, `Dockerfile`. Cada desviación del baseline con su motivo.

### 0.3 Reglas duras (MUST)
- Runtime de producción en Active o Maintenance LTS, fijado en el repo (`.node-version`) y validado (`engines`/`devEngines`).
- Gestor de paquetes fijado (`packageManager` o `devEngines.packageManager`); un solo lockfile, versionado, nunca editado a mano.
- CI y builds instalan congelado: `npm ci` / `pnpm install --frozen-lockfile`.
- Install scripts por allowlist (`allowScripts` / `allowBuilds`) con modo estricto en CI; diffs de la allowlist revisados como el lockfile.
- Cooldown de versiones nuevas activo (`min-release-age` / `minimumReleaseAge`) y alineado con Renovate/Dependabot; excepciones solo para fixes de seguridad.
- Sin dependencias Git, URL o tarball salvo excepción documentada (por defecto bloqueadas en npm 12 y pnpm 11).
- `npm audit signatures` y `lockfile-lint` en CI; `npm audit`/`pnpm audit` como señal, nunca `audit fix --force` automático.
- Entorno validado por esquema al arrancar; secretos fuera de Git, imágenes, logs y bundles (`NEXT_PUBLIC_*` y `VITE_*` son públicos).
- Artefacto de producción sin `devDependencies` ni toolchain, como usuario no root, con apagado ordenado.

## 1. Runtime

| Línea | Estado (nov. 2026) | Uso |
| :--- | :--- | :--- |
| 26.x "Lithium" | Active LTS (EOL 30/04/2029) | Default para proyectos nuevos |
| 24.x "Krypton" | Maintenance LTS (EOL 30/04/2028) | Existentes; planificar la migración a 26 |
| 22.x | Maintenance (EOL 30/04/2027) | Migrar ya |
| ≤ 20 | EOL | Prohibido en producción |
| 27.x | Alpha (abril 2027 Current, octubre 2027 LTS) | Solo CI de compatibilidad |

```ini
# .node-version — una única fuente (setup-node, mise, fnm, nvm, Volta la leen)
26.13.0
```

```json
{
  "private": true,
  "type": "module",
  "engines": { "node": ">=26.13.0 <27" },
  "devEngines": {
    "runtime":        { "name": "node", "version": ">=26.13.0 <27", "onFail": "error" },
    "packageManager": { "name": "npm",  "version": ">=12.0.0",      "onFail": "error" }
  }
}
```

- No acotar el gestor de paquetes con un techo de major (`"npm": "<12"`): bloquea instalaciones cuando sale la siguiente versión.
- `pnpm`: `"packageManager": "pnpm@11.x.y"` y `devEngines.packageManager.name: "pnpm"`. Corepack ya no viene incluido en Node a partir de la 25.
- Node 26 ejecuta `.ts` con type stripping estable y ya no tiene `--experimental-transform-types`: `enum`, parameter properties y `namespace` requieren compilación.

## 2. Elegir gestor de paquetes

| Dimensión | npm 12 | pnpm 11 |
| :--- | :--- | :--- |
| Install scripts | Bloqueados por defecto; `allowScripts` en `package.json`; `strict-allow-scripts` | Bloqueados por defecto; `allowBuilds` en `pnpm-workspace.yaml`; `strictDepBuilds: true` |
| Cooldown | `min-release-age` (días), apagado por defecto | `minimumReleaseAge` (minutos), 1440 por defecto |
| Fuentes Git/URL | `allow-git=none`, `allow-remote=none` por defecto | `blockExoticSubdeps: true` por defecto |
| Instalación congelada | `npm ci` | `pnpm install --frozen-lockfile` |
| Monorepo | Workspaces básicos | Workspaces + `workspace:` + `catalog` + filtros |
| Config | `.npmrc` | `.npmrc` solo auth/registry; todo lo demás en `pnpm-workspace.yaml` |

## 3. Política npm 12

```ini
# .npmrc (proyecto) — versionado, sin tokens
save-exact=true
engine-strict=true
strict-peer-deps=true
strict-allow-scripts=true
min-release-age=3
fund=false
```

```json
"allowScripts": {
  "esbuild@0.28.2": true,
  "sharp@0.34.4": true,
  "core-js": false
}
```

Comandos clave:
- `npm approve-scripts --allow-scripts-pending`
- `npm approve-scripts <pkg>` / `npm deny-scripts <pkg>`
- `npm install <pkg>@<ver> --min-release-age=0` (excepción puntual para fix de seguridad urgente, documentada en el PR)

`--ignore-scripts` global rompe binarios nativos legítimos; la allowlist es más precisa.

## 4. Política pnpm 11

Toda la configuración en `pnpm-workspace.yaml` (`savePrefix: ""`, `engineStrict: true`, `strictPeerDependencies: true`, `minimumReleaseAge: 4320`, `blockExoticSubdeps: true`, `strictDepBuilds: true`, `allowBuilds`, `catalog`, `overrides` comentados). En `.npmrc` solo `@scope:registry` y `_authToken=${NPM_TOKEN}`.

## 5. Árbol de dependencias

### 5.1 Taxonomía
- `dependencies`: lo que se importa en runtime (`zod`, `next`, `react`, `@prisma/client`).
- `devDependencies`: build, tipos, lint, test (`typescript`, `vitest`, `@types/*`).
- `peerDependencies`: lo que provee el consumidor con rango amplio.
- `optionalDependencies`: binarios opcionales por plataforma.

### 5.2 Antes de agregar una dependencia
Evaluar: si la plataforma ya lo resuelve (`fetch`, `crypto.randomUUID`, `structuredClone`, `node:test`, `util.parseArgs`, `--env-file`), cuántas transitivas suma (`npm i x --dry-run`), si tiene install scripts, provenance/historial, impacto en bundle/cold start y plan de salida.

### 5.3 Overrides
Solo para parchear una transitiva vulnerable o unificar versiones, documentado con paquete, versión, motivo/CVE, fecha, dueño y condición de salida. Revisión mensual.

## 6. Supply chain por capas

| Capa | Control | Detecta/evita |
| :--- | :--- | :--- |
| Resolución | Cooldown (`min-release-age` / `minimumReleaseAge`) + Renovate/Dependabot | Versiones maliciosas recién publicadas |
| Fuentes | Git/URL/tarball bloqueados; registry privado con scopes | Código fuera del registry; dependency confusion |
| Instalación | Allowlist de scripts en modo estricto | Payloads en `preinstall`/`postinstall` |
| Lockfile | `npm ci` / `--frozen-lockfile` + `lockfile-lint` + revisión de diffs | Árboles alterados, hosts inesperados, falta de `integrity` |
| Integridad | `npm audit signatures` | Tarballs alterados / sin attestations |
| Vulnerabilidades | `npm audit --omit=dev --audit-level=high` / `pnpm audit --prod` | Advisories conocidos |
| Superficie | Pocas dependencias; `knip`/`depcheck` | Paquetes innecesarios |

El cooldown de Dependabot/Renovate debe ser igual o mayor que el del gestor para no abrir PRs rechazados por la instalación.

## 7. Scripts como API del repo

Definir `dev`, `build`, `start`, `typecheck`, `lint`, `format:check`, `test`, `lint:lockfile`, `audit:deps`, `audit:signatures`, `check`. Sin `npx` para binarios locales ni `next lint` en Next 16.

## 8. Configuración y entorno

### 8.1 Archivos y `.gitignore`
`.env`, `.env.*` (con `!.env.example`), `node_modules/`, `.next/`, `out/`, `coverage/`, `*.log`.

### 8.2 Validación al arrancar (Zod 4)
Validar con `z.enum`, `z.url({ protocol: /^postgres(ql)?$/ })`, `safeParse`, lanzando errores con nombres de variables y motivo, **nunca valores ni `process.env` completo en logs**.

### 8.3 Build-time vs runtime
- **Next.js:** `NEXT_PUBLIC_*` se hornea en `next build`. Secretos y valores por entorno se leen únicamente en código servidor; si hace falta pasar algo dinámico al cliente, usar `await connection()` y pasarlo como prop.
- **Vite:** `VITE_*` se hornea en `vite build`; para config por entorno usar `/config.json` servido por el host.
- **Node:** Todo por variables de entorno en runtime.

### 8.4 Registry privado
`${NPM_TOKEN}` inyectado por CI, sin tokens en `.npmrc` versionado, scopes para prevenir dependency confusion.

## 9. CI (GitHub Actions)

`permissions: { contents: read }`, `concurrency` con cancelación, acciones fijadas por SHA de commit, `persist-credentials: false`, `node-version-file: .node-version`, `cache: npm` (nunca cachear `node_modules`), `npm ci`, `npm run lint:lockfile`, `npm audit signatures`, `typecheck`, `test`, `build`, `npm audit --omit=dev --audit-level=high`.

## 10. Artefactos de producción

Docker multi-stage con imágenes `-slim` fijadas por `@sha256:<digest>`, `next.config.ts: { output: "standalone" }` para Next.js 16 (o `npm prune --omit=dev` para Node), `USER node`, sin `.env` en la imagen y secretos de build con `--mount=type=secret`.

## 11. Ciclo de vida del proceso

Apagado ordenado (`SIGTERM`, `SIGINT`, `uncaughtException`, `unhandledRejection`): `server.close()`, `server.closeIdleConnections()`, cerrar DB y telemetría con timeout menor a `terminationGracePeriodSeconds` y `force.unref()`. Errores fatales no controlados terminan el proceso para que el orquestador lo reinicie.

## 12. Monorepos

Un solo lockfile en la raíz, paquetes internos con `workspace:*`, versiones unificadas con `catalog:` (pnpm) o `overrides` (npm).

## 13. Librerías publicadas

`"files"` allowlist, `"exports"` explícito, `npm pack --dry-run` en CI, frameworks en `peerDependencies`, publicación desde CI con trusted publishing (OIDC) y provenance, 2FA obligatorio.

## 14. Antipatrones

Lockfile sin versionar o editado a mano · dos lockfiles · `npm install` sin `--frozen-lockfile` en CI · Node EOL o Current en producción · `"npm": "<12"` con `engine-strict` · esperar Corepack en Node ≥ 25 · `--ignore-scripts` global · sin cooldown · cooldown del bot menor que el del gestor · `npm audit fix --force` automático · `zod` en `devDependencies` · secretos en `NEXT_PUBLIC_*`/`VITE_*` · `process.env` logueado · `z.string().url()` en Zod 4 · `npx` en scripts · `next lint` · contenedor como `root` · tokens npm en `.npmrc` versionado.

## 15. Definition of Done

`.node-version` en LTS soportada; `engines`/`devEngines` coherentes; allowlist de scripts y cooldown activos; `npm audit signatures` y audit de producción en CI; `.env.example` completo con validación por esquema; ningún secreto en bundles ni imágenes.

## 16. KPIs

0 builds no reproducibles · 0 runtimes EOL/Current · 0 install scripts fuera de allowlist · 0 deps Git/URL sin excepción · 0 secretos en repo/bundles/imágenes.

## 17. Referencias

Node.js Release Schedule, `--env-file`, Permission Model, TypeScript type stripping; npm v11/v12 (`approve-scripts`, `strict-allow-scripts`, `min-release-age`, `allow-git`, `allow-remote`, `devEngines`, `audit signatures`, trusted publishing); Next.js 16 Environment Variables & `output: "standalone"`; Zod 4 string formats.

---

## 18. Aplicación en Jopói

- **Runtime y gestor:** [`.node-version`](../../../.node-version) (`24.22.1`), [`package.json`](../../../package.json) (`engines.node: ">=24.0.0 <27"`, `devEngines`, `allowScripts`, scripts `audit:deps`, `audit:signatures`, `check`) y [`.npmrc`](../../../.npmrc) (`save-exact=true`, `engine-strict=true`, `strict-peer-deps=true`, `min-release-age=3`).
- **Validación de entorno por capacidades (Zod 4):** [`src/server/config/environment.ts`](../../../src/server/config/environment.ts) y [`src/server/config/cli-environment.ts`](../../../src/server/config/cli-environment.ts), separando perfiles `local` y `candidate` sin variables `NEXT_PUBLIC_`.
- **Preflight offline:** [`src/server/delivery/preflight.ts`](../../../src/server/delivery/preflight.ts) verifica paridad exacta `package.json` ↔ `package-lock.json`, rango de Node LTS (24 y 26) e inventario de migraciones/activos.
- **CI y Dependabot:** [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) y [`.github/dependabot.yml`](../../../.github/dependabot.yml).
