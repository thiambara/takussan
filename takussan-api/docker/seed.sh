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

# TCK-1159 (P89.03) — les tâches relues après l'importation comprennent celles du flush : un flush
# qui échoue laisse des documents de la base précédente sous des identifiants réattribués.
debut=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  for modele in $(modeles_indexes); do
    php artisan scout:flush "$modele" || echo "AVERTISSEMENT : scout:flush $modele a échoué." >&2
  done
fi

# SCOUT_DRIVER=null pendant le seed : sans lui, chaque ligne créée partirait vers Meilisearch une
# par une. On importe tout d'un bloc ensuite.
SCOUT_DRIVER=null php artisan db:seed --force ${SEEDER_CLASS:+--class="$SEEDER_CLASS"}

# TCK-1157 (P89.02) — `migrate:fresh` vient de vider `alert_rules`, qu'aucun seeder ne remplit :
# sans cette ligne, une alerte `ops_*` ne partirait nulle part jusqu'au déploiement suivant. La
# commande de release.sh, idempotente ; son échec n'arrête pas le reseed.
php artisan alerts:ensure-ops-rules \
  || echo "AVERTISSEMENT : alerts:ensure-ops-rules a échoué — les alertes d'exploitation sans règle ne partent nulle part jusqu'au prochain déploiement." >&2

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  # TCK-1159 (P89.03) — comme release.sh : le marqueur ne s'écrit qu'après les importations ET la
  # relecture de leurs tâches. Un `cp` sans condition le disait à jour sur un index partiel, que
  # le déploiement suivant ne réimportait jamais.
  importer_index "$debut" \
    || { echo "ERREUR : l'importation dans la recherche a échoué — base remplie, index incomplet ; le prochain déploiement réimportera tout." >&2; exit 1; }
fi
