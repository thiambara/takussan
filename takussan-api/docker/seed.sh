#!/bin/sh
# Service `seed` (profil `seed`) de compose.api.yml : remet à zéro la base d'une PRÉPRODUCTION et
# la remplit. Tourne sur la cible `seed` du Dockerfile, qui porte Faker (TCK-353). Remplace
# scripts/seed-environnement.sh et scripts/seed-remote.sh.
set -eu
APP_ROOT=${APP_ROOT:-/app}
# shellcheck source=takussan-api/docker/lib.sh
. "$APP_ROOT/docker/lib.sh"

case "${DB_DATABASE:-}" in
  *_preview|*_smoke) ;;
  *) echo "✗ refus : DB_DATABASE='${DB_DATABASE:-}' n'est ni une préproduction (*_preview) ni une base de fumée (*_smoke)." >&2
     exit 1 ;;
esac

php artisan migrate:fresh --force

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  for modele in $(modeles_indexes); do
    php artisan scout:flush "$modele" || echo "AVERTISSEMENT : scout:flush $modele a échoué." >&2
  done
fi

# SCOUT_DRIVER=null pendant le seed : sans lui, chaque ligne créée partirait vers Meilisearch une
# par une. On importe tout d'un bloc ensuite.
SCOUT_DRIVER=null php artisan db:seed --force ${SEEDER_CLASS:+--class="$SEEDER_CLASS"}

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  for modele in $(modeles_indexes); do
    SCOUT_QUEUE=false php artisan scout:import "$modele"
  done
  cp "$APP_ROOT/.search-shape" "$APP_ROOT/storage/app/private/.search-shape-importee"
fi
