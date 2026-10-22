# shellcheck shell=sh
# Fonctions partagées par release.sh et seed.sh. Sourcé, jamais exécuté.
# APP_ROOT vaut /app dans l'image ; scripts/test-release-reindex.sh le déplace pour rejouer la
# décision de réindexation hors conteneur, en CI.

# Les modèles indexés : tout app/Models/*.php qui définit toSearchableArray() — la règle de
# deploy.sh. Une liste écrite à la main oublierait le prochain modèle Searchable.
modeles_indexes() {
  grep -rl 'toSearchableArray' "${APP_ROOT:-/app}/app/Models" | sort | while read -r f; do
    printf 'App\\Models\\%s\n' "$(basename "$f" .php)"
  done
}

# importer_index <depuis> — importe tous les modèles indexés, relit leurs tâches depuis <depuis>
# (horodatage ISO 8601), puis écrit le marqueur de la dernière importation RÉUSSIE. Rend 1 sans
# l'écrire au moindre échec : le déploiement suivant réimportera tout, au lieu de se croire à jour.
# TCK-1159 (P89.03) : partagée par release.sh et seed.sh, qui écrivait le marqueur sans condition.
importer_index() {
  reussi=1
  for modele in $(modeles_indexes); do
    echo "Importation de $modele (synchrone, avec le code de CETTE image)…"
    # SCOUT_QUEUE=false : sinon l'import ne ferait que POUSSER des jobs, exécutés ensuite par
    # l'ANCIEN worker, avec l'ancien toSearchableArray() (revue de la PR 253). La configuration
    # n'est pas en cache ici : la variable de processus l'emporte.
    SCOUT_QUEUE=false php artisan scout:import "$modele" \
      || { echo "AVERTISSEMENT : scout:import $modele a échoué." >&2; reussi=0; }
  done
  # TCK-995 (P52.02) : `scout:import` rend la main quand les documents sont MIS EN FILE. Un
  # document refusé ne se voit que dans sa tâche : on attend la file, et on la lit.
  php artisan search:verify-indexes --depuis="$1" \
    || { echo "AVERTISSEMENT : des tâches d'indexation ont échoué — le déploiement suivant réimportera." >&2; reussi=0; }
  # Le marqueur ne s'écrit qu'après TOUTES les importations, et leurs tâches.
  [ "$reussi" = 1 ] || return 1
  cat "${APP_ROOT:-/app}/.search-shape" > "${APP_ROOT:-/app}/storage/app/private/.search-shape-importee"
}
