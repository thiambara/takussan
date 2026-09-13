#!/bin/sh
# Point d'entrée d'api, worker, worker-media et scheduler (ADR-0028 §3).
#
# La configuration se met en cache AU DÉMARRAGE, jamais au build : elle vient de l'environnement
# du conteneur, que l'image ne connaît pas. Un `config:cache` au build figerait des valeurs vides
# dans une image qui sert deux environnements.
#
# `release` et `seed` ne passent PAS par ici (compose.api.yml leur donne leur entrypoint) : une
# configuration en cache ignorerait le `SCOUT_QUEUE=false` que leurs importations exigent.
set -eu
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
exec "$@"
