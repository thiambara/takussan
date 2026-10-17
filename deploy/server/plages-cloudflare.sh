#!/usr/bin/env bash
# Plages Cloudflare — les listes recopiées à la main dans traefik.yml et dans TRUSTED_PROXIES
# comparées chaque jour à celles que Cloudflare publie, alertées sur Telegram au FRANCHISSEMENT
# (piste P37.05, décision du porteur du 2026-10-17).
#
# Traefik ne croit les X-Forwarded-* que des plages Cloudflare, et Laravel ne croit que Traefik et
# ces mêmes plages (ADR-0028 § 8). Les deux listes ont été relevées le 2026-09-14 et ne se
# vérifiaient qu'à la main. Une plage que Cloudflare ajoute et qui manque :
#   - à traefik.yml : Traefik efface l'en-tête de chaque visiteur servi par elle ;
#   - à TRUSTED_PROXIES : Laravel retient l'IP de la bordure Cloudflare au lieu de celle du client.
# Dans les deux cas, ces visiteurs partagent un seau de débit, et la liste d'IP des webhooks
# d'opérateurs les refuse en 403.
#
# Le script ALERTE, il n'écrit rien : corriger traefik.yml redémarre Traefik, et TRUSTED_PROXIES se
# change dans Dokploy. Une plage que Cloudflare a retirée et qui reste dans une liste ne se signale
# pas : elle ne casse rien de visible (et TRUSTED_PROXIES porte aussi le sous-réseau Docker).
#
# Une alerte par franchissement, comme seuils.sh : un marqueur par liste dans /run/seuils/, retiré
# avec un message de retour quand la liste redevient complète. Secrets Telegram lus dans
# /etc/default/seuils, les mêmes que seuils.sh ; sans eux, le script écrit dans le journal seulement.
#
# Installé par bootstrap.sh § 9 (unités plages-cloudflare.service et .timer, qui attendent
# /usr/local/sbin/plages-cloudflare) ; le script se copie là (runbook, hebergement.md).
#
# Usage :  plages-cloudflare            # un passage (ce que fait le timer)
#          plages-cloudflare --etat     # les comptes et les plages manquantes, sans alerte ni marqueur
#          SOURCE_CF=file:///tmp/faux plages-cloudflare --etat
#                                       # ablation : une source qui porte une plage de plus doit la
#                                       # nommer manquante (ips-v4 et ips-v6 lus sous ce préfixe)
set -uo pipefail

[ -f /etc/default/seuils ] && . /etc/default/seuils
SOURCE_CF=${SOURCE_CF:-https://www.cloudflare.com}
TRAEFIK_YML=${TRAEFIK_YML:-/etc/dokploy/traefik/traefik.yml}
MARQUEURS=${MARQUEURS:-/run/seuils}
HOTE=$(hostname -s)
CIDR='[0-9A-Fa-f:.]+/[0-9]{1,3}'

envoyer() {
  echo "$1"
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
  local franchi=$2 libelle=$3 marqueur="$MARQUEURS/plages-$1"
  if [ "$ETAT" = 1 ]; then echo "$libelle"; return; fi
  if [ "$franchi" = 1 ] && [ ! -e "$marqueur" ]; then
    envoyer "⚠ $HOTE — $libelle"; : > "$marqueur"
  elif [ "$franchi" = 0 ] && [ -e "$marqueur" ]; then
    envoyer "✓ $HOTE — retour à la normale : $libelle"; rm -f "$marqueur"
  fi
}

# La liste publiée. Une lecture qui échoue ou qui rend moins de dix plages n'est pas une liste : on
# le dit, et on ne compare rien (une liste vide ferait taire toutes les alertes).
publiees=$( { curl -fsS -m 20 "$SOURCE_CF/ips-v4"; echo; curl -fsS -m 20 "$SOURCE_CF/ips-v6"; echo; } 2>/dev/null \
  | grep -oE "^$CIDR$" | sort -u)
compte=$(grep -c . <<<"$publiees")
if [ "$compte" -lt 10 ]; then
  verifier source 1 "plages Cloudflare illisibles sur $SOURCE_CF ($compte plage(s) lue(s)) : rien n'est comparé"
  exit 1
fi
verifier source 0 "plages Cloudflare lisibles sur $SOURCE_CF"

# manquantes <liste> : les plages publiées absentes de la liste (égalité de chaîne, comme Traefik
# et Laravel les lisent : les deux listes sont des copies de la page de Cloudflare).
manquantes() { comm -23 <(echo "$publiees") <(grep -oE "$CIDR" <<<"$1" | sort -u) | paste -sd ' ' -; }
constat() { if [ -n "$1" ]; then echo "plages Cloudflare absentes : $1"; else echo "les $compte plages Cloudflare y sont"; fi; }

if [ -r "$TRAEFIK_YML" ]; then
  m=$(manquantes "$(cat "$TRAEFIK_YML")")
  verifier traefik "$([ -n "$m" ] && echo 1 || echo 0)" "traefik.yml : $(constat "$m")"
else
  verifier traefik 1 "traefik.yml illisible ($TRAEFIK_YML)"
fi

# TRUSTED_PROXIES se lit dans chaque conteneur `api` des piles Takussan (préproduction, production) :
# c'est la valeur que Laravel a reçue, pas celle qu'on croit avoir posée dans Dokploy.
conteneurs=$(echo ${CONTENEURS-$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^takussan-api-.+-api-1$')})
if [ -z "$conteneurs" ]; then
  verifier aucun-api 1 "aucun conteneur api Takussan trouvé : TRUSTED_PROXIES non comparée"
else
  verifier aucun-api 0 "conteneurs api Takussan : $conteneurs"
fi
for c in $conteneurs; do
  valeur=$(docker exec "$c" printenv TRUSTED_PROXIES 2>/dev/null | tr ',' '\n')
  m=$(manquantes "$valeur")
  verifier "proxies-$c" "$([ -n "$m" ] && echo 1 || echo 0)" "TRUSTED_PROXIES de $c : $(constat "$m")"
done
exit 0
