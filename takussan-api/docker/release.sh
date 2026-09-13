#!/bin/sh
# Service `release` de compose.api.yml : joué UNE fois par déploiement, AVANT api, worker,
# worker-media et scheduler, qui attendent son succès (ADR-0028 §5). Reprend deploy.sh.
set -eu
APP_ROOT=${APP_ROOT:-/app}   # déplacé seulement par scripts/test-release-reindex.sh
# shellcheck source=takussan-api/docker/lib.sh
. "$APP_ROOT/docker/lib.sh"

php artisan migrate --force

# deploy.sh tolérait cet échec, on le tolère aussi : les rôles système rattrapent le catalogue
# au déploiement suivant.
php artisan membership:reconcile-system-roles \
  || echo "AVERTISSEMENT : membership:reconcile-system-roles a échoué — les rôles système retardent sur le catalogue jusqu'au prochain déploiement." >&2

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  php artisan scout:sync-index-settings \
    || echo "AVERTISSEMENT : scout:sync-index-settings a échoué — filtres et tris de recherche périmés jusqu'au prochain déploiement." >&2

  # deploy.sh comparait fichier par fichier avec la release précédente, présente sur le disque.
  # Un conteneur n'en a pas : on compare l'empreinte de la « forme » des index, calculée au build,
  # à celle de la dernière importation RÉUSSIE, gardée dans le volume. Un écart réimporte TOUS
  # les modèles indexés (ADR-0028, « ce que ça coûte »).
  marqueur="$APP_ROOT/storage/app/private/.search-shape-importee"
  forme=$(cat "$APP_ROOT/.search-shape")
  if [ "$(cat "$marqueur" 2>/dev/null || true)" = "$forme" ]; then
    echo "Recherche : forme des index inchangée — pas d'importation."
  else
    reussi=1
    for modele in $(modeles_indexes); do
      echo "Importation de $modele (synchrone, avec le code de CETTE image)…"
      # SCOUT_QUEUE=false : sinon l'import ne ferait que POUSSER des jobs, exécutés ensuite par
      # l'ANCIEN worker, avec l'ancien toSearchableArray() (revue de la PR 253). La configuration
      # n'est pas en cache ici : la variable de processus l'emporte.
      SCOUT_QUEUE=false php artisan scout:import "$modele" \
        || { echo "AVERTISSEMENT : scout:import $modele a échoué." >&2; reussi=0; }
    done
    # Le marqueur ne s'écrit qu'après TOUTES les importations : un échec rejoue tout au
    # déploiement suivant, au lieu de se croire à jour.
    if [ "$reussi" = 1 ]; then echo "$forme" > "$marqueur"; fi
  fi
fi
