#!/usr/bin/env bash
# Test de fumée de l'image d'API Takussan et de sa pile Compose, EN LOCAL (ADR-0028, plan B1-B2).
#
#   deploy/takussan/smoke-api.sh image   # l'image seule
#   deploy/takussan/smoke-api.sh pile    # la pile entière, contre les services de docker-compose.yml
#
# Prérequis : l'image construite sous le tag `local` (et `local-seed` pour la pile) :
#   docker build --build-arg BUILD_SHA=smoke --target runtime -t ghcr.io/thiambara/takussan-api:local takussan-api
#   docker build --build-arg BUILD_SHA=smoke --target seed -t ghcr.io/thiambara/takussan-api:local-seed takussan-api
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE=ghcr.io/thiambara/takussan-api
ABLATION_TCK521=1 # retirée au commit suivant
TAG=${TAG:-local}   # surchargé par une ablation, pour ne jamais tester l'image réelle à sa place

echec() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }
dans() { docker run --rm --entrypoint "$1" "$IMAGE:$TAG" "${@:2}"; }

verifier_image() {
  local exts n
  exts=$(dans php -m)
  for e in pdo_pgsql pgsql redis intl bcmath gd zip exif pcntl 'Zend OPcache'; do
    grep -qx "$e" <<<"$exts" || echec "extension PHP absente : $e"
  done
  ok "extensions PHP"

  [ "$(dans id -un)" = www-data ] || echec "l'image ne tourne pas sous www-data"
  ok "utilisateur www-data"

  # Le poste porte des .env RÉELS dans takussan-api/ (ignorés par git, PAS par Docker).
  n=$(dans sh -c 'ls -A /app | grep -c "^\.env" || true')
  [ "$n" = 0 ] || echec "$n fichier(s) .env* dans l'image : .dockerignore ne les exclut plus"
  ok "aucun .env dans l'image"

  dans php -r 'require "/app/vendor/autoload.php"; exit(class_exists("Faker\\Factory") ? 1 : 0);' \
    || echec "Faker est dans l'image runtime : des dépendances de dev y sont installées"
  ok "aucune dépendance de dev"

  dans sh -c 'grep -Eqx "[0-9a-f]{64}" /app/.search-shape' || echec ".search-shape absente ou mal formée"
  ok "empreinte .search-shape"

  dans test -f /app/public/build/manifest.json || echec "assets Vite absents (public/build/manifest.json)"
  ok "assets Vite"

  [ "$(dans readlink /app/public/storage)" = /app/storage/app/public ] || echec "lien public/storage absent"
  ok "lien public/storage"

  [ "$(dans printenv BUILD_SHA)" = smoke ] || echec "BUILD_SHA n'est pas transmis à l'image"
  ok "BUILD_SHA"

  # L'image de base sonde l'admin de Caddy (port 2019), coupée ici : héritée, cette sonde
  # déclare malades worker et scheduler, qui n'écoutent rien.
  [ "$(docker inspect -f '{{json .Config.Healthcheck.Test}}' "$IMAGE:$TAG")" = '["NONE"]' ] \
    || echec "l'image hérite d'une sonde de santé : worker et scheduler seraient déclarés malades"
  ok "sonde de l'image de base annulée"

  dans test -w /config/psysh || echec "/config/psysh n'est pas inscriptible : artisan tinker meurt sous www-data"
  ok "artisan tinker utilisable"
}

PROJET=takussan-smoke
COMPOSE=(docker compose -p "$PROJET" -f deploy/takussan/compose.api.yml)
ENV_LOCAL=deploy/takussan/.env
MARQUE='# généré par smoke-api.sh — jetable'

sonde() { docker run --rm --network dokploy-network curlimages/curl -sS "$@"; }
tinker() { "${COMPOSE[@]}" exec -T api php artisan tinker --execute "$1"; }

preparer_pile() {
  if [ -f "$ENV_LOCAL" ] && ! head -1 "$ENV_LOCAL" | grep -qxF "$MARQUE"; then
    echec "$ENV_LOCAL existe et n'a pas été généré par ce script : refus de l'écraser"
  fi
  { echo "$MARQUE"; cat deploy/takussan/.env.smoke.example; echo "APP_KEY=base64:$(openssl rand -base64 32)"; } > "$ENV_LOCAL"
  docker network inspect dokploy-network >/dev/null 2>&1 || docker network create dokploy-network >/dev/null
  docker compose up -d --wait postgres meilisearch redis
  docker compose exec -T postgres psql -U takussan -d postgres -q \
    -c 'DROP DATABASE IF EXISTS takussan_smoke' \
    -c "CREATE DATABASE takussan_smoke ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0"
}

nettoyer_pile() {
  "${COMPOSE[@]}" --profile seed down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_LOCAL"
}

