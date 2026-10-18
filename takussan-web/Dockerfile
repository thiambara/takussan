# Image du front Takussan (ADR-0028 §3, amendé par ADR-0069 §3). UNE image PAR COMMIT : elle ne
# porte aucun environnement. L'origine de l'API, celle du site et celle des médias se lisent À
# L'EXÉCUTION (API_URL, SITE_URL, MEDIA_URL, posées dans Dokploy), et docker/demarrer.mjs refuse de
# démarrer sans elles. La même image sert la préproduction puis la production.
#
# Pas de directive `# syntax=` : le frontend intégré à BuildKit suffit, et la directive ajoute à
# chaque build une requête vers Docker Hub (cf. takussan-api/Dockerfile).

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG BUILD_SHA=inconnu
# ⚠ AUCUN `NEXT_PUBLIC_API_URL`, `_SITE_URL` ni `_MEDIA_URL` ici : Next les inlinerait dans le
# bundle, et l'image redeviendrait propre à un environnement. scripts/check-front-env-keys.mjs le
# refuse.
#
# Le loader de Cloudflare Transformations est branché par `next build` lui-même (next.config.ts,
# ADR-0029 §4) : l'origine du seau se lit à l'exécution.
ENV BUILD_SHA=${BUILD_SHA} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node docker/demarrer.mjs ./demarrer.mjs
USER node
EXPOSE 3000
# Une Application Dokploy est un service Swarm : il ne bascule le trafic que sur un conteneur sain.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# demarrer.mjs vérifie API_URL, SITE_URL et MEDIA_URL, puis importe server.js (ADR-0069 §3).
CMD ["node", "demarrer.mjs"]
