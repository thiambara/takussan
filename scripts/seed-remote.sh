#!/usr/bin/env bash
#
# seed-remote.sh — depuis le POSTE : peupler un environnement déployé, en une commande.
#
# Usage :
#   scripts/seed-remote.sh <environnement> [--fresh] [--class=<FQCN>] [--oui]
#
#   <environnement>    `preview` (le seul déclaré — cf. le tableau plus bas)
#   --fresh            `migrate:fresh` avant le seed. ⚠ DÉTRUIT toutes les données.
#   --class=<FQCN>     un seul seeder, au lieu de `DatabaseSeeder`
#   --oui              saute la confirmation interactive (pour un appel non interactif)
#
# Exemple — repeupler la préproduction depuis zéro :
#   scripts/seed-remote.sh preview --fresh
#
# ─── Ce que ce script est, et ce qu'il n'est pas ─────────────────────────────────────────────
#
# Il ne fait AUCUN travail lui-même : il pose `seed-environnement.sh` sur le serveur et l'appelle.
# Tout le raisonnement — pourquoi une copie jetable, et pourquoi ni `composer install` dans
# `current/` ni Faker en dépendance de production — est dans l'en-tête de ce script-là, une seule
# fois. Ce fichier-ci ne porte que ce que le serveur ne peut pas savoir : quel hôte, quel
# répertoire, et le fait qu'un humain a confirmé.
#
# C'est la même répartition que `deploy.sh` / `deploy-preview.yml`, et pour la même raison : le
# script serveur reste appelable directement le jour où l'enveloppe ne marche pas.
#
# ─── Pourquoi pas un job GitHub, ni une commande artisan ─────────────────────────────────────
#
# TCK-353 laissait trois formes ouvertes. Écartées :
#
#   · Une commande `php artisan takussan:seed-environnement` aurait vécu dans le code de
#     PRODUCTION — un outil de peuplement en fausses données livré sur `api.takussan.com`, ce que
#     la deuxième contrainte du ticket refuse dans son esprit. Et elle aurait dû orchestrer `cp`
#     et `composer` depuis PHP, pour rien.
#   · Un job GitHub à déclenchement manuel restait possible, et le reste : il n'ajoute qu'un
#     `workflow_dispatch` par-dessus ce script. Il n'a pas été écrit parce qu'il porte un coût
#     propre — le seed complet dure ~30 min, au-delà du `command_timeout` par défaut de
#     `appleboy/ssh-action`, et un dépassement y ressemble à un échec du seed. À écrire le jour
#     où quelqu'un a besoin de seeder sans accès SSH, pas avant.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Le tableau des environnements ────────────────────────────────────────────
#
# La production N'Y EST PAS, et son absence est le garde-fou : `seed-environnement.sh` refuse
# `/var/www/takussan` de son côté, mais un tableau qui ne la nomme pas ne peut pas la viser par
# faute de frappe.
declare_environnement() {
    case "$1" in
        preview)
            HOTE="takussan"                       # alias ~/.ssh/config → deploy@178.18.247.62
            REPERTOIRE="/var/www/takussan-preview"
            ;;
        *)
            echo "Environnement inconnu : $1" >&2
            echo "Connus : preview" >&2
            exit 2
            ;;
    esac
}

# ─── Arguments ────────────────────────────────────────────────────────────────
ENVIRONNEMENT="${1:?Usage: seed-remote.sh <environnement> [--fresh] [--class=<FQCN>] [--oui]}"
shift

FRESH=0
CONFIRME=0
OPTIONS_DISTANTES=()
for arg in "$@"; do
    case "${arg}" in
        --fresh)
            FRESH=1
            OPTIONS_DISTANTES+=("--fresh")
            ;;
        --class=*)
            OPTIONS_DISTANTES+=("${arg}")
            ;;
        --oui)
            CONFIRME=1
            ;;
        *)
            echo "Argument inconnu : ${arg}" >&2
            exit 2
            ;;
    esac
done

declare_environnement "${ENVIRONNEMENT}"

# ─── Confirmation ─────────────────────────────────────────────────────────────
#
# Seul `--fresh` la demande : lui seul détruit. Un `db:seed` par-dessus des données existantes
# est réversible par un `--fresh` ; l'inverse n'est pas vrai.
if [ "${FRESH}" -eq 1 ] && [ "${CONFIRME}" -eq 0 ]; then
    echo
    echo "⚠  --fresh DÉTRUIT toutes les données de ${ENVIRONNEMENT} (${REPERTOIRE})."
    echo "   Taper le nom de l'environnement pour confirmer, n'importe quoi d'autre pour annuler."
    printf "   > "
    read -r reponse
    if [ "${reponse}" != "${ENVIRONNEMENT}" ]; then
        echo "Annulé."
        exit 1
    fi
