# Guía de Despliegue y Plan de Recuperación ante Desastres (DRP) — Jopói

Este documento detalla el procedimiento de despliegue, la configuración de entornos en la infraestructura de presupuesto cero (Vercel + Neon) y el Plan de Recuperación ante Desastres (DRP) con pasos de restauración comprobados.

---

## 1. Entornos de despliegue

| Entorno | Plataforma | Base de datos | Hedera | Finalidad |
| :--- | :--- | :--- | :--- | :--- |
| **Local / Dev** | Node.js v24 (`npm run dev`) | PostgreSQL 16 local o Docker | Testnet (Topic dedicado o simulado) | Desarrollo de funciones y pruebas unitarias. |
| **Preview** | Vercel Preview (ramas `feat/*`) | Neon Serverless (branching o dev) | Testnet | Validación E2E en navegador y revisión de PRs. |
| **Production** | Vercel Production (`main`) | Neon Serverless (PostgreSQL 16) | Testnet (Topic institucional Jopói) | Prototipo público accesible para evaluadores. |

---

## 2. Variables de entorno

La configuración del sistema se gobierna mediante variables de entorno validadas al inicio del servidor. Ver plantilla en [`.env.example`](file:///C:/Users/Facundo/dev/jopoi/.env.example):

| Variable | Requerida | Descripción | Ejemplo / Valor por defecto |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL con pooling transaccional. | `postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` |
| `DIRECT_URL` | No | Conexión directa a PostgreSQL (para ejecutar migraciones Prisma). | `postgresql://user:pass@ep-xyz.neon.tech/neondb` |
| `HEDERA_NETWORK` | Sí | Red de destino para HCS. | `testnet` |
| `HEDERA_OPERATOR_ID` | Sí | Account ID del operador que firma las transacciones. | `0.0.1234567` |
| `HEDERA_OPERATOR_KEY` | Sí | Clave privada DER o ED25519 del operador. | `302e...` |
| `HEDERA_TOPIC_ID` | Sí | Identificador del tópico HCS donde se publican los hitos. | `0.0.7654321` |
| `APP_URL` | Sí | Origen público HTTPS canónico de la aplicación. | `https://jopoi.vercel.app` |
| `SESSION_SECRET` | Sí | Semilla criptográfica de al menos 32 caracteres para firmas de cookies. | `(cadena pseudoaleatoria de alta entropía)` |

> [!CAUTION]
> Nunca incluir valores reales ni secretos en repositorios o archivos `.env` versionados. Vercel gestiona las variables mediante su panel de configuración de proyecto con cifrado en reposo.

---

## 3. Procedimiento de despliegue

### Despliegue en Vercel
1. Los cambios mergeados en la rama `main` disparan automáticamente el pipeline de Vercel.
2. Durante el paso `vercel-build`:
   - Se compila el cliente Prisma: `npx prisma generate`.
   - Se construyen las páginas y assets estáticos: `next build`.
3. Vercel publica la nueva versión inmutable asignando el dominio canónico de producción.

### Procedimiento de Rollback
Si una versión desplegada presenta anomalías críticas:
1. En el panel de Vercel (**Deployments**), localizar el último despliegue estable previo.
2. Seleccionar la opción **«Instant Rollback»**.
3. El tráfico se redirige de inmediato a la compilación previa sin requerir un nuevo commit ni tiempo de compilación.

---

## 4. Plan de Recuperación ante Desastres (DRP)

El DRP establece las garantías y procedimientos para restaurar la operatividad de la plataforma ante contingencias graves (corrupción de datos, desconfiguración o eliminación accidental de la base de datos).

### 4.1 Métricas de recuperación
- **RPO (Recovery Point Objective):** < 24 horas. (Pérdida máxima tolerable de datos locales ante desastre catastrófico).
- **RTO (Recovery Time Objective):** < 1 hora. (Tiempo máximo para restablecer el servicio operativo).

### 4.2 Política de respaldos (Backups)
1. **Puntos de restauración Neon (Point-in-Time Recovery):**
   - Neon realiza copias continuas de WAL y snapshots diarios automáticos.
   - Retención estándar de snapshots en plan gratuito: hasta 7 días.
2. **Volcado lógico periódico (pg_dump):**
   - Comando de extracción manual antes de actualizaciones estructurales mayores:
     ```bash
     pg_dump "$DIRECT_URL" -Fc -f backup-jopoi-$(date +%Y%m%d).dump
     ```

### 4.3 Procedimiento de restauración probado (Ensayo S22-29)

Ante una pérdida total o corrupción de la base de datos:

1. **Paso 1: Aislar el entorno productivo**
   - En Vercel, redirigir temporalmente el tráfico a la página de mantenimiento o pausar despliegues automáticos.
2. **Paso 2: Aprovisionar o restaurar la instancia Neon**
   - Desde la consola de Neon, restaurar el proyecto a un punto en el tiempo (*Restore to a point in time*) o aprovisionar una base vacía.
3. **Paso 3: Aplicar migraciones estructurales**
   ```bash
   npx prisma migrate deploy
   ```
4. **Paso 4: Restaurar datos del volcado lógico (si aplica)**
   ```bash
   pg_restore -d "$DIRECT_URL" --clean --if-exists backup-jopoi-YYYYMMDD.dump
   ```
5. **Paso 5: Conciliar publicaciones de red (HCS)**
   - Ejecutar el script de reconciliación de outbox para marcar como `QUEUED` cualquier evento pendiente:
     ```bash
     npm run maintenance:reconcile
     ```
   - Los registros ya confirmados en Hedera son inmutables y sirven como fuente externa de contraste.
6. **Paso 6: Validar salud del sistema**
   - Ejecutar la verificación operativa:
     ```bash
     npm run test:observability
     ```
   - Restablecer el tráfico público en Vercel.
