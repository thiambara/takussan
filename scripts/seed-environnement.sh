#!/usr/bin/env bash
#
# seed-environnement.sh — peupler un environnement DÉPLOYÉ sans que la release en service
#                         porte les dépendances de développement (TCK-353).
#
# Usage — SUR LE SERVEUR, sous l'utilisateur `deploy` :
#   seed-environnement.sh <app-dir> [--fresh] [--class=<FQCN>]
#
#   <app-dir>          racine de déploiement, p.ex. /var/www/takussan-preview
#   --fresh            `migrate:fresh` AVANT le seed. ⚠ DÉTRUIT toutes les données.
#   --class=<FQCN>     un seul seeder, au lieu de `DatabaseSeeder`
#
# Depuis le poste, ne pas appeler ce script à la main : `scripts/seed-remote.sh preview --fresh`
# le pose sur le serveur et l'appelle. C'est la commande documentée
# (docs/infra/premier-deploiement.md § « Peupler un environnement déployé »).
#
# ─── Pourquoi une copie jetable, et pas quelque chose de plus simple ─────────────────────────
#
# Trois décisions justes, qui ne se contredisent nulle part dans le code, produisent ensemble
# une capacité absente :
#
#   1. `deploy.sh` installe en `--no-dev` — c'est juste pour un déploiement ;
#   2. `fakerphp/faker` est une dépendance de DÉV — c'est juste aussi ;
#   3. les 48 fichiers de seeders passent tous par `Database\Seeders\Support\SeedingContext`,
#      qui instancie `Faker\Factory`.
#
# ⇒ `php artisan db:seed` est structurellement impossible sur toute release produite par cette
#   chaîne, sur tous les environnements, depuis toujours. Mesuré le 2026-08-24 en peuplant la
#   préproduction juste après la bascule PostgreSQL :
#
#       Database\Seeders\YearOfActivitySeeder ....... RUNNING
#       In SeedingContext.php line 96:
#         Class "Faker\Factory" not found
#
# *Le défaut ne vit dans aucun fichier, il vit entre trois* — et c'est pourquoi aucune garde ne
# pouvait l'attraper, et pourquoi il a fallu qu'on veuille seeder pour le voir.
#
# Les deux sorties fausses, refusées par TCK-353 :
#
#   ✗ `composer install` sans `--no-dev` dans `current/` — cela change ce qui est déployé pour
#     obtenir ce qui ne l'est pas, et un plantage en cours laisse la release en service avec ses
#     dépendances de dév, sans que rien ne le dise ;
#   ✗ déplacer `fakerphp/faker` en dépendance de production — le poids n'est pas le problème :
#     c'est qu'une bibliothèque de génération de fausses données devient chargeable sur
#     `api.takussan.com`.
#
# La sortie retenue : une COPIE de la release en service (`cp -a`, qui préserve les liens
# symboliques `.env` et `storage` vers `shared/` au lieu de les suivre), `composer install` AVEC
# les dépendances de dév dans la copie, le seed depuis la copie, puis suppression. On seede donc
# avec EXACTEMENT le code qui est en service, ce qu'un nouveau clone ne garantirait pas.
#
# Et la release en service n'est jamais touchée : ce script le VÉRIFIE, avant et après, plutôt
# que de l'affirmer. `class_exists("Faker\Factory")` sur son autoloader doit rendre `false` aux
# deux bouts — c'est la vérification par ablation qu'exige le critère d'acceptation.

set -euo pipefail

# ─── Arguments ────────────────────────────────────────────────────────────────
APP_DIR="${1:?Usage: seed-environnement.sh <app-dir> [--fresh] [--class=<FQCN>]}"
shift

FRESH=0
SEEDER_CLASS=""
for arg in "$@"; do
    case "${arg}" in
        --fresh)   FRESH=1 ;;
        --class=*) SEEDER_CLASS="${arg#--class=}" ;;
        *)
            echo "[seed] Argument inconnu : ${arg}" >&2
            exit 2
            ;;
    esac