fi

# ─── Pose et exécution ────────────────────────────────────────────────────────
#
# UNE connexion TCP, ouverte d'abord, réutilisée par le `scp` ET par le `ssh`.
#
# Ce qui est MESURÉ, le 2026-08-24 : la version qui ouvrait deux connexions coup sur coup a
# échoué quatre fois sur sept, toujours au même endroit — `ssh: connect to host … Operation
# timed out` après 77 s, sur la SECONDE connexion, alors que le `scp` qui la précédait d'une
# seconde venait de passer. Rejoué à la main, tout passait.
#
# Ce qui n'est PAS établi : la cause. Le premier jet de ce commentaire accusait un `ufw limit` ou
# fail2ban ; les deux ont été vérifiés sur le serveur et **aucun des deux n'existe** —
# `ufw status verbose` rend `22/tcp ALLOW IN Anywhere` (pas `LIMIT`), et `fail2ban` est
# `inactive`. *Une explication plausible écrite dans un commentaire devient une explication
# admise :* elle est retirée plutôt que corrigée, et ce qui reste est le relevé.
#
# La parade ne dépend donc pas de la cause, et c'est voulu : on ouvre UNE connexion maîtresse,
# en la réessayant tant que rien n'a encore été exécuté — un `ssh -N` ne lance aucune commande,
# le réessai est donc sans effet de bord. `scp` et `ssh` s'y branchent ensuite par le socket et
# n'ouvrent plus jamais de connexion neuve. *Réessayer une connexion est sûr ; réessayer une
# commande de peuplement ne l'est pas — c'est cette frontière-là que le multiplexage déplace.*
#
# `ServerAliveInterval` répond à un autre besoin : le seed complet dure ~30 min (mesuré :
# 30 min 42 s le 2026-08-24, médias compris) et la plupart des routeurs coupent une session SSH
# muette bien avant. Sans ces deux options, la coupure ressemble à un échec du seed — alors que le
# serveur, lui, continue.
SOCKET="${TMPDIR:-/tmp}/takussan-seed-$$.sock"
SSH_COMMUNES=(
    -o ControlMaster=auto
    -o "ControlPath=${SOCKET}"
    -o ControlPersist=120
    -o ServerAliveInterval=30
    -o ServerAliveCountMax=20
)
fermer_connexion() {
    ssh -o "ControlPath=${SOCKET}" -O exit "${HOTE}" >/dev/null 2>&1 || true
}
trap fermer_connexion EXIT

echo "→ Ouverture de la connexion vers ${HOTE}..."
for essai in 1 2 3 4 5; do
    if ssh "${SSH_COMMUNES[@]}" -o ConnectTimeout=15 -N -f "${HOTE}" 2>/dev/null; then
        break
    fi
    if [ "${essai}" -eq 5 ]; then
        echo "Impossible d'ouvrir une connexion SSH vers ${HOTE} après 5 essais." >&2
        exit 1
    fi
    echo "   essai ${essai}/5 sans réponse — on recommence."
done

echo "→ Pose de seed-environnement.sh sur ${HOTE}..."
scp -q "${SSH_COMMUNES[@]}" "${SCRIPT_DIR}/seed-environnement.sh" \
    "${HOTE}:${REPERTOIRE}/seed-environnement.sh"

# La commande distante est ré-échappée par `printf %q`, et ce n'est pas de la prudence
# décorative : `ssh` remet ses arguments à plat et le shell DISTANT les redécoupe. Un
# `--class=Database\Seeders\System\TagSeeder` transmis tel quel arrive en
# `--class=DatabaseSeedersSystemTagSeeder` — les antislashs de l'espace de noms PHP sont mangés
# par le second shell, et le seeder est « introuvable » sous un nom que personne n'a écrit.
ARGS_DISTANTS=(bash "${REPERTOIRE}/seed-environnement.sh" "${REPERTOIRE}")
if [ ${#OPTIONS_DISTANTES[@]} -gt 0 ]; then
    ARGS_DISTANTS+=("${OPTIONS_DISTANTES[@]}")
fi
COMMANDE_DISTANTE=$(printf '%q ' "${ARGS_DISTANTS[@]}")

echo "→ Peuplement de ${ENVIRONNEMENT} (${REPERTOIRE})..."
ssh "${SSH_COMMUNES[@]}" "${HOTE}" "${COMMANDE_DISTANTE}"

echo "✓ Terminé."
