# Contexto de construcción: la raíz del repositorio (ver deploy/docker-compose.yml).
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
# Primero solo los manifiestos: Docker reutiliza esta capa mientras no cambien las dependencias.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @metops/api...
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter @metops/api build
# Carpeta autosuficiente con solo las dependencias de producción (@metops/shared ya va dentro del bundle).
RUN pnpm --filter @metops/api deploy --prod --legacy /out
WORKDIR /out
RUN node_modules/.bin/prisma generate

FROM node:22-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
