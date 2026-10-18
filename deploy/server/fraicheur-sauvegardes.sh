#!/usr/bin/env bash
# Fraîcheur des sauvegardes de base — la dernière sauvegarde de chaque base, relue dans R2, alertée
# sur Telegram au FRANCHISSEMENT (piste P42.04, TCK-884, décision du porteur du 2026-10-18).
#
# Dokploy notifie l'ÉCHEC d'une sauvegarde, jamais son ABSENCE : une planification retirée, un
# Dokploy arrêté ou une destination cassée sans erreur ne produisent aucun message. Et l'envoi
# Telegram de Dokploy ne lit pas sa réponse (hebergement.md, relevé). Ce script regarde le seul
# endroit qui compte : l'objet le plus récent sous le préfixe de chaque base dans `vps-sauvegardes`.
#
# Alerte si la dernière sauvegarde :
#   - a plus de AGE_MAX_H heures (26 : la nocturne de 03:00, plus deux heures de marge) ;
#   - pèse moins de TAILLE_MIN_O octets ;
#   - pèse moins de la moitié de la précédente (un dump tronqué reste un objet frais) ;
#   - ou si le préfixe est vide ou illisible.
# Une alerte par franchissement, un message de retour, silence sinon : un marqueur par base dans
# /run/seuils/, comme seuils.sh et plages-cloudflare.sh.
#
# Lecture seule, avec le jeton des sauvegardes (`takussan-preview-backup`) : ses secrets sont ceux de
# /etc/default/sauvegarde-seau-prive ; Telegram, ceux de /etc/default/seuils.
#
# Installé par bootstrap.sh § 10 (unités fraicheur-sauvegardes.service et .timer, qui attendent
# /usr/local/sbin/fraicheur-sauvegardes) ; le script se copie là (runbook, hebergement.md).
#
# Usage :  fraicheur-sauvegardes            # un passage (ce que fait le timer)
#          fraicheur-sauvegardes --etat     # l'âge et la taille de chaque dernière sauvegarde, sans alerte
#          AGE_MAX_H=1 fraicheur-sauvegardes
#                                           # ablation, timer arrêté : alerte une fois, rejouée se tait ;
#                                           # puis sans AGE_MAX_H : un retour à la normale, rejoué se tait.
#                                           # ENVOI=0 : les messages s'impriment sans partir sur Telegram
#          PREFIXES=serveur-postgres-egr6ii/postgres/inexistante fraicheur-sauvegardes --etat
#                                           # un préfixe vide se dit illisible
set -uo pipefail

[ -f /etc/default/seuils ] && . /etc/default/seuils
[ -f /etc/default/sauvegarde-seau-prive ] && . /etc/default/sauvegarde-seau-prive
SEAU=${SEAU:-vps-sauvegardes}
# Le préfixe RÉEL : Dokploy fait précéder le préfixe déclaré du nom interne du service (relevé,
# « Clés des objets dans R2 »). Plusieurs bases : séparées par des espaces.
PREFIXES=${PREFIXES:-serveur-postgres-egr6ii/postgres/takussan_preview}
AGE_MAX_H=${AGE_MAX_H:-26}
TAILLE_MIN_O=${TAILLE_MIN_O:-1000000}
IMAGE=${IMAGE:-rclone/rclone:1.71}
MARQUEURS=${MARQUEURS:-/run/seuils}
HOTE=$(hostname -s)

for v in R2_ACCOUNT_ID R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || { echo "✗ $v absente de /etc/default/sauvegarde-seau-prive" >&2; exit 2; }
done

envoyer() {
  echo "$1"
  [ "${ENVOI:-1}" = 1 ] || return 0
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  # Même envoi que seuils.sh : Telegram répond 200 avec `"ok":false` sur un mauvais canal.
  local reponse
  reponse=$(curl -sS -m 15 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=$1" 2>&1)
  grep -q '"ok":true' <<<"$reponse" || echo "✗ envoi Telegram échoué : ${reponse:0:200}" >&2
}

mkdir -p "$MARQUEURS"
ETAT=0; [ "${1:-}" = --etat ] && ETAT=1

# verifier <nom> <franchi 0|1> <libellé>
verifier() {
  local franchi=$2 libelle=$3 marqueur="$MARQUEURS/sauvegarde-$1"
  if [ "$ETAT" = 1 ]; then echo "$libelle"; return; fi
  if [ "$franchi" = 1 ] && [ ! -e "$marqueur" ]; then
    envoyer "⚠ $HOTE — $libelle"; : > "$marqueur"
  elif [ "$franchi" = 0 ] && [ -e "$marqueur" ]; then
    envoyer "✓ $HOTE — retour à la normale : $libelle"; rm -f "$marqueur"
  fi
}

# lister <préfixe> : « AAAA-MM-JJ HH:MM:SS;taille;nom » par objet, triés du plus ancien au plus récent.
lister() {
  docker run --rm \
    -e RCLONE_CONFIG_R2_TYPE=s3 \
    -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    -e RCLONE_CONFIG_R2_REGION=auto \
    "$IMAGE" lsf --format tsp --separator ';' --files-only "r2:$SEAU/$1/" 2>/dev/null | grep -E '^[0-9]{4}-' | sort
}

maintenant=$(date -u +%s)
for prefixe in $PREFIXES; do
  nom=$(tr '/' '-' <<<"$prefixe")
  objets=$(lister "$prefixe")
  if [ -z "$objets" ]; then
    verifier "$nom" 1 "aucune sauvegarde lisible sous $SEAU/$prefixe/"
    continue
  fi
  derniere=$(tail -1 <<<"$objets")
  precedente=$(tail -2 <<<"$objets" | head -1)
  quand=${derniere%%;*}
  taille=$(cut -d';' -f2 <<<"$derniere")
  taille_prec=$(cut -d';' -f2 <<<"$precedente")
  age_h=$(( (maintenant - $(date -u -d "$quand" +%s)) / 3600 ))
  constat="dernière sauvegarde de $prefixe : $quand UTC (${age_h} h), $taille o"
  if [ "$age_h" -gt "$AGE_MAX_H" ]; then
    verifier "$nom" 1 "$constat — plus de $AGE_MAX_H h"
  elif [ "$taille" -lt "$TAILLE_MIN_O" ]; then
    verifier "$nom" 1 "$constat — moins de $TAILLE_MIN_O o"
  elif [ "$derniere" != "$precedente" ] && [ $((taille * 2)) -lt "$taille_prec" ]; then
    verifier "$nom" 1 "$constat — moins de la moitié de la précédente ($taille_prec o)"
  else
    verifier "$nom" 0 "$constat"
  fi
done
exit 0
