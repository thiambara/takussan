#!/usr/bin/env bash
# WAL-G sur le serveur (ADR-0069 § 5, TCK-930) : la sauvegarde de base de chaque semaine,
# l'élagage, et la veille de l'archivage continu.
#
# L'archivage des journaux, lui, ne passe pas par ce script : PostgreSQL appelle `wal-g wal-push`
# à chaque segment (`deploy/postgres/Dockerfile`), avec la configuration de WAL-G posée dans
# l'environnement du service Database de Dokploy (WALG_S3_PREFIX, AWS_*). Ce script s'exécute DANS
# le conteneur de la base (`docker exec`), qui porte déjà cet environnement : il ne lit aucun secret
# R2 sur l'hôte. Telegram : /etc/default/seuils, comme seuils.sh.
#
#   wal-g.sh base     # sauvegarde de base, puis élagage au-delà de JOURS (14) — le timer du dimanche
#   wal-g.sh veille   # alerte au FRANCHISSEMENT, retour à la normale, silence sinon — toutes les 15 min
#   wal-g.sh etat     # l'archivage et les sauvegardes de base, sans alerte
#
# La veille alerte si :
#   - l'archivage échoue : `pg_stat_archiver.last_failed_time` est postérieur au dernier succès.
#     PostgreSQL garde alors ses segments et réessaie : rien n'est perdu, mais le disque se remplit ;
#   - la dernière sauvegarde de base a plus de BASE_MAX_J jours (8 : la hebdomadaire et un jour de
#     marge), ou il n'y en a aucune ;
#   - la base ou WAL-G ne répondent pas.
# Une base inactive ne produit aucun segment : l'âge du dernier segment archivé ne dit rien, et n'est
# donc PAS un critère.
#
# Ablation (timer arrêté) : BASE_MAX_J=0 wal-g.sh veille → une alerte, rejouée se tait ; sans
# BASE_MAX_J → un retour à la normale. ENVOI=0 : les messages s'impriment sans partir.
#
# Le seau `takussan-wal` porte un verrou de rétention de 7 jours : l'élagage ne supprime que ce qui
# a plus de JOURS jours, et JOURS ne descend pas sous 8 (une suppression refusée ferait échouer
# `delete` à chaque semaine).
set -uo pipefail

[ -f /etc/default/seuils ] && . /etc/default/seuils
NOM=${NOM:-serveur-postgres-egr6ii}
JOURS=${JOURS:-14}
BASE_MAX_J=${BASE_MAX_J:-8}
MARQUEURS=${MARQUEURS:-/run/seuils}
HOTE=$(hostname -s)

[ "$JOURS" -ge 8 ] || { echo "✗ JOURS=$JOURS : le verrou de rétention du seau (7 jours) refuserait l'élagage" >&2; exit 2; }

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

# Le conteneur de la tâche Swarm du service Database (son nom porte un suffixe de tâche).
conteneur=$(docker ps -q --filter "name=^${NOM}\." | head -1)

# dans <commande…> : exécutée dans la base, en utilisateur postgres, avec le rôle de Dokploy.
dans() {
  docker exec -u postgres -e PGHOST=/var/run/postgresql "$conteneur" \
    sh -c 'PGUSER="$POSTGRES_USER" PGDATABASE=postgres exec "$@"' sh "$@"
}

case "${1:-}" in
base)
  [ -n "$conteneur" ] || { envoyer "✗ $HOTE — sauvegarde WAL-G : aucun conteneur $NOM"; exit 1; }
  debut=$(date +%s)
  if ! sortie=$(dans sh -c 'wal-g backup-push "$PGDATA"' 2>&1); then
    envoyer "✗ $HOTE — la sauvegarde de base WAL-G a échoué : $(tail -1 <<<"$sortie" | cut -c1-300)"
    exit 1
  fi
  echo "sauvegarde de base faite en $(( $(date +%s) - debut )) s"
  avant=$(date -u -d "-${JOURS} days" +%Y-%m-%dT%H:%M:%SZ)
  if ! sortie=$(dans wal-g delete before FIND_FULL "$avant" --confirm 2>&1); then
    envoyer "✗ $HOTE — l'élagage WAL-G (avant $avant) a échoué : $(tail -1 <<<"$sortie" | cut -c1-300)"
    exit 1
  fi
  echo "élagage avant $avant : fait"
  ;;
veille|etat)
  ETAT=0; [ "$1" = etat ] && ETAT=1
  mkdir -p "$MARQUEURS"
  # verifier <nom> <franchi 0|1> <libellé>
  verifier() {
    local franchi=$2 libelle=$3 marqueur="$MARQUEURS/wal-g-$1"
    if [ "$ETAT" = 1 ]; then echo "$libelle"; return; fi
    if [ "$franchi" = 1 ] && [ ! -e "$marqueur" ]; then
      envoyer "⚠ $HOTE — $libelle"; : > "$marqueur"
    elif [ "$franchi" = 0 ] && [ -e "$marqueur" ]; then
      envoyer "✓ $HOTE — retour à la normale : $libelle"; rm -f "$marqueur"
    fi
  }
  if [ -z "$conteneur" ]; then
    verifier archivage 1 "WAL-G : aucun conteneur $NOM"
    exit 0
  fi

  # « dernier succès;dernier échec;segments archivés;échecs;dernier segment », en secondes Unix.
  stats=$(dans psql -Atc "select coalesce(extract(epoch from last_archived_time)::bigint, 0) || ';' ||
    coalesce(extract(epoch from last_failed_time)::bigint, 0) || ';' || archived_count || ';' ||
    failed_count || ';' || coalesce(last_archived_wal, '—') from pg_stat_archiver" 2>/dev/null)
  if [ -z "$stats" ]; then
    verifier archivage 1 "WAL-G : pg_stat_archiver illisible dans $NOM"
  else
    IFS=';' read -r succes echec archives echecs dernier <<<"$stats"
    constat="archivage : $archives segments, $echecs échecs depuis le démarrage, dernier $dernier"
    if [ "$echec" -gt "$succes" ]; then
      verifier archivage 1 "$constat — l'archivage ÉCHOUE depuis $(date -u -d "@$echec" '+%F %T') UTC (journaux de la base : docker service logs $NOM)"
    else
      verifier archivage 0 "$constat"
    fi
  fi

  # La plus récente sauvegarde de base, par son horodatage de fin.
  liste=$(dans wal-g backup-list --json 2>/dev/null)
  derniere=$(grep -oE '"time":"[^"]+"' <<<"$liste" | cut -d'"' -f4 | sort | tail -1)
  if [ -z "$derniere" ]; then
    verifier base 1 "WAL-G : aucune sauvegarde de base lisible dans le seau"
  else
    age_j=$(( ($(date -u +%s) - $(date -u -d "$derniere" +%s)) / 86400 ))
    nombre=$(grep -oE '"backup_name"' <<<"$liste" | wc -l)
    constat="dernière sauvegarde de base WAL-G : $derniere (${age_j} j), $nombre gardée(s)"
    if [ "$age_j" -ge "$BASE_MAX_J" ]; then
      verifier base 1 "$constat — $BASE_MAX_J jours ou plus"
    else
      verifier base 0 "$constat"
    fi
  fi
  ;;
*) echo "usage : $0 base|veille|etat" >&2; exit 2 ;;
esac
exit 0
