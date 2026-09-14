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
