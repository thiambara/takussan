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
# ⚠ Aucune variable COMPOSE_* hérité : sur un fichier compose ILLISIBLE, `docker compose -p X down -v`
# ignore `-p` et vise le projet de COMPOSE_PROJECT_NAME (Compose v2.35.1, reproduit le 2026-10-18 sur
# un projet factice, témoin compris). Lancé avec COMPOSE_PROJECT_NAME=takussan pour réutiliser les
# services de développement, une ablation qui rendait compose.api.yml illisible a supprimé leurs
# conteneurs ET leurs volumes (base locale, index, Redis) — TCK-880.
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES

IMAGE=ghcr.io/thiambara/takussan-api
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
# Les services de développement (docker-compose.yml) : leur projet est NOMMÉ, pour qu'un smoke lancé
# depuis un worktree réutilise ceux du dépôt au lieu d'en créer de seconds sur les mêmes ports.
DEV=(docker compose -p "${PROJET_DEV:-takussan}" -f docker-compose.yml)
ENV_LOCAL=deploy/takussan/.env
MARQUE='# généré par smoke-api.sh — jetable'

sonde() { docker run --rm --network dokploy-network curlimages/curl -sS "$@"; }
tinker() { "${COMPOSE[@]}" exec -T api php artisan tinker --execute "$1"; }

# Le déploiement TEL QUE DOKPLOY LE LANCE — champ « Command » du service Compose, posé par le runbook
# (hebergement.md), `--pull never` en plus ici : release d'abord, par `run`, puis `up` SEULEMENT s'il
# a réussi. Un seul `up -d --build` ne suffit pas : Compose recrée api, worker et scheduler — l'ancien
# conteneur arrêté et retiré, le neuf « Created » — AVANT de savoir si release réussit, `depends_on`
# n'ordonnant que le DÉMARRAGE. Mesuré le 2026-09-14 (TCK-522) : release en échec, `api` recréé,
# `/up` → `000`. Le release tourne donc deux fois par déploiement ; le second ne réimporte rien.
deployer() {
  "${COMPOSE[@]}" run --rm --pull never release \
    && "${COMPOSE[@]}" up -d --build --pull never --remove-orphans
}

preparer_pile() {
  if [ -f "$ENV_LOCAL" ] && ! head -1 "$ENV_LOCAL" | grep -qxF "$MARQUE"; then
    echec "$ENV_LOCAL existe et n'a pas été généré par ce script : refus de l'écraser"
  fi
  {
    echo "$MARQUE"
    cat deploy/takussan/.env.smoke.example
    echo "APP_KEY=base64:$(openssl rand -base64 32)"
    echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
  } > "$ENV_LOCAL"
  docker network inspect dokploy-network >/dev/null 2>&1 || docker network create dokploy-network >/dev/null
  # Pas de Redis ici : la pile porte le sien (ADR-0069 § 4).
  # --no-recreate : depuis un worktree, le fichier diffère de celui qui a créé les conteneurs du dépôt
  # (chemins des montages), et Compose les RECRÉERAIT, en coupant ce qui tourne dessus.
  "${DEV[@]}" up -d --wait --no-recreate postgres meilisearch
  "${DEV[@]}" exec -T postgres psql -U takussan -d postgres -q \
    -c 'DROP DATABASE IF EXISTS takussan_smoke' \
    -c "CREATE DATABASE takussan_smoke ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0"
}