done

APP_DIR="${APP_DIR%/}"
CURRENT_LINK="${APP_DIR}/current"
SHARED_DIR="${APP_DIR}/shared"
WORKSPACE="${APP_DIR}/seed-workspace"

log() {
    echo "[seed] $(date '+%H:%M:%S') $*"
}

# ─── Garde-fous ───────────────────────────────────────────────────────────────
#
# La production est HORS PÉRIMÈTRE de TCK-353, et le refus est ici plutôt que dans le script
# appelant : un garde-fou qui ne vit que dans l'enveloppe ne protège pas l'appel direct, et
# l'appel direct est précisément ce qu'on fait quand quelque chose s'est mal passé.
if [ "${APP_DIR}" = "/var/www/takussan" ]; then
    log "REFUS : ${APP_DIR} est la racine de PRODUCTION."
    log "        Peupler la production n'est pas dans le périmètre de cet outil (TCK-353)."
    exit 1
fi

if [ ! -L "${CURRENT_LINK}" ]; then
    log "FATAL : ${CURRENT_LINK} n'est pas un lien symbolique — aucune release en service."
    exit 1
fi

if [ ! -f "${SHARED_DIR}/.env" ]; then
    log "FATAL : ${SHARED_DIR}/.env est absent."
    exit 1
fi

# Le chemin n'est qu'une convention ; ce que l'application DIT d'elle-même est la garde qui
# survit à un renommage de répertoire.
if grep -qE '^APP_ENV=production[[:space:]]*$' "${SHARED_DIR}/.env"; then
    log "REFUS : ${SHARED_DIR}/.env déclare APP_ENV=production."
    exit 1
fi

# ─── Le journal vit sur le SERVEUR, pas seulement dans le terminal appelant ──
#
# Payé le 2026-08-24 : le client SSH est mort au milieu d'un `--fresh`. Le seed, lui, a continué
# — le processus distant a survécu — mais tout ce qu'il imprimait partait dans un tuyau fermé.
# On se retrouvait avec une opération de 30 minutes en cours dont on ne savait plus rien, et
# aucun moyen de dire après coup si elle avait abouti.
#
# *Un compte rendu qui ne vit que dans la connexion qui l'a demandé disparaît avec elle — et une
# opération longue est exactement celle dont la connexion a le temps de tomber.*
#
# Le fichier est ÉCRASÉ à chaque exécution, délibérément : il porte la dernière manœuvre, pas
# leur histoire. Un journal qui grossit sans borne sur un serveur finit par être ce qui remplit
# le disque qu'on venait de vérifier.
# ⚠ `--output-error=warn` n'est PAS un raffinement : sans lui, ce bloc retourne exactement le
# défaut qu'il existe pour corriger. Un `tee` ordinaire meurt sur SIGPIPE quand la sortie
# standard disparaît — et le script, qui n'écrit plus alors que dans un tuyau sans lecteur, meurt
# derrière lui. La connexion tombée TUERAIT le seed, alors qu'aujourd'hui il survit. Avec
# `--output-error=warn`, `tee` signale l'écriture perdue et continue d'alimenter le fichier.
#
# *Un mécanisme de traçabilité qui s'interpose dans le flux devient un point de rupture de plus :
# celui-ci est vérifié en coupant réellement la connexion, pas en le supposant.*
# Et `HUP` ignoré, parce que le journal seul ne suffit pas : quand le canal SSH se ferme, sshd
# envoie SIGHUP au chef de session. MESURÉ le 2026-08-24 — un `--fresh` a tourné 40 minutes après
# la mort de son client, puis est mort en silence à `PropertyMediaSeeder`, à 3408 médias sur
# ~3431, **sans exécuter son trap de sortie** : l'espace de travail est resté sur le disque, et la
# base a gardé un jeu de données à moitié posé que rien n'annonçait comme incomplet.
#
# *Un processus qui « a survécu » à la coupure ne l'a peut-être que retardée : ici il a fallu
# quarante minutes pour que la différence se voie, et pendant ces quarante minutes le mauvais
# diagnostic était le plus rassurant.*
trap '' HUP PIPE

