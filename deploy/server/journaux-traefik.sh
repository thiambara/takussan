#!/usr/bin/env bash
# Journal d'ACCÈS de Traefik — une ligne JSON par requête, sur stdout du conteneur (TCK-518).
#
# Le relevé du 2026-09-14 mesurait AUCUN journal d'accès : `traefik.yml` posé par l'installation
# de Dokploy n'a pas d'`accessLog`, et les conteneurs `api` n'écrivent rien par requête. Une
# requête passée ne se retrouvait donc pas après coup — deux délais dépassés vus depuis un poste
# ce jour-là n'ont laissé aucune trace côté serveur.
#
# Idempotent : n'ajoute le bloc que s'il manque, ne redémarre Traefik que s'il l'a ajouté.
# Le fichier vit HORS dépôt (/etc/dokploy/traefik/traefik.yml, réécrit par Dokploy à
# l'installation) : ce script se rejoue après toute réinstallation (runbook, hébergement.md).
#
# Ce qui est journalisé, et ce qui ne l'est PAS :
#   · tous les champs de base (adresse cliente, hôte, méthode, chemin, statut, durée, routeur) ;
#   · UN SEUL en-tête de requête, User-Agent : `headers.defaultMode: drop` écarte tout le reste,
#     dont Authorization (authentification basique des préproductions) et Cookie.
#   · la sortie est stdout : bornée par la rotation de /etc/docker/daemon.json (10m × 3).
#
# Usage, en root sur le serveur :  bash journaux-traefik.sh
set -euo pipefail

FICHIER=/etc/dokploy/traefik/traefik.yml
[ "$(id -u)" -eq 0 ] || { echo "✗ à lancer en root" >&2; exit 1; }
[ -f "$FICHIER" ] || { echo "✗ $FICHIER introuvable : Dokploy est-il installé ?" >&2; exit 1; }

if grep -q '^accessLog:' "$FICHIER"; then
  echo "✓ accessLog déjà présent dans $FICHIER — rien à faire"
else
  cat >> "$FICHIER" <<'YAML'
# Journal d'accès (TCK-518) — posé par deploy/server/journaux-traefik.sh du dépôt takussan.
accessLog:
  format: json
  bufferingSize: 100
  fields:
    defaultMode: keep
    headers:
      defaultMode: drop
      names:
        User-Agent: keep
YAML
  echo "✓ bloc accessLog ajouté à $FICHIER"
  # La configuration STATIQUE ne se recharge pas à chaud : quelques secondes sans routage.
  docker restart dokploy-traefik >/dev/null
  echo "✓ dokploy-traefik redémarré"
fi

# Preuve : une requête sonde, puis sa ligne dans le journal.
for _ in $(seq 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: localhost' http://127.0.0.1/ || true)
  [ "$code" != 000 ] && break
  sleep 1
done
sonde="tck518-$(date +%s)"
curl -s -o /dev/null -H 'Host: localhost' "http://127.0.0.1/?sonde=$sonde" || true
sleep 2
if grep -q "$sonde" <<<"$(docker logs --since 1m dokploy-traefik 2>&1)"; then
  echo "✓ la requête sonde est journalisée (JSON, stdout de dokploy-traefik)"
else
  echo "✗ la requête sonde n'apparaît pas dans docker logs dokploy-traefik" >&2; exit 1
fi
