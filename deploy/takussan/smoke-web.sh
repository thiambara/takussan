#!/usr/bin/env bash
# Test de fumée de l'image du front Takussan, EN LOCAL (ADR-0028, plan B3 ; ADR-0069 §3).
#
# Prérequis : l'API de développement sur 127.0.0.1:8002 (`./dev.sh api`). Les pages publiques la
# consultent au rendu ; le conteneur la joint par host.docker.internal.
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE=ghcr.io/thiambara/takussan-web:local
NOM=takussan-web-smoke
PORT=3999
API=http://host.docker.internal:8002
SITE=https://preview.takussan.com

echec() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }
entetes() { curl -sS -o /dev/null -D - "$@" | tr -d '\r'; }

curl -fsS -o /dev/null http://127.0.0.1:8002/up || echec "l'API de développement ne répond pas : lancer ./dev.sh api"

MEDIA=${MEDIA:-https://media.smoke.invalid}
PRODUCTION=https://www.takussan.com

# 1. L'image, construite comme images.yml la construit : AUCUNE configuration au build
# (ADR-0069 §3). Une seule image, qui servira les deux origines plus bas.
docker build -q --build-arg BUILD_SHA=smoke -t "$IMAGE" takussan-web >/dev/null
if docker image inspect -f '{{join .Config.Env "\n"}}' "$IMAGE" | grep -q '^NEXT_PUBLIC_'; then
  echec "une NEXT_PUBLIC_* est entrée dans l'image : elle serait propre à un environnement"
fi
ok "image construite sans aucune NEXT_PUBLIC_*"

# 2. Le refus (ADR-0069 §3) : sans SITE_URL, le conteneur ne démarre pas — ET c'est demarrer.mjs
# qui le refuse. Une sortie en erreur pour une autre raison ne prouve rien : la compter comme un
# refus a donné un faux vert à la piste CheckPrint Plus.
if sortie=$(docker run --rm -e API_URL="$API" -e MEDIA_URL="$MEDIA" "$IMAGE" 2>&1); then
  echec "le conteneur démarre SANS SITE_URL : il déclarerait ses pages canoniques en production"
fi
grep -qF '✗ SITE_URL manquante' <<<"$sortie" \
  || { tail -20 <<<"$sortie" >&2; echec "le conteneur sans SITE_URL sort en erreur, mais pas sur sa garde : refus non prouvé"; }
ok "démarrage refusé sans SITE_URL, par sa garde"

docker rm -f "$NOM" >/dev/null 2>&1 || true
trap 'docker rm -f "$NOM" >/dev/null 2>&1 || true' EXIT
# lancer <SITE_URL> [options de docker run…] : les options en plus posent une variable d'exécution.
lancer() {
  local site=$1
  shift
  docker rm -f "$NOM" >/dev/null 2>&1 || true
  docker run -d --name "$NOM" -p "$PORT:3000" -e API_URL="$API" -e SITE_URL="$site" -e MEDIA_URL="$MEDIA" "$@" "$IMAGE" >/dev/null
  for _ in $(seq 30); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] && break; sleep 2
  done
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] || { docker logs "$NOM"; echec "le conteneur n'est pas sain"; }
}
lancer "$SITE"
ok "conteneur sain"

[ "$(docker exec "$NOM" id -un)" = node ] || echec "l'image ne tourne pas sous node"
[ "$(docker exec "$NOM" sh -c 'ls -A /app | grep -c "^\.env" || true')" = 0 ] || echec "un .env est entré dans l'image"
ok "utilisateur node, aucun .env"

# Capturer, puis chercher : `cmd | grep -q` sous pipefail rougit selon le minutage (SIGPIPE, 141).
grep -qix 'x-build-sha: smoke' <<<"$(entetes "http://127.0.0.1:$PORT/robots.txt")" || echec "X-Build-Sha absent ou faux"
grep -qxF "Sitemap: $SITE/sitemap.xml" <<<"$(curl -fsS "http://127.0.0.1:$PORT/robots.txt")" \
  || echec "robots.txt ne déclare pas l'origine $SITE : SITE_URL n'est pas lue à l'exécution"
ok "X-Build-Sha et origine du site"

