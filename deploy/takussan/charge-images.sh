#!/usr/bin/env bash
# Charge d'images sur un front (TCK-520) : CLIENTS clients simultanés, chaque photo une fois,
# largeur W, `Accept: image/avif` — ce que l'optimiseur de Next encode de plus cher. Sert à mesurer
# le PIC mémoire d'un front (docker stats côté serveur) avant de poser son plafond : le repos ne
# dit rien (57 Mo deux minutes après un déploiement, 308 Mo dix heures plus tard, 327 Mo sous
# cette charge — plan d'ADR-0028, § Budget).
#
# Usage :
#   curl -s 'https://preview.api.takussan.com/api/public/properties?per_page=60' \
#     | jq -r '.data[].main_photo_url' | sort -u | head -50 > /tmp/photos.txt
#   PREVIEW_BASIC_AUTH=utilisateur:motdepasse SITE=https://preview.takussan.com \
#     PHOTOS=/tmp/photos.txt CLIENTS=8 W=1920 deploy/takussan/charge-images.sh
#
# Sortie : une ligne par photo — code HTTP, type, durée. JAMAIS l'URL effective : elle porterait
# les identifiants (`%{url_effective}` avec `-u`).
set -uo pipefail
SITE=${SITE:?SITE manquant}
PHOTOS=${PHOTOS:?PHOTOS manquant (un fichier, une URL d'image par ligne)}
CLIENTS=${CLIENTS:-4}
W=${W:-640}
AUTH=${PREVIEW_BASIC_AUTH:-}
export SITE W AUTH

une() {
  local enc
  enc=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1")
  curl -4 -sS -m 60 -o /dev/null ${AUTH:+-u "$AUTH"} -H 'Accept: image/avif,image/webp,*/*' \
    -w '%{http_code} %{content_type} %{time_total}\n' "$SITE/_next/image?url=$enc&w=$W&q=75"
}
export -f une
xargs -P "$CLIENTS" -I{} bash -c 'une "$1"' _ {} < "$PHOTOS"
