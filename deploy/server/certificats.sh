#!/usr/bin/env bash
# Échéance des certificats d'ORIGINE — ceux que Traefik obtient de Let's Encrypt sur le serveur.
#
# Lancé chaque jour par `.github/workflows/certificats.yml`, qui échoue (et GitHub l'envoie par
# courriel) dès qu'un certificat expire dans moins de SEUIL_JOURS jours, ne couvre plus son nom, ou
# ne se lit plus. Traefik renouvelle seul, environ 30 jours avant l'échéance : ce script ne sert
# qu'au jour où ce renouvellement a échoué en silence. La surveillance de disponibilité (plan, D8)
# ne le voit qu'à l'échéance — le jour où le site tombe, pas deux semaines avant.
#
# ⚠ Le certificat se lit SUR LE SERVEUR, par son adresse avec le nom en SNI, jamais par le nom seul :
# derrière le proxy de Cloudflare, `preview.takussan.com` rendrait le certificat de Cloudflare
# (renouvelé par Cloudflare), et celui d'origine pourrait expirer sans que rien ne change ici —
# jusqu'au 526 de Full (strict).
#
# Usage : deploy/server/certificats.sh [nom…]        sans argument : les noms servis, ci-dessous
#         SEUIL_JOURS=365 deploy/server/certificats.sh  doit ÉCHOUER — c'est l'ablation du seuil
# Exige OpenSSL (`x509 -checkhost`) : celui des exécuteurs Ubuntu de GitHub.
set -uo pipefail

ORIGINE=${ORIGINE:-178.18.247.62}
SEUIL_JOURS=${SEUIL_JOURS:-14}
# Les noms que Traefik sert sur ce serveur (relevé : docs/infra/hebergement.md, « Ce qui sert
# quoi »). `api.takussan.com` et `www.takussan.com` s'y ajoutent en F3, étape 3 (les noms de
# CheckPrint Plus en F4), DÈS QUE leur certificat existe et jamais avant : un nom que Traefik ne
# route pas rend `TRAEFIK DEFAULT CERT` — c'est le cas d'`api.takussan.com` depuis le 2026-09-13
# (TCK-523) — et rougirait ici chaque jour, pour rien.
NOMS=(
  deploy.takussan.com
  preview.takussan.com
  preview.api.takussan.com
  preview.checkprintplus.com
  preview.api.checkprintplus.com
)
[ $# -gt 0 ] && NOMS=("$@")

erreur() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$*"; else echo "✗ $*"; fi; }

# Le certificat présenté pour le nom $1, en PEM. Trois essais : un réseau qui hoquette ne doit pas
# envoyer une fausse alerte.
lire() {
  local essai pem
  for essai in 1 2 3; do
    pem=$(openssl s_client -connect "$ORIGINE:443" -servername "$1" </dev/null 2>/dev/null | openssl x509 2>/dev/null)
    if [ -n "$pem" ]; then printf '%s\n' "$pem"; return 0; fi
    [ "$essai" -lt 3 ] && sleep 5
  done
  return 1
}

# La date de fin d'OpenSSL, en jours restants. GNU date (CI), sinon BSD date (poste macOS).
jours_restants() {
  local s
  s=$(date -u -d "$1" +%s 2>/dev/null || date -u -j -f '%b %e %T %Y %Z' "$1" +%s 2>/dev/null) || { echo '?'; return; }
  echo $(( (s - $(date -u +%s)) / 86400 ))
}

echec=0
for nom in "${NOMS[@]}"; do
  if ! pem=$(lire "$nom"); then
    erreur "$nom : aucun certificat lu sur $ORIGINE:443"; echec=1; continue
  fi
  fin=$(openssl x509 -noout -enddate <<<"$pem" | cut -d= -f2)
  emetteur=$(openssl x509 -noout -issuer <<<"$pem" | sed 's/^issuer= *//')
  j=$(jours_restants "$fin")
  # « does NOT match » ne contient pas « does match » : le motif ne laisse rien passer par erreur.
  if ! openssl x509 -noout -checkhost "$nom" <<<"$pem" | grep -q 'does match'; then
    erreur "$nom : le certificat présenté ne couvre pas ce nom ($emetteur) — Traefik sert-il son certificat par défaut ?"; echec=1
  elif ! openssl x509 -noout -checkend $(( SEUIL_JOURS * 86400 )) <<<"$pem" >/dev/null; then
    erreur "$nom : expire dans $j jours ($fin), sous le seuil de $SEUIL_JOURS — le renouvellement de Traefik a échoué"; echec=1
  else
    echo "✓ $nom : $j jours ($fin), $emetteur"
  fi
done
exit $echec
