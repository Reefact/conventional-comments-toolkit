# Composant B (compagnon serveur) — image auto-hébergeable, une instance par client.
# Multi-étages : l'outillage de build (TypeScript, vitest) ne voyage jamais dans l'image
# finale. Zéro dépendance runtime (§10) : `npm ci --omit=dev` ne crée que les liens de
# workspaces, aucun paquet tiers n'entre dans l'image.

FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Les package.json de TOUS les workspaces sont requis par `npm ci` (ils sont déclarés à
# la racine), même si seuls core et server sont exécutés.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/adapters/shared/package.json packages/adapters/shared/package.json
COPY packages/adapters/github/package.json packages/adapters/github/package.json
COPY packages/adapters/azdo/package.json packages/adapters/azdo/package.json
COPY packages/extension/package.json packages/extension/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist

# Processus non root ; /data est le seul chemin d'écriture (stockage file/sqlite).
RUN addgroup -S cct && adduser -S cct -G cct && mkdir -p /data && chown cct:cct /data
USER cct
VOLUME /data
ENV CCT_STORAGE=file \
    CCT_STORAGE_PATH=/data/storage.json \
    CCT_PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "packages/server/dist/main.js"]
