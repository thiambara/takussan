#!/bin/sh
# Service `release` de compose.api.yml : joué UNE fois par déploiement, AVANT api, worker,
# worker-long, worker-ia, worker-media et scheduler, qui attendent son succès (ADR-0028 §5).
# Reprend deploy.sh.
set -eu
APP_ROOT=${APP_ROOT:-/app}   # déplacé seulement par scripts/test-release-reindex.sh
# shellcheck source=takussan-api/docker/lib.sh
. "$APP_ROOT/docker/lib.sh"

php artisan migrate --force

# deploy.sh tolérait cet échec, on le tolère aussi : les rôles système rattrapent le catalogue
# au déploiement suivant.
php artisan membership:reconcile-system-roles \
  || echo "AVERTISSEMENT : membership:reconcile-system-roles a échoué — les rôles système retardent sur le catalogue jusqu'au prochain déploiement." >&2

# TCK-633 — les référentiels versionnés (ADR-0062 §3 et §7). La production ne lance AUCUN
# seeder : sans ces lignes, la liste des quartiers et celle des équipements resteraient vides.
# Idempotentes ; SCOUT_QUEUE=false pour que la réindexation des biens rattachés se fasse avec le
# code de CETTE image, pas avec l'ancien worker. Un échec n'arrête pas le déploiement.
# TCK-1155 (P89.01) : chaque région se valide avec sa réindexation, le rattachement aussi. Un
# échec garde les régions déjà validées, et annule le reste, que le déploiement suivant rejoue.
SCOUT_QUEUE=false php artisan geo:sync-referential \
  || echo "AVERTISSEMENT : geo:sync-referential a échoué — les régions déjà validées sont chargées et indexées ; le reste du référentiel géographique sera rejoué au prochain déploiement." >&2
# TCK-1161 (P89.04) — SCOUT_QUEUE=false pour la même raison : approuver une proposition réindexe
# ses biens (`TagCatalog::assurer()`).
SCOUT_QUEUE=false php artisan tags:sync-catalog \
  || echo "AVERTISSEMENT : tags:sync-catalog a échoué — catalogue des équipements inchangé jusqu'au prochain déploiement." >&2

# TCK-768 (P14.03) — sans règle, une alerte `ops_*` ne part nulle part. Crée celles qui manquent,
# destinées aux super-admins ; une règle existante n'est jamais réécrite. Idempotente.
php artisan alerts:ensure-ops-rules \
  || echo "AVERTISSEMENT : alerts:ensure-ops-rules a échoué — les alertes d'exploitation sans règle ne partent nulle part." >&2

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  # TCK-710 (P01.07) : un échec ARRÊTE le déploiement, et les services ne démarrent pas. Des
  # réglages périmés ne dégradent pas la recherche, ils la cassent : un attribut triable absent
  # (`ranked_at`) fait échouer la liste publique sans mot en `invalid_search_sort`.
  # TCK-995 (P52.01) : la commande du dépôt, pas celle de Scout, qui sort en 0 sur tout refus et
  # ne déclenchait donc jamais cet arrêt. Elle attend aussi la tâche de chaque index et relit les
  # réglages appliqués (P52.02), et remet à son défaut un réglage retiré de la configuration (P52.04).
  php artisan search:sync-index-settings \
    || { echo "ERREUR : search:sync-index-settings a échoué — déploiement arrêté : des filtres et tris de recherche périmés feraient échouer la recherche publique." >&2; exit 1; }

  # deploy.sh comparait fichier par fichier avec la release précédente, présente sur le disque.
  # Un conteneur n'en a pas : on compare l'empreinte de la « forme » des index, calculée au build,
  # à celle de la dernière importation RÉUSSIE, gardée dans le volume. Un écart réimporte TOUS
  # les modèles indexés (ADR-0028, « ce que ça coûte »).
  marqueur="$APP_ROOT/storage/app/private/.search-shape-importee"
  forme=$(cat "$APP_ROOT/.search-shape")
  importer=1
  if [ "$(cat "$marqueur" 2>/dev/null || true)" = "$forme" ]; then
    # TCK-995 (P52.03) : le marqueur vit dans le volume `storage`, les index dans le volume `meili`
    # du serveur. Un Meilisearch perdu ou recréé laissait le marqueur dire « à jour », et la
    # recherche rendait zéro résultat, sans erreur.
    if php artisan search:verify-indexes --documents; then
      echo "Recherche : forme des index inchangée et index peuplés — pas d'importation."
      importer=0
    else
      echo "Recherche : forme inchangée, mais un index est vide face à sa table — réimportation." >&2
    fi
  fi
  if [ "$importer" = 1 ]; then
    # Importer, relire les tâches, et n'écrire le marqueur qu'après TOUT : un échec rejoue tout au
    # déploiement suivant, au lieu de se croire à jour. Le bloc vit dans lib.sh, partagé avec
    # seed.sh (TCK-1159, P89.03). Un échec n'arrête pas le déploiement.
    importer_index "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || true
  fi
fi
