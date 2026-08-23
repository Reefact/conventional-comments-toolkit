# Composant B (compagnon serveur) — image auto-hébergeable, une instance par client.
# Multi-étages : l'outillage de build (TypeScript, vitest) ne voyage jamais dans l'image
# finale. Zéro dépendance runtime (§10) : `npm ci --omit=dev` ne crée que les liens de
# workspaces, aucun paquet tiers n'entre dans l'image.

FROM node:22-alpine AS build
WORKDIR /app
# Manifestes d'abord : l'installation n'est invalidée que par un changement de
# dépendances, jamais par une édition de source ou de documentation.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/adapters/shared/package.json packages/adapters/shared/package.json
COPY packages/adapters/github/package.json packages/adapters/github/package.json
COPY packages/adapters/azdo/package.json packages/adapters/azdo/package.json
COPY packages/extension/package.json packages/extension/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci
# Puis uniquement ce que `tsc -b` consomme.
COPY tsconfig.base.json ./
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY packages/core/src packages/core/src
COPY packages/adapters/shared/tsconfig.json packages/adapters/shared/tsconfig.json
COPY packages/adapters/shared/src packages/adapters/shared/src
COPY packages/adapters/github/tsconfig.json packages/adapters/github/tsconfig.json
COPY packages/adapters/github/src packages/adapters/github/src
COPY packages/adapters/azdo/tsconfig.json packages/adapters/azdo/tsconfig.json
COPY packages/adapters/azdo/src packages/adapters/azdo/src
COPY packages/extension/tsconfig.json packages/extension/tsconfig.json
COPY packages/extension/src packages/extension/src
COPY packages/server/tsconfig.json packages/server/tsconfig.json
COPY packages/server/src packages/server/src
RUN npm run build

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

# Processus non root à UID FIGÉ (publié dans docs/deployment.md : un bind mount se
# prépare avec `chown -R 10001` côté hôte) ; /data est le seul chemin d'écriture.
RUN addgroup -S -g 10001 cct && adduser -S -u 10001 -G cct cct \
  && mkdir -p /data && chown cct:cct /data
USER cct
VOLUME /data
ENV CCT_STORAGE=file \
    CCT_DATA_DIR=/data \
    CCT_PORT=8080
EXPOSE 8080

# Forme shell : ${CCT_PORT} est substitué — un port réglé ne rend jamais le conteneur
# « unhealthy » à vie sur une sonde figée.
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${CCT_PORT:-8080}/healthz" || exit 1

CMD ["node", "packages/server/dist/main.js"]
