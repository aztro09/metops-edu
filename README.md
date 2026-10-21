# MetOps EDU

Sistema de reporte y seguimiento de incidentes de infraestructura (salones, laboratorios y equipos) para escuelas.
**Trabajo Terminal 2027-A184 · ESCOM-IPN**

## Stack

| Capa | Tecnología |
|---|---|
| Monorepo | pnpm 10 workspaces (`apps/*`, `packages/*`) |
| Backend | Node 22+, Fastify 5, Prisma 6.19 (`@prisma/adapter-pg`), Socket.IO, zod 3 |
| Frontend | React 19, Vite 7, Tailwind 4, TanStack Query, React Router, Recharts |
| Base de datos | PostgreSQL (Docker) |
| Pruebas | Vitest (unitarias e integración), Playwright (E2E), k6 (carga) |
| Observabilidad | `/metrics` con prom-client + Prometheus |
| Despliegue | Docker Compose + Caddy |

## Estructura

```text
metops-edu/
├─ apps/
│  ├─ api/          # Backend (monolito modular)
│  │  ├─ prisma/    # schema, migraciones y seed
│  │  ├─ src/
│  │  │  ├─ core/       # env, db, auth, eventos, storage, métricas
│  │  │  └─ modules/    # acceso, catalogos, incidentes, asignacion, comunicacion, reportes
│  │  └─ test/      # pruebas de integración
│  └─ web/          # Frontend React
├─ packages/
│  └─ shared/       # @metops/shared: catálogos, permisos (RBAC) y esquemas zod
├─ deploy/          # docker-compose (dev y prod), Caddyfile, Prometheus, respaldos
├─ e2e/             # pruebas Playwright
└─ load/            # prueba de carga k6
```

## Requisitos

- Windows 10/11 con PowerShell 7
- Node.js 22 o superior
- pnpm 10.28 (`corepack enable`)
- Docker Desktop (solo para PostgreSQL y Mailpit)

## Puesta en marcha

```powershell
# 1. Dependencias
pnpm install

# 2. Variables de entorno (edita los valores, sobre todo JWT_SECRET y ADMIN_*)
Copy-Item .env.example .env

# 3. Base de datos y correo de pruebas
docker compose -f deploy/docker-compose.dev.yml up -d

# 4. Migraciones y datos iniciales
pnpm --filter @metops/api db:deploy
pnpm --filter @metops/api db:seed

# 5. Arrancar API + web
pnpm dev
```

| Servicio | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:3000 (`/health`, `/metrics`) |
| Mailpit | http://localhost:8025 |
| PostgreSQL | `localhost:5433` |

El administrador inicial se crea con `ADMIN_CORREO`, `ADMIN_PASSWORD` y `ADMIN_CLAVE` del `.env`.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm dev` | API y web en modo desarrollo |
| `pnpm build` | Compila todos los paquetes |
| `pnpm typecheck` | Revisión de tipos en todo el monorepo |
| `pnpm test` | Pruebas unitarias e integración |
| `pnpm e2e` | Prueba E2E con Playwright |
| `pnpm --filter @metops/api db:migrate` | Nueva migración (desarrollo) |
| `pnpm --filter @metops/api db:studio` | Prisma Studio |
| `pnpm --filter @metops/api db:reset` | Borra y recrea la BD de desarrollo |
| `pwsh deploy/backup.ps1` | Respaldo de la BD de desarrollo |

## Pruebas

Las pruebas de integración usan una base separada, `metops_test`. Prepárala una sola vez:

```powershell
docker compose -f deploy/docker-compose.dev.yml exec db createdb -U metops metops_test
pnpm --filter @metops/api db:test:migrate
pnpm test
```

Para la prueba E2E (la primera vez hay que instalar el navegador):

```powershell
pnpm exec playwright install chromium
pnpm e2e
```

## Decisiones técnicas

- **Monolito modular**: los módulos se comunican por un bus de eventos en memoria, no con llamadas cruzadas.
- **Reglas críticas en la BD**: CHECKs de dominio y un trigger que vuelve **inmutable** el historial de tickets.
- **Autenticación**: el access JWT dura 15 min y vive en memoria. El refresh token va en una cookie `httpOnly`, se guarda hasheado y rota en cada uso; si se detecta reutilización, se revoca toda la familia de tokens.
- **Contraseñas** con argon2id y límite de intentos de login.
- **Folios** de tickets con formato `MO-AAAA-NNNNN`.
- **CSV** con protección contra inyección de fórmulas.

## Solución de problemas

En este orden: `docker compose ps` → `.env` → `pnpm install` → `pnpm typecheck` → pruebas → logs de la API.

| Síntoma | Solución |
|---|---|
| `Can't reach database server` | Abre Docker Desktop y ejecuta `docker compose -f deploy/docker-compose.dev.yml up -d` |
| Puerto 5433 ocupado | Detén el otro contenedor o cambia el puerto en `docker-compose.dev.yml` y en `DATABASE_URL` |
| `&&` da error | Estás en PowerShell 5.1; usa `pwsh` (7.x) |