# TCK-995 (P53.03) — base, préfixe et projet sont des noms fixes : deux `pile` lancées depuis deux
# arbres se détruiraient l'une l'autre (`DROP DATABASE` de l'une sous l'autre, `down -v` du même
# projet). `mkdir` est atomique : le second passage s'arrête AVANT de poser son `trap`, sans rien
# nettoyer de ce qui ne lui appartient pas. Un verrou dont le processus est mort se reprend.
VERROU="${TMPDIR:-/tmp}/takussan-smoke-pile.verrou"
prendre_verrou() {
  if ! mkdir "$VERROU" 2>/dev/null; then
    local pid
    pid=$(cat "$VERROU/pid" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echec "un autre « smoke-api.sh pile » tourne (pid $pid, verrou $VERROU) : attendre sa fin"
    fi
    rm -rf "$VERROU"
    mkdir "$VERROU" || echec "verrou $VERROU impossible à prendre"
  fi
  echo $$ > "$VERROU/pid"
}
rendre_verrou() { rm -rf "$VERROU"; }

# Les index `smoke_*` vivent sur le Meilisearch de développement (port 7701, clé de
# `.env.smoke.example`), que `down -v` ne touche pas.
supprimer_index_smoke() {
  local hote=http://127.0.0.1:7701 cle uid
  cle=$(sed -n 's/^MEILISEARCH_KEY=//p' deploy/takussan/.env.smoke.example)
  for uid in $(curl -fsS -H "Authorization: Bearer $cle" "$hote/indexes?limit=1000" | grep -o '"uid":"smoke_[^"]*"' | cut -d'"' -f4); do
    curl -fsS -o /dev/null -X DELETE -H "Authorization: Bearer $cle" "$hote/indexes/$uid" || return 1
  done
}

nettoyer_pile() {
  # `down -v` SEULEMENT sur un fichier lisible (voir l'en-tête) ; sinon, par l'étiquette du projet,
  # qui ne peut désigner que lui.
  if "${COMPOSE[@]}" config -q >/dev/null 2>&1; then
    "${COMPOSE[@]}" --profile seed down -v --remove-orphans >/dev/null 2>&1 || true
  else
    echo "⚠ compose.api.yml illisible : nettoyage par l'étiquette com.docker.compose.project=$PROJET" >&2
    docker ps -aq --filter "label=com.docker.compose.project=$PROJET" | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker volume ls -q --filter "label=com.docker.compose.project=$PROJET" | xargs -r docker volume rm >/dev/null 2>&1 || true
    docker network ls -q --filter "label=com.docker.compose.project=$PROJET" | xargs -r docker network rm >/dev/null 2>&1 || true
  fi
  rm -f "$ENV_LOCAL" "$ENV_LOCAL.sain"
  # TCK-995 (P53.03) : la base et les index de la pile sont sur les services de développement.
  "${DEV[@]}" exec -T postgres psql -U takussan -d postgres -q \
    -c 'DROP DATABASE IF EXISTS takussan_smoke WITH (FORCE)' >/dev/null 2>&1 \
    || echo "⚠ base takussan_smoke non supprimée" >&2
  supprimer_index_smoke || echo "⚠ index smoke_* non supprimés" >&2
}

attendre_api_saine() {
  for _ in $(seq 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$PROJET-api-1")" = healthy ] && return 0
    sleep 2
  done
  "${COMPOSE[@]}" logs api; echec "api n'est pas saine"
}

# Un release qui ÉCHOUE laisse l'ancienne api servir (ADR-0028 §5, TCK-522) : `deployer` sur un
# `.env` dont DB_PASSWORD est faux — `migrate --force` meurt, `run` sort en 1, `up` n'est jamais
# lancé. C'est l'IDENTIFIANT du conteneur qui est comparé, jamais /up seul : un api recréé sur
# l'ancienne image répondrait 200 aussi. Ablation de l'ablation, mesurée le 2026-09-14 : avec un
# simple `up -d --build` à la place de `deployer`, cette étape rougit ici sur l'identifiant.
verifier_release_en_echec() {
  local api=$1 id_avant id_apres sortie
  id_avant=$(docker inspect -f '{{.Id}}' "$PROJET-api-1")
  sed -i.sain 's/^DB_PASSWORD=.*/DB_PASSWORD=faux-tck-522/' "$ENV_LOCAL"
  if sortie=$(deployer 2>&1); then
    echec "release en échec : le déploiement a RÉUSSI avec un DB_PASSWORD faux"
  fi
  grep -q 'SQLSTATE' <<<"$sortie" || { echo "$sortie"; echec "release en échec : release n'a pas échoué sur la base"; }
  id_apres=$(docker inspect -f '{{.Id}}' "$PROJET-api-1")
  [ "$id_apres" = "$id_avant" ] \
    || echec "release en échec : api a été RECRÉÉ (${id_avant:0:12} → ${id_apres:0:12}) malgré l'échec de release"
  [ "$(sonde -o /dev/null -w '%{http_code}' "$api/up")" = 200 ] || echec "release en échec : /up ne rend plus 200"
  grep -qix 'x-build-sha: smoke' <<<"$(sonde -D - -o /dev/null "$api/up" | tr -d '\r')" \
    || echec "release en échec : X-Build-Sha a changé"
  for s in worker worker-media scheduler; do
    [ "$(docker inspect -f '{{.State.Status}}' "$PROJET-$s-1")" = running ] \
      || echec "release en échec : $s ne tourne plus"
  done
  ok "release en échec : l'ancienne api sert toujours"

  mv "$ENV_LOCAL.sain" "$ENV_LOCAL"
  sortie=$(deployer 2>&1) || { echo "$sortie"; echec "la pile ne revient pas à l'état sain"; }
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$PROJET-release-1")" = 0 ] || echec "release échoue encore après remise en état"
  attendre_api_saine
  ok "remise en état : release repasse, api saine"
}