# Le navigateur reçoit l'API et les médias du serveur, écrits dans la page par le layout racine.
grep -qF "window.__TAKUSSAN_CONFIG__={\"apiUrl\":\"$API\",\"mediaUrl\":\"$MEDIA\"}" \
  <<<"$(curl -fsS "http://127.0.0.1:$PORT/fr")" || echec "/fr ne transmet pas API_URL et MEDIA_URL au navigateur"
ok "configuration transmise au navigateur"

for langue in fr en wo; do
  [ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/$langue")" = 200 ] || echec "/$langue ne rend pas 200"
done
ok "/fr, /en, /wo à 200"

# Le loader de Cloudflare est branché (tout `next build`, ADR-0029 §4) : l'optimiseur de Next
# ne tourne plus dans le conteneur, et `/_next/image` n'est plus servi. Un 200 ici voudrait dire
# que chaque photo repasse par le CPU du VPS. (Ce contrôle attendait de l'AVIF jusqu'au
# 2026-10-18 : faux depuis TCK-540, qui branchait déjà le loader dans l'image de fumée.)
code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/_next/image?url=https%3A%2F%2Fplacehold.co%2F600x400.png&w=640&q=75")
[ "$code" = 404 ] || echec "/_next/image rend $code au lieu de 404 : le loader de Cloudflare n'est pas branché"
ok "loader de Cloudflare branché, optimiseur absent"

# TCK-950 (P44.03) — le serveur n'annonce pas sa pile.
grep -qi '^x-powered-by:' <<<"$(entetes "http://127.0.0.1:$PORT/fr")" && echec "X-Powered-By est émis : poweredByHeader n'est pas à false"
ok "aucun X-Powered-By"

# TCK-949 (P44.02) — Node garde ses connexions inactives PLUS longtemps que Traefik (90 s, défaut de
# `idleConnTimeout`) : sinon Traefik peut réutiliser une connexion que Node vient de fermer (502).
garde=$(awk -F'timeout=' 'tolower($1) == "keep-alive: " { print $2 + 0 }' <<<"$(entetes "http://127.0.0.1:$PORT/robots.txt")")
[ "${garde:-0}" -gt 90 ] || echec "Keep-Alive: timeout=${garde:-absent} : pas au-dessus des 90 s de Traefik (KEEP_ALIVE_TIMEOUT)"
ok "Keep-Alive: timeout=$garde, au-dessus des 90 s de Traefik"

# TCK-948 (P44.01) — la route que lit la preuve d'images.yml : le front joint l'API, et le dit.
sante=$(curl -sS -o /dev/null -D - -w '%{http_code}' "http://127.0.0.1:$PORT/api/sante" | tr -d '\r')
[ "$(tail -1 <<<"$sante")" = 200 ] || echec "/api/sante rend $(tail -1 <<<"$sante") alors que l'API répond"
grep -qix 'x-build-sha: smoke' <<<"$sante" || echec "/api/sante ne porte pas X-Build-Sha : la preuve ne la relirait pas"
ok "/api/sante à 200 quand l'API répond, avec X-Build-Sha"

docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' "$NOM"

# TCK-948 (P44.01) — l'API injoignable : `API_INTERNAL_URL` vers un port fermé. Le conteneur reste
# SAIN (le HEALTHCHECK lit robots.txt, et une panne de l'API ne doit pas arrêter le front), mais la
# route de santé rougit : c'est elle qui fait échouer la preuve d'images.yml.
lancer "$SITE" -e API_INTERNAL_URL=http://127.0.0.1:9
code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/sante")
[ "$code" = 503 ] || echec "/api/sante rend $code avec une API injoignable, au lieu de 503 : la preuve passerait au vert"
ok "API injoignable : conteneur sain, /api/sante à 503"

# 3. LA MÊME image sert une autre origine : seule la variable d'exécution change (ADR-0069 §3).
lancer "$PRODUCTION"
grep -qxF "Sitemap: $PRODUCTION/sitemap.xml" <<<"$(curl -fsS "http://127.0.0.1:$PORT/robots.txt")" \
  || echec "la même image ne sert pas $PRODUCTION : l'origine est figée dans l'image"
ok "la même image sert $SITE puis $PRODUCTION"