JOURNAL="${APP_DIR}/seed-environnement.log"
: > "${JOURNAL}"
exec > >(tee -p --output-error=warn "${JOURNAL}") 2>&1
log "Journal de cette exécution : ${JOURNAL}"

# ─── Nettoyage — sur TOUTES les sorties, pas seulement les bonnes ────────────
#
# `trap … EXIT` et non `ERR` : une interruption au clavier pendant les 30 minutes de seed est le
# cas le plus probable, et c'est justement celui qu'un trap sur ERR ne couvre pas. Le critère
# d'acceptation demande que rejouer la manœuvre deux fois de suite ne laisse aucun répertoire
# résiduel — un `Ctrl-C` compte comme une fois.
#
# Et il s'installe APRÈS les garde-fous, délibérément : un refus sur la racine de production ne
# doit pas donner à `rm -rf` un chemin calculé sous une racine qu'on vient de refuser de toucher.
nettoyer() {
    local code=$?
    if [ -d "${WORKSPACE}" ]; then
        log "Suppression de l'espace de travail jetable..."
        rm -rf "${WORKSPACE}"
    fi
    if [ "${code}" -ne 0 ]; then
        log "ÉCHEC (code ${code}). La release en service n'a pas été modifiée."
    fi
    return "${code}"
}
trap nettoyer EXIT

RELEASE_DIR=$(readlink -f "${CURRENT_LINK}")
log "Environnement : ${APP_DIR}"
log "Release en service : ${RELEASE_DIR}"

# ─── Vérification par ablation, AVANT ────────────────────────────────────────
#
# Si Faker est déjà là, c'est qu'une opération précédente a laissé la release en service avec ses
# dépendances de dév. On refuse de continuer : le seed réussirait, et masquerait l'écart.
faker_present() {
    php -r 'require $argv[1]."/vendor/autoload.php"; exit(class_exists("Faker\\Factory") ? 0 : 1);' \
        "$1" >/dev/null 2>&1
}

if faker_present "${RELEASE_DIR}"; then
    log "REFUS : la release en service porte déjà Faker — elle n'est donc pas en --no-dev."
    log "        Redéployer avant de seeder ; ce script ne doit pas devenir la raison de l'écart."
    exit 1
fi
log "Ablation (avant) : Faker absent de la release en service. ✓"

# ─── Espace de travail jetable ───────────────────────────────────────────────
if [ -e "${WORKSPACE}" ]; then
    log "Résidu d'une exécution précédente trouvé en ${WORKSPACE} — suppression."
    rm -rf "${WORKSPACE}"
fi

# `du` sur la release plutôt qu'un seuil écrit en dur : c'est exactement ce qu'on s'apprête à
# copier. Un disque plein en plein `cp -a` laisse une copie tronquée que le `composer install`
# suivant échoue à réparer, avec un message qui n'a rien à voir.
TAILLE_KO=$(du -sk "${RELEASE_DIR}" | cut -f1)
LIBRE_KO=$(df -Pk "${APP_DIR}" | awk 'NR==2 {print $4}')
log "Copie : ${TAILLE_KO} Ko à copier, ${LIBRE_KO} Ko libres."
if [ "${LIBRE_KO}" -lt $((TAILLE_KO * 2)) ]; then
    log "FATAL : espace disque insuffisant (il faut ~2× la taille de la release)."
    exit 1
fi

log "Copie de la release vers l'espace de travail jetable..."
# `-a` et pas `-r` : les liens `.env` et `storage` pointent vers `shared/`. Les SUIVRE créerait
# une copie du stockage partagé, que le seed remplirait de médias que personne ne servirait
# jamais — et qui partirait avec le répertoire jetable.
cp -a "${RELEASE_DIR}" "${WORKSPACE}"