verifier_pile() {
  local api="http://$PROJET-api-1:8080" css n q
  trap nettoyer_pile EXIT
  preparer_pile

  # Pas de `--wait` : il exige une sonde sur CHAQUE service, et Compose ne tient pas
  # `HEALTHCHECK NONE` pour une sonde (« has no healthcheck configured »). Dokploy ne le passe pas
  # non plus. `up` attend quand même le SUCCÈS de release (depends_on) ; le reste se vérifie ici.
  "${COMPOSE[@]}" up -d --pull never || { "${COMPOSE[@]}" logs release; echec "la pile ne démarre pas"; }
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$PROJET-release-1")" = 0 ] \
    || { "${COMPOSE[@]}" logs release; echec "release a échoué"; }
  for _ in $(seq 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$PROJET-api-1")" = healthy ] && break
    sleep 2
  done
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$PROJET-api-1")" = healthy ] \
    || { "${COMPOSE[@]}" logs api; echec "api n'est pas saine"; }
  for s in worker worker-media scheduler; do
    [ "$(docker inspect -f '{{.State.Status}}' "$PROJET-$s-1")" = running ] \
      || { "${COMPOSE[@]}" logs "$s"; echec "$s ne tourne pas"; }
  done
  ok "la pile démarre, release d'abord"

  # La sortie se CAPTURE avant d'être cherchée, jamais `cmd | grep -q` : sous pipefail, grep -q sort
  # à la première correspondance, l'écrivain encore en cours prend SIGPIPE (141) et le pipeline
  # échoue — selon le minutage. Mesuré : deux passages sur quatre rougissaient ici à tort.
  grep -q 'Importation de App\\Models\\Property' <<<"$("${COMPOSE[@]}" logs release 2>&1)" \
    || echec "le premier release n'a pas importé Property dans Meilisearch"
  # `--pull never` ici aussi : `run` suit le `pull_policy: always` du Compose, pas le drapeau d'`up`.
  grep -q 'forme des index inchangée' <<<"$("${COMPOSE[@]}" run --rm --pull never release 2>&1)" \
    || echec "un second release réimporte alors que la forme des index n'a pas changé"
  ok "release idempotent (importe au premier passage, pas au second)"

  [ "$(sonde -o /dev/null -w '%{http_code}' "$api/up")" = 200 ] || echec "/up ne rend pas 200"
  grep -qix 'x-build-sha: smoke' <<<"$(sonde -D - -o /dev/null "$api/up" | tr -d '\r')" || echec "X-Build-Sha absent ou faux"
  ok "/up à 200, X-Build-Sha: smoke"

  # Une sonde par file que la production doit consommer — les files de check-queues.mjs. Un job
  # SÉRIALISABLE : une closure écrite dans tinker ne l'est pas (laravel/serializable-closure relit
  # le fichier source, et du code eval() n'en a pas). `inspire` vit dans routes/console.php.
  for q in default notifications-urgent media reconciliation; do
    tinker "Artisan::queue('inspire')->onQueue('$q');" >/dev/null
  done
  for _ in $(seq 30); do
    n=$(tinker 'echo DB::table("jobs")->count();' | tr -dc '0-9')
    [ "$n" = 0 ] && break; sleep 2
  done
  [ "$n" = 0 ] || echec "$n job(s) jamais consommé(s) : $(tinker 'echo DB::table("jobs")->pluck("queue")->implode(",");')"
  [ "$(tinker 'echo DB::table("failed_jobs")->count();' | tr -dc '0-9')" = 0 ] || echec "des jobs sonde ont échoué"
  ok "les quatre files sont consommées"

  "${COMPOSE[@]}" exec -T api sh -c 'echo sonde > /app/storage/app/public/sonde.txt'
  grep -qix 'cache-control: public, max-age=604800, stale-while-revalidate=86400' \
    <<<"$(sonde -D - -o /dev/null "$api/storage/sonde.txt" | tr -d '\r')" \
    || echec "Cache-Control de /storage différent de celui de nginx"
  ok "Cache-Control de /storage"

  # shellcheck disable=SC2016 # du PHP, évalué dans le conteneur : `$e` et `$c` n'y sont pas du shell.
  css=$("${COMPOSE[@]}" exec -T api php -r 'foreach (json_decode(file_get_contents("/app/public/build/manifest.json"), true) as $e) { foreach ($e["css"] ?? [] as $c) { echo $c; exit; } }')
  grep -qix 'content-encoding: gzip' <<<"$(sonde -D - -o /dev/null -H 'Accept-Encoding: gzip' "$api/build/$css" | tr -d '\r')" \
    || echec "le CSS n'est pas compressé"
  ok "compression gzip"

  for chemin in /.env /.htaccess /.git/config; do
    [ "$(sonde -o /dev/null -w '%{http_code}' "$api$chemin")" = 404 ] || echec "$chemin n'est pas refusé"
  done
  ok "fichiers cachés refusés (dont public/.htaccess, qui existe)"

  head -c $((24 * 1024 * 1024)) /dev/zero > /tmp/takussan-24mo
  head -c $((26 * 1024 * 1024)) /dev/zero > /tmp/takussan-26mo
  [ "$(docker run --rm --network dokploy-network -v /tmp:/t curlimages/curl -sS -o /dev/null -w '%{http_code}' --data-binary @/t/takussan-26mo "$api/up")" = 413 ] \
    || echec "un corps de 26 Mio n'est pas refusé en 413"
  [ "$(docker run --rm --network dokploy-network -v /tmp:/t curlimages/curl -sS -o /dev/null -w '%{http_code}' --data-binary @/t/takussan-24mo "$api/up")" != 413 ] \
    || echec "un corps de 24 Mio est refusé : la limite est plus basse que celle de nginx"
  rm -f /tmp/takussan-24mo /tmp/takussan-26mo
  ok "limite de corps à 25 Mio, comme nginx"

  sleep 30
  for s in api worker worker-media scheduler; do
    [ "$(docker inspect -f '{{.RestartCount}}' "$PROJET-$s-1")" = 0 ] || echec "$s redémarre en boucle"
  done
  ok "aucun service ne redémarre"

  "${COMPOSE[@]}" --profile seed run --rm --pull never -e SEEDER_CLASS="${SEEDER_CLASS:-}" seed >/dev/null || echec "le seed échoue"
  ok "le seed tourne sur la cible seed"

  docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep "$PROJET"
}

case "${1:-}" in
  image) verifier_image ;;
  pile) verifier_pile ;;
  *) echo "usage : $0 image|pile" >&2; exit 2 ;;
esac
