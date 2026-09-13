#!/usr/bin/env bash
# Test de fumée de l'image du front Takussan, EN LOCAL (ADR-0028, plan B3).
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

# 1. Le refus (ADR-0028 §3) : sans NEXT_PUBLIC_SITE_URL, l'image ne se construit pas — ET c'est sa
# garde qui la refuse. Un build tombé sur autre chose (le réseau, une dépendance) ne prouve rien :
# le compter comme un refus a donné un faux vert à la piste CheckPrint Plus.
if sortie=$(docker build --progress=plain --build-arg NEXT_PUBLIC_API_URL="$API" -t "$IMAGE-refus" takussan-web 2>&1); then
  docker image rm -f "$IMAGE-refus" >/dev/null
  echec "l'image se construit SANS NEXT_PUBLIC_SITE_URL : elle déclarerait ses pages canoniques en production"
fi
grep -qF '✗ NEXT_PUBLIC_SITE_URL manquant' <<<"$sortie" \
  || { tail -20 <<<"$sortie" >&2; echec "le build sans NEXT_PUBLIC_SITE_URL échoue, mais pas sur sa garde : refus non prouvé"; }
ok "build refusé sans NEXT_PUBLIC_SITE_URL, par sa garde"

# 2. L'image, construite comme images.yml la construit.
docker build -q --build-arg NEXT_PUBLIC_API_URL="$API" --build-arg NEXT_PUBLIC_SITE_URL="$SITE" \
  --build-arg BUILD_SHA=smoke -t "$IMAGE" takussan-web >/dev/null
docker rm -f "$NOM" >/dev/null 2>&1 || true
trap 'docker rm -f "$NOM" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NOM" -p "$PORT:3000" "$IMAGE" >/dev/null
for _ in $(seq 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] && break; sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] || { docker logs "$NOM"; echec "le conteneur n'est pas sain"; }
ok "conteneur sain"

[ "$(docker exec "$NOM" id -un)" = node ] || echec "l'image ne tourne pas sous node"
[ "$(docker exec "$NOM" sh -c 'ls -A /app | grep -c "^\.env" || true')" = 0 ] || echec "un .env est entré dans l'image"
ok "utilisateur node, aucun .env"

entetes "http://127.0.0.1:$PORT/robots.txt" | grep -qix 'x-build-sha: smoke' || echec "X-Build-Sha absent ou faux"
curl -fsS "http://127.0.0.1:$PORT/robots.txt" | grep -qxF "Sitemap: $SITE/sitemap.xml" \
  || echec "robots.txt ne déclare pas l'origine $SITE : NEXT_PUBLIC_SITE_URL n'a pas été inlinée"
ok "X-Build-Sha et origine du site"

for langue in fr en wo; do
  [ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/$langue")" = 200 ] || echec "/$langue ne rend pas 200"
done
ok "/fr, /en, /wo à 200"

entetes -H 'Accept: image/avif' "http://127.0.0.1:$PORT/_next/image?url=https%3A%2F%2Fplacehold.co%2F600x400.png&w=640&q=75" \
  | grep -qix 'content-type: image/avif' || echec "l'optimiseur ne sert pas d'AVIF : sharp manque à l'image standalone"
ok "optimiseur d'images en AVIF"

docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' "$NOM"
