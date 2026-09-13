# syntax=docker/dockerfile:1.7
#
# Image du front Takussan (ADR-0028 §3). UNE image PAR ENVIRONNEMENT : NEXT_PUBLIC_* est inliné à
# la compilation (docs/infra/frontend-deploiement.md), la même image ne peut pas servir deux
# origines.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG BUILD_SHA=inconnu
# Le refus d'ADR-0028 §3. `resoudreOrigineSite()` (src/lib/alternates.ts) reconnaît une
# prévisualisation à VERCEL_ENV, qui n'existe pas ici : sans NEXT_PUBLIC_SITE_URL, une
# préproduction retomberait EN SILENCE sur l'origine de production et y déclarerait ses pages
# canoniques. On refuse avant le premier octet compilé.
RUN test -n "$NEXT_PUBLIC_API_URL" || { echo "✗ NEXT_PUBLIC_API_URL manquant (ADR-0028 §3)" >&2; exit 1; }
RUN test -n "$NEXT_PUBLIC_SITE_URL" || { echo "✗ NEXT_PUBLIC_SITE_URL manquant (ADR-0028 §3)" >&2; exit 1; }
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    BUILD_SHA=${BUILD_SHA} \
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
USER node
EXPOSE 3000
# Une Application Dokploy est un service Swarm : il ne bascule le trafic que sur un conteneur sain.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
