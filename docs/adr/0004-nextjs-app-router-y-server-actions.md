# 4. Next.js App Router y Server Actions para mutaciones y transporte

Fecha: 2026-10-28  
Estado: Aceptada  

## Contexto
El prototipo de Jopói necesita manejar tanto la experiencia visual guiada (cambio de roles, formulario de contacto, visualizador de QR) como los contratos de API pública de trazabilidad. Se requiere un esquema de transporte ágil, seguro contra ataques CSRF, que admita validación tipada y control de idempotencia sin añadir la complejidad operativa de mantener dos servidores separados (un backend Express independiente y una SPA React).

## Opciones consideradas
1. Frontend SPA (Vite + React) con Backend independiente (Node.js + Express / Fastify).
2. Monolito en Next.js (App Router) con Server Actions para mutaciones y Route Handlers para API pública.
3. Next.js con arquitectura clásica Pages Router y API Routes tradicionales.

## Decisión
Adoptamos **Next.js (App Router)** como marco monolítico unificado, utilizando:
- **Server Actions** para las mutaciones operativas del recorrido guiado (`SAVE`, `PUBLISH`, `APPROVE`, `ASSIGN`, `PICKUP`, `RECEIVE`, `INCIDENT`), aprovechando la protección CSRF nativa y tipado directo sin fetch manual en cliente.
- **Route Handlers** (`src/app/api/v1/...`) para la API pública de trazabilidad, streaming de telemetría RUM y negociación de errores `Problem Details` (RFC-7807/9457).

## Motivos
- Reduce el costo de infraestructura a cero dólares: un único artefacto desplegable en el plan gratuito Vercel Hobby.
- Tipado end-to-end con TypeScript y esquemas Zod compartidos entre cliente y servidor.
- Soporte nativo para Server Components, permitiendo renderizar datos estáticos e hidratar únicamente los controles interactivos.

## Consecuencias
- (+) Un único repositorio, proceso de build y despliegue unificado.
- (+) Reducción significativa de código boilerplate para invocación de mutaciones y manejo de sesiones.
- (−) Acoplamiento al runtime de Next.js y Vercel.
- (−) Requiere disciplina arquitectónica estricta para no importar lógica de base de datos (`Prisma`) dentro de los componentes visuales.
