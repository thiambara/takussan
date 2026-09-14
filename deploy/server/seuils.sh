#!/usr/bin/env bash
# Seuils du budget de la machine — mémoire disponible, disque, vol de CPU, mémoire de Dokploy —
# vérifiés toutes les cinq minutes, alertés sur Telegram au FRANCHISSEMENT (TCK-519).
#
# Le plan d'ADR-0028 (§ Budget) fixe trois seuils et dit « relevés en D6 puis surveillés » ; rien ne
# les surveillait : « Server Threshold » n'existe pas en Dokploy auto-hébergé, et UptimeRobot ne voit
# que le HTTP. Un disque plein met PostgreSQL en lecture seule pour quatre environnements à la fois.
#
# Une alerte par franchissement, pas une toutes les cinq minutes : un marqueur par seuil dans
# /run/seuils/ (tmpfs, effacé au redémarrage), retiré — avec un message de retour — quand la mesure
# repasse sous le seuil. Silence total quand tout tient.
#
# Secrets dans /etc/default/seuils (mode 600), jamais dans le dépôt : TELEGRAM_BOT_TOKEN,
# TELEGRAM_CHAT_ID — ceux du canal des notifications de Dokploy (un `@canal` ou un identifiant
# numérique). Sans ce fichier, le script mesure, écrit dans le journal, et n'envoie rien.
#
# Installé par bootstrap.sh (unités seuils.service et seuils.timer, qui attendent
# /usr/local/sbin/seuils) ; le script lui-même se copie là (runbook, hebergement.md).
#
# Usage :  seuils                         # un passage (ce que fait le timer)
#          SEUIL_MEM_MO=100000 seuils     # ablation : doit alerter, puis se taire au second passage
#          seuils --etat                  # les mesures, sans alerte ni marqueur
set -uo pipefail

[ -f /etc/default/seuils ] && . /etc/default/seuils
SEUIL_MEM_MO=${SEUIL_MEM_MO:-1500}         # plan : « ≥ 1 500 Mo disponibles »
SEUIL_DISQUE_PCT=${SEUIL_DISQUE_PCT:-75}   # plan : « < 75 % »
SEUIL_ST=${SEUIL_ST:-10}                   # plan : « st < 10 en moyenne »
SEUIL_DOKPLOY_MO=${SEUIL_DOKPLOY_MO:-1536} # Dokploy est le seul conteneur sans plafond (relevé)
MARQUEURS=${MARQUEURS:-/run/seuils}
HOTE=$(hostname -s)

mem_mo=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
disque_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
# vmstat : la première ligne est la moyenne depuis le démarrage, on la saute ; `st` est la dernière colonne.
st=$(vmstat 5 3 | tail -n 2 | awk '{s+=$NF} END{printf "%d", s/NR}')
dokploy_mo=$(docker stats --no-stream --format '{{.MemUsage}}' "$(docker ps -q -f name='^dokploy\.1' | head -1)" 2>/dev/null \
  | awk '{v=$1; if (v ~ /GiB/) printf "%d", v*1024; else printf "%d", v+0}')
dokploy_mo=${dokploy_mo:-0}

if [ "${1:-}" = --etat ]; then
  printf 'mémoire disponible %s Mo (seuil %s) · disque %s %% (seuil %s) · st %s (seuil %s) · dokploy %s Mo (seuil %s)\n' \
    "$mem_mo" "$SEUIL_MEM_MO" "$disque_pct" "$SEUIL_DISQUE_PCT" "$st" "$SEUIL_ST" "$dokploy_mo" "$SEUIL_DOKPLOY_MO"
  exit 0
fi

envoyer() {
  echo "$1"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  # --data-urlencode des deux côtés : un chat_id `@canal` et un texte avec des accents passent tels quels.
  # Telegram répond 200 avec `"ok":false` sur un mauvais canal : le code de sortie de curl ne suffit
  # pas, on lit la réponse. Capturée puis cherchée (pas `cmd | grep -q`, cf. bootstrap.sh).
  local reponse
  reponse=$(curl -sS -m 15 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=$1" 2>&1)
  grep -q '"ok":true' <<<"$reponse" || echo "✗ envoi Telegram échoué : ${reponse:0:200}" >&2
}

# verifier <nom> <franchi 0|1> <libellé de la mesure>
mkdir -p "$MARQUEURS"
verifier() {
  local nom=$1 franchi=$2 libelle=$3 marqueur="$MARQUEURS/$1"
  if [ "$franchi" = 1 ] && [ ! -e "$marqueur" ]; then
    envoyer "⚠ $HOTE — $libelle"; : > "$marqueur"
  elif [ "$franchi" = 0 ] && [ -e "$marqueur" ]; then
    envoyer "✓ $HOTE — retour à la normale : $libelle"; rm -f "$marqueur"
  fi
}

verifier memoire "$([ "$mem_mo" -lt "$SEUIL_MEM_MO" ] && echo 1 || echo 0)" \
  "mémoire disponible $mem_mo Mo (seuil $SEUIL_MEM_MO)"
verifier disque "$([ "$disque_pct" -ge "$SEUIL_DISQUE_PCT" ] && echo 1 || echo 0)" \
  "disque / à $disque_pct % (seuil $SEUIL_DISQUE_PCT)"
verifier st "$([ "$st" -ge "$SEUIL_ST" ] && echo 1 || echo 0)" \
  "vol de CPU par l'hyperviseur st=$st (seuil $SEUIL_ST)"
verifier dokploy "$([ "$dokploy_mo" -ge "$SEUIL_DOKPLOY_MO" ] && echo 1 || echo 0)" \
  "Dokploy à $dokploy_mo Mo, sans plafond (seuil $SEUIL_DOKPLOY_MO)"