# ADR-0069 § 4 : le front joint l'API sous l'alias de SON environnement, et le Redis de la pile
# n'est joignable que de la pile. Chaque contrôle a son ablation (TCK-880) : l'alias retiré rougit
# le premier, `redis` posé aussi sur dokploy-network le deuxième, `REDIS_HOST` ôté du compose le
# troisième (le `.env` vise alors le Redis de développement).
verifier_reseaux() {
  local alias sortie cle
  alias=$(sed -n 's/^API_ALIAS=//p' "$ENV_LOCAL")
  [ "$(sonde -o /dev/null -w '%{http_code}' "http://$alias:8080/up")" = 200 ] \
    || echec "l'API ne répond pas sous son alias $alias sur dokploy-network"
  ok "l'API répond sous l'alias $alias"

  for hote in redis "$PROJET-redis-1"; do
    sortie=$(docker run --rm --network dokploy-network redis:8-alpine redis-cli -h "$hote" -p 6379 ping 2>&1 || true)
    grep -qE 'PONG|NOAUTH|WRONGPASS' <<<"$sortie" \
      && echec "le Redis de la pile répond sur dokploy-network sous « $hote » : $sortie"
  done
  ok "le Redis de la pile est injoignable depuis dokploy-network"

  cle="sonde-tck-870-$RANDOM"
  [ "$(tinker "Cache::put('$cle', 'ok', 60); echo Cache::get('$cle');" | tr -d '[:space:]')" = ok ] \
    || echec "le cache n'écrit pas"
  [ "$("${COMPOSE[@]}" exec -T redis redis-cli -n 1 --scan --pattern "*$cle" | grep -c .)" = 1 ] \
    || echec "la clé de cache n'est pas dans le Redis de la pile"
  ok "le cache écrit dans le Redis de la pile"
}

verifier_pile() {
  local api="http://$PROJET-api-1:8080" css n q
  prendre_verrou
  trap 'nettoyer_pile; rendre_verrou' EXIT
  preparer_pile

  # Pas de `--wait` : il exige une sonde sur CHAQUE service, et Compose ne tient pas
  # `HEALTHCHECK NONE` pour une sonde (« has no healthcheck configured »). Dokploy ne le passe pas
  # non plus. `up` attend quand même le SUCCÈS de release (depends_on) ; le reste se vérifie ici.
  local premier
  premier=$(deployer 2>&1) || { echo "$premier"; echec "la pile ne démarre pas"; }
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$PROJET-release-1")" = 0 ] \
    || { "${COMPOSE[@]}" logs release; echec "release a échoué"; }
  attendre_api_saine
  for s in worker worker-media scheduler; do
    [ "$(docker inspect -f '{{.State.Status}}' "$PROJET-$s-1")" = running ] \
      || { "${COMPOSE[@]}" logs "$s"; echec "$s ne tourne pas"; }
  done
  ok "la pile démarre, release d'abord"

  # La sortie se CAPTURE avant d'être cherchée, jamais `cmd | grep -q` : sous pipefail, grep -q sort
  # à la première correspondance, l'écrivain encore en cours prend SIGPIPE (141) et le pipeline
  # échoue — selon le minutage. Mesuré : deux passages sur quatre rougissaient ici à tort.
  grep -q 'Importation de App\\Models\\Property' <<<"$premier" \
    || echec "le premier release (\`run\`) n'a pas importé Property dans Meilisearch"
  # Le second release est celui qu'`up` rejoue, tout de suite après le premier.
  grep -q 'forme des index inchangée' <<<"$("${COMPOSE[@]}" logs release 2>&1)" \
    || echec "le second release (\`up\`) réimporte alors que la forme des index n'a pas changé"
  ok "release idempotent (importe au premier passage, pas au second)"

  [ "$(sonde -o /dev/null -w '%{http_code}' "$api/up")" = 200 ] || echec "/up ne rend pas 200"
  grep -qix 'x-build-sha: smoke' <<<"$(sonde -D - -o /dev/null "$api/up" | tr -d '\r')" || echec "X-Build-Sha absent ou faux"
  ok "/up à 200, X-Build-Sha: smoke"

  verifier_reseaux

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

  verifier_release_en_echec "$api"

  "${COMPOSE[@]}" --profile seed run --rm --pull never -e SEEDER_CLASS="${SEEDER_CLASS:-}" seed >/dev/null || echec "le seed échoue"
  ok "le seed tourne sur la cible seed"

  docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep "$PROJET"
}

case "${1:-}" in
  image) verifier_image ;;
  pile) verifier_pile ;;
  *) echo "usage : $0 image|pile" >&2; exit 2 ;;
esac