# La configuration compilée par `deploy.sh` porte les chemins ABSOLUS de la release d'origine.
# La copie l'hériterait et écrirait à côté. On l'enlève à la main plutôt que par `config:clear` :
# à ce stade `composer install` n'a pas encore tourné, et `artisan` ne démarre pas.
rm -f "${WORKSPACE}"/bootstrap/cache/*.php

cd "${WORKSPACE}"

log "Installation des dépendances de développement dans la copie..."
composer install --no-interaction --prefer-dist

if ! faker_present "${WORKSPACE}"; then
    log "FATAL : Faker reste absent de la copie après composer install."
    exit 1
fi
log "Faker disponible dans la copie. ✓"

# ─── Peuplement ───────────────────────────────────────────────────────────────
if [ "${FRESH}" -eq 1 ]; then
    log "migrate:fresh — TOUTES les tables sont détruites puis recréées."
    php artisan migrate:fresh --force
fi

# Meilisearch ne se vide pas tout seul quand les tables tombent. Le flux est : tables vides,
# index vidés, PUIS seed — dans cet ordre, parce que vider les index APRÈS le seed effacerait
# aussi ce que le seed vient d'indexer.
#
# Détection des modèles indexés reprise de `deploy.sh` (Step 6b) : ils sont ce qui définit
# `toSearchableArray()`, découverts et non énumérés.
MODELES_INDEXES=()
if grep -qE '^SCOUT_DRIVER=meilisearch[[:space:]]*$' "${SHARED_DIR}/.env"; then
    while IFS= read -r f; do
        if [ -n "${f}" ]; then
            MODELES_INDEXES+=("App\\Models\\$(basename "${f}" .php)")
        fi
    done < <(grep -rl 'toSearchableArray' app/Models 2>/dev/null || true)
    log "Recherche : ${#MODELES_INDEXES[@]} modèle(s) indexé(s) détecté(s)."
else
    log "Recherche : SCOUT_DRIVER n'est pas meilisearch — rien à réindexer."
fi

if [ "${FRESH}" -eq 1 ] && [ ${#MODELES_INDEXES[@]} -gt 0 ]; then
    for m in "${MODELES_INDEXES[@]}"; do
        log "Vidage de l'index ${m}..."
        php artisan scout:flush "${m}" || log "AVERTISSEMENT : scout:flush ${m} a échoué."
    done
fi

if [ -n "${SEEDER_CLASS}" ]; then
    log "Seed : ${SEEDER_CLASS}"
    php artisan db:seed --force --class="${SEEDER_CLASS}"
else
    log "Seed : DatabaseSeeder (peut durer ~30 min avec SEED_DOWNLOAD_MEDIA=true)."
    php artisan db:seed --force
fi

# `scout:import` explicite, et non la confiance dans les observateurs Scout.
#
# Avec `SCOUT_QUEUE=true`, le seed n'indexe pas : il empile des jobs. Mesuré le 2026-08-24 sur la
# préproduction — après un seed complet, QUATRE index sur sept étaient restés vides
# (`agencies`, `customers`, `users`, `maintenance_requests`), sans une seule erreur. Un import
# explicite est idempotent : il écrase par clé primaire ce que la file aura déjà écrit.
if [ ${#MODELES_INDEXES[@]} -gt 0 ]; then
    for m in "${MODELES_INDEXES[@]}"; do
        log "Import de ${m} dans Meilisearch..."
        php artisan scout:import "${m}" || log "AVERTISSEMENT : scout:import ${m} a échoué."
    done
fi

# ─── Vérification par ablation, APRÈS ────────────────────────────────────────
cd "${APP_DIR}"
if faker_present "${RELEASE_DIR}"; then
    log "FATAL : la release en service porte MAINTENANT Faker — elle a été contaminée."
    log "        Redéployer immédiatement : ${RELEASE_DIR}"
    exit 1
fi
log "Ablation (après) : Faker toujours absent de la release en service. ✓"

log "Peuplement terminé."
