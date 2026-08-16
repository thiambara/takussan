#!/usr/bin/env bash
#
# deploy.sh — Zero-downtime deployment for Takussan (Laravel API)
#
# Usage: deploy.sh <repo-url> [branch] [app-dir]
#
# Deploys the given branch to the specified app directory using a timestamped
# release directory, shared .env and storage, and atomic symlink swap.
#
# Defaults: branch=master, app-dir=/var/www/takussan

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
BRANCH="${2:-master}"
APP_DIR="${3:-/var/www/takussan}"
RELEASES_DIR="${APP_DIR}/releases"
SHARED_DIR="${APP_DIR}/shared"
CURRENT_LINK="${APP_DIR}/current"
KEEP_RELEASES=5
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RELEASE_DIR="${RELEASES_DIR}/${TIMESTAMP}"

# ─── Arguments ────────────────────────────────────────────────────────────────
REPO_URL="${1:?Usage: deploy.sh <repo-url> [branch] [app-dir]}"

# ─── State ────────────────────────────────────────────────────────────────────
PREVIOUS_RELEASE=""

# ─── Helpers ──────────────────────────────────────────────────────────────────
log() {
    echo "[deploy] $(date '+%H:%M:%S') $*"
}

get_previous_release() {
    if [ -L "${CURRENT_LINK}" ]; then
        # current -> releases/<timestamp>/takussan-api
        # We resolve to the releases/<timestamp> parent
        local target
        target=$(readlink -f "${CURRENT_LINK}")
        # target is /var/www/takussan/releases/<ts>/takussan-api
        dirname "${target}"
    fi
}

rollback() {
    local exit_code=$?
    log "ERROR: Deployment failed (exit code: ${exit_code}). Rolling back..."

    # Restore symlink to previous release if one existed
    if [ -n "${PREVIOUS_RELEASE}" ] && [ -d "${PREVIOUS_RELEASE}" ]; then
        log "Restoring symlink to previous release: ${PREVIOUS_RELEASE}"
        ln -sfn "${PREVIOUS_RELEASE}/takussan-api" "${CURRENT_LINK}.tmp" \
            && mv -Tf "${CURRENT_LINK}.tmp" "${CURRENT_LINK}"
    fi

    # Remove the failed release directory
    if [ -d "${RELEASE_DIR}" ]; then
        log "Removing failed release: ${RELEASE_DIR}"
        rm -rf "${RELEASE_DIR}"
    fi

    log "Rollback complete."
    exit 1
}

trap rollback ERR

# ─── Pre-flight checks ───────────────────────────────────────────────────────
log "Starting deployment..."
log "Repo:    ${REPO_URL}"
log "Branch:  ${BRANCH}"
log "App dir: ${APP_DIR}"
log "Release: ${TIMESTAMP}"

if [ ! -d "${SHARED_DIR}" ]; then
    log "FATAL: Shared directory ${SHARED_DIR} does not exist."
    exit 1
fi

# Write .env from ENV_FILE secret if provided, otherwise check it exists
if [ -n "${ENV_FILE:-}" ]; then
    log "Writing .env from ENV_FILE secret..."
    echo "${ENV_FILE}" > "${SHARED_DIR}/.env"
    chown deploy:www-data "${SHARED_DIR}/.env"
    chmod 640 "${SHARED_DIR}/.env"
elif [ ! -f "${SHARED_DIR}/.env" ]; then
    log "FATAL: No ENV_FILE provided and ${SHARED_DIR}/.env does not exist."
    exit 1
fi

# Validate APP_KEY is present and non-empty — Laravel sessions/cookies/Sanctum
# silently break without it, so fail fast before clone.
if ! grep -qE '^APP_KEY=base64:.+' "${SHARED_DIR}/.env"; then
    log "FATAL: ${SHARED_DIR}/.env is missing or has an empty APP_KEY (expected APP_KEY=base64:...)."
    log "       Regenerate with: php artisan key:generate --show"
    exit 1
fi

if [ ! -d "${SHARED_DIR}/storage" ]; then
    log "FATAL: Shared storage directory ${SHARED_DIR}/storage does not exist."
    exit 1
fi

# Record the previous release for rollback
PREVIOUS_RELEASE=$(get_previous_release)
if [ -n "${PREVIOUS_RELEASE}" ]; then
    log "Previous release: ${PREVIOUS_RELEASE}"
else
    log "No previous release found (first deployment)."
fi

mkdir -p "${RELEASES_DIR}"

# ─── Step 1: Clone ───────────────────────────────────────────────────────────
# On vise le COMMIT quand on nous le donne, et la tête de branche seulement à défaut.
#
# `git clone --depth 1 --branch "$BRANCH"` prend ce que la branche pointe AU MOMENT DU CLONE.
# Le workflow, lui, avait été corrigé pour récupérer `github.sha` — le commit exact du push.
# Résultat : la moitié « script de déploiement » venait du bon commit, la moitié « code
# applicatif » venait de la tête. Avec `cancel-in-progress: false`, deux poussées rapprochées
# faisaient déployer au premier run un arbre contenant déjà le second commit, en rapportant un
# succès en face du premier.
#
# *Une garantie « même commit » à moitié posée n'est pas à moitié tenue : elle est fausse, et
# elle est désormais écrite dans un commentaire que l'on croira.*
#
# Et le clone reste SUPERFICIEL. La première version de ce bloc laissait tomber `--depth 1` pour
# pouvoir se détacher sur un commit — ce dépôt porte 319 Mo d'historique, et `KEEP_RELEASES=5`
# en aurait donc gardé ~1,6 Go sur le VPS, pour un premier déploiement et des rollbacks
# d'autant plus lents. GitHub autorise `fetch` par SHA : la garantie « même commit » ne coûte
# donc rien de plus qu'avant. *Une garantie qu'on paie en gigaoctets se fait désinstaller.*
log "Cloning repository..."
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${RELEASE_DIR}"
if [ -n "${COMMIT_SHA:-}" ]; then
    log "Target commit: ${COMMIT_SHA} (branch ${BRANCH})"
    # On ne FETCH que si le commit n'est pas déjà là — c'est le cas courant, puisque le clone
    # vient de récupérer la tête de la branche. Le `fetch` par SHA dépend de
    # `uploadpack.allowReachableSHA1InWant` côté serveur : GitHub l'autorise, mais `REPO_URL` est
    # un secret et pourrait viser un miroir ou un remote auto-hébergé qui le refuse. Sous
    # `set -e` + `trap rollback ERR`, un refus avortait le déploiement et supprimait la release —
    # sur une chaîne qui n'a encore jamais tourné en production.
    #
    # *Une vérification ne doit pas introduire une façon nouvelle d'échouer pour le cas où il n'y
    # avait rien à vérifier.*
    if ! git -C "${RELEASE_DIR}" cat-file -e "${COMMIT_SHA}^{commit}" 2>/dev/null; then
        log "Commit absent du clone superficiel — fetch ciblé."
        git -C "${RELEASE_DIR}" fetch --depth 1 origin "${COMMIT_SHA}"
    fi
    git -C "${RELEASE_DIR}" checkout --detach "${COMMIT_SHA}"
else
    log "No COMMIT_SHA given — deploying the tip of ${BRANCH}."
fi
log "Deployed commit: $(git -C "${RELEASE_DIR}" rev-parse HEAD)"

# ─── Step 2: Symlink shared .env ─────────────────────────────────────────────
log "Linking shared .env..."
# Remove the default .env if it exists in the clone
rm -f "${RELEASE_DIR}/takussan-api/.env"
ln -sfn "${SHARED_DIR}/.env" "${RELEASE_DIR}/takussan-api/.env"

# ─── Step 3: Symlink shared storage ──────────────────────────────────────────
log "Linking shared storage..."
# Remove the cloned storage directory and replace with symlink
rm -rf "${RELEASE_DIR}/takussan-api/storage"
ln -sfn "${SHARED_DIR}/storage" "${RELEASE_DIR}/takussan-api/storage"

# ─── Step 4: Composer install ────────────────────────────────────────────────
cd "${RELEASE_DIR}/takussan-api"

# Vérifie les prérequis de plateforme contre l'interpréteur RÉELLEMENT présent — AVANT
# d'installer quoi que ce soit, et l'ordre est tout l'intérêt.
#
# `composer.json` pose `config.platform.php = 8.4.1` pour que la résolution vise la version de
# production, quelle que soit celle du poste où l'on fait un `composer update`. Effet de bord :
# `composer install` valide alors le lock contre ce PHP *synthétique*, et cesse de regarder
# celui de la machine. Sur un serveur resté en 8.3, l'installation réussirait donc, écrirait un
# vendor 8.4-only, et `php artisan migrate` fatalerait sur de la syntaxe 8.4 au milieu d'une
# dépendance — en plein déploiement, release déjà peuplée.
#
# `check-platform-reqs` ignore l'override et compare aux extensions et à la version réelles.
# Il lit le `composer.lock` quand `vendor/` n'existe pas encore : on peut donc le placer AVANT
# `composer install`, et c'est là qu'il doit être. Une revue a relevé qu'il tournait juste
# après — le commentaire promettait « le refus EN AMONT » pendant que le vendor 8.4-only était
# déjà écrit dans la nouvelle release. *Une vérification préalable placée après ce qu'elle
# prévient n'est plus une vérification préalable : c'est un constat.*
log "Checking platform requirements against the real PHP..."
composer check-platform-reqs --no-dev

log "Installing Composer dependencies..."
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# ─── Step 5: Build Vite assets (admin views) ────────────────────────────────
log "Installing npm dependencies..."
npm ci --no-audit --no-fund
log "Building Vite assets..."
npm run build
log "Removing node_modules (no longer needed at runtime)..."
rm -rf "${RELEASE_DIR}/takussan-api/node_modules"

# ─── Step 6: Migrations ──────────────────────────────────────────────────────
# NOTE: If migration succeeds but a later step fails, rollback restores old code
# but the DB keeps the new schema. Always write backward-compatible migrations.
log "Running database migrations..."
php artisan migrate --force

# ─── Step 6a-bis: Reconcile agency system roles (TCK-317, ADR-0014) ──────────
# The capability catalogue is defined in code (`Capability` +
# `SystemRoleCapabilities`) but MATERIALISED as rows in
# `agency_role_capabilities`, seeded once per agency. Without this step, a
# capability added to the enum reaches every agency created AFTER the deploy
# and none of those created BEFORE — silently, because nothing compares the
# two. Measured 2026-08-16: re-running the seeder on an existing agency was a
# no-op (42 rows → 41 after deleting one, not restored).
#
# Idempotent and ADDITIVE: it never removes a capability, and never touches a
# custom role — diverging from the catalogue is exactly what a custom role is
# for. A no-op run costs one query per system role.
#
# Non-fatal by design: a stale role grants FEWER rights than intended, which
# is the safe direction. It must not roll back an otherwise healthy deploy —
# but it is logged loudly, and the CI guard
# (`SystemRoleDriftTest::test_guard_…`) fails on any divergence.
log "Reconciling agency system roles with the capability catalogue..."
php artisan membership:reconcile-system-roles \
    || log "WARNING: membership:reconcile-system-roles failed — system roles may lag the catalogue until the next deploy."

# ─── Step 6b: Sync Meilisearch index settings ────────────────────────────────
# Pushes searchable/filterable/sortable attributes + ranking rules from
# config/scout.php to Meilisearch. Idempotent — safe to run on every deploy
# (Laravel docs recommend making this part of the deploy process).
# Auto-skipped when the environment is not on the meilisearch driver (e.g.
# preview on the collection driver). Non-fatal: a transient Meilisearch issue
# must not roll back an otherwise healthy code deploy.
if grep -qE '^SCOUT_DRIVER=meilisearch[[:space:]]*$' "${SHARED_DIR}/.env"; then
    log "Syncing Meilisearch index settings..."
    php artisan scout:sync-index-settings \
        || log "WARNING: scout:sync-index-settings failed — search filters/sort may be stale until the next deploy."
else
    log "Search: SCOUT_DRIVER is not meilisearch — skipping index settings sync."
fi

# ─── Step 7: Cache config, routes, views ─────────────────────────────────────
log "Caching configuration..."
php artisan config:cache
log "Caching routes..."
php artisan route:cache
log "Caching views..."
php artisan view:cache

# ─── Step 8: Storage public symlink ─────────────────────────────────────────
log "Creating storage public symlink..."
php artisan storage:link

# ─── Step 9: Atomic symlink swap ─────────────────────────────────────────────
log "Swapping symlink to new release (atomic)..."
ln -sfn "${RELEASE_DIR}/takussan-api" "${CURRENT_LINK}.tmp"
mv -Tf "${CURRENT_LINK}.tmp" "${CURRENT_LINK}"
log "Symlink swapped successfully."

# ─── Step 9b: Reload PHP-FPM (clear opcache) ─────────────────────────────────
# Without this, FPM keeps the previous release's realpath in opcache and serves
# stale bytecode until the next FPM reload. Sudoers entry installed by
# server-setup.sh (Step 9) allows the deploy user to reload without password.
PHP_FPM_VERSION=$(cat /etc/takussan/php-version 2>/dev/null || echo "")
if [ -n "${PHP_FPM_VERSION}" ]; then
    log "Reloading php${PHP_FPM_VERSION}-fpm to clear opcache..."
    sudo -n /bin/systemctl reload "php${PHP_FPM_VERSION}-fpm"
else
    log "WARNING: /etc/takussan/php-version not found — skipping FPM reload."
    log "         Run server-setup.sh on the VPS to install the pin (opcache may serve stale code)."
fi

# ─── Step 9c: Health check post-swap ─────────────────────────────────────────
# Hits /up on localhost via HTTPS with --resolve (forces 127.0.0.1 so the cert
# stays valid). Any non-200 triggers the rollback trap.
# Fallback to HTTP for the case where Certbot hasn't run yet (1st deploy);
# in that case the HTTP vhost serves /up directly without redirect.
case "${APP_DIR}" in
    */takussan)         HOST_HEADER="api.takussan.com" ;;
    */takussan-preview) HOST_HEADER="preview.api.takussan.com" ;;
    *)                  HOST_HEADER="" ;;
esac

if [ -n "${HOST_HEADER}" ]; then
    log "Health check: curl https://${HOST_HEADER}/up (via 127.0.0.1)..."
    HEALTH_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
        --resolve "${HOST_HEADER}:443:127.0.0.1" \
        --max-time 10 \
        "https://${HOST_HEADER}/up" 2>/dev/null) || HEALTH_CODE="000"

    # If HTTPS isn't up yet (e.g. Certbot not run on 1st deploy), retry on HTTP.
    if [ "${HEALTH_CODE}" = "000" ] || [ "${HEALTH_CODE}" = "502" ]; then
        log "  HTTPS unreachable, trying HTTP fallback (Certbot may not be configured yet)..."
        HEALTH_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
            -H "Host: ${HOST_HEADER}" \
            --max-time 10 \
            http://127.0.0.1/up 2>/dev/null) || HEALTH_CODE="000"
    fi

    if [ "${HEALTH_CODE}" != "200" ]; then
        log "FATAL: Health check failed (HTTP ${HEALTH_CODE}). Triggering rollback..."
        false   # trips the ERR trap → rollback() restores previous release
    fi
    log "Health check passed (HTTP 200)."
else
    log "WARNING: APP_DIR=${APP_DIR} doesn't match any known vhost — skipping health check."
fi

# ─── Step 10: Restart queue workers ──────────────────────────────────────────
# L'unité systemd INSTALLÉE porte-t-elle les files nommées ?
#
# `--queue=notifications-urgent,default,media,reconciliation` a été ajouté à
# `scripts/server-setup.sh` — mais ce script est MANUEL : aucun workflow ne le lance, et
# `deploy.sh` ne fait qu'un `queue:restart`, qui relance le worker depuis l'ExecStart déjà
# installé. Sur un serveur provisionné avant le correctif, l'unité garde donc son ancienne
# commande, et `scripts/check-queues.mjs` reste vert : il lit le TEXTE DU SCRIPT, pas l'unité.
#
# Ce contrôle-ci lit l'unité réelle. Il n'échoue pas le déploiement — le code est bon, ce sont
# les jobs de fond qui dorment — mais il refuse de laisser passer ça en silence.
#
# ⚠ On vérifie la COUVERTURE, pas la présence du drapeau. La première version se contentait de
# `grep -- '--queue='` sur chaque unité : après le passage à DEUX workers par application, si
# l'unité de fond échouait à s'installer ou restait désactivée, l'unité survivante satisfaisait
# quand même le grep, le contrôle se taisait, et `media`/`reconciliation` ne tournaient jamais —
# la panne silencieuse exacte que ce contrôle existe pour rendre visible.
#
# *Vérifier qu'un drapeau est là ne vérifie pas ce qu'il déclare.*
FILES_ATTENDUES="notifications-urgent default media reconciliation"
FILES_SERVIES=""
for unit in /etc/systemd/system/takussan-queue*.service; do
    [ -f "${unit}" ] || continue
    # Les unités de PRÉPRODUCTION sont exclues, et l'oubli était le même défaut que celui que
    # `check-queues.mjs` venait de corriger dans sa propre résolution : le glob attrapait
    # `takussan-queue-preview*`, et leurs files entraient dans la même union. La production
    # pouvait donc perdre `media` sans un mot, tant que la préproduction la déclarait.
    # On distingue par `WorkingDirectory`, que systemd porte déjà.
    #
    # *La leçon d'une garde ne traverse pas jusqu'à sa sœur toute seule.*
    if ! grep -q "^WorkingDirectory=${APP_DIR}/current$" "${unit}"; then
        continue
    fi
    # Une unité désactivée ne sert rien : on ne compte que celles qui sont actives.
    # ACTIVE, pas seulement « activée ». `is-enabled` dit qu'elle démarrera au boot ; il ne dit
    # rien de son état actuel. Une unité `enabled` mais en boucle de redémarrage — un mauvais
    # release, un `WorkingDirectory` absent une seconde — faisait compter ses files comme
    # servies, et le contrôle annonçait « les quatre files couvertes » pendant que `media` et
    # `reconciliation` ne se vidaient jamais. C'est la panne silencieuse même que ce bloc existe
    # pour rendre visible.
    _u="$(basename "${unit}" .service)"
    if ! systemctl is-enabled --quiet "${_u}" 2>/dev/null; then
        log "WARNING: ${_u} existe mais n'est pas activée."
        continue
    fi
    if ! systemctl is-active --quiet "${_u}" 2>/dev/null; then
        log "WARNING: ${_u} est activée mais NE TOURNE PAS — ses files ne se vident pas."
        log "         'systemctl status ${_u}' et 'journalctl -u ${_u} -n 50' pour la cause."
        continue
    fi
    ligne=$(grep -m1 -- 'ExecStart=.*--queue=' "${unit}" || true)
    if [ -z "${ligne}" ]; then
        log "WARNING: ${unit} lance queue:work SANS --queue — il ne consomme que 'default'."
        FILES_SERVIES="${FILES_SERVIES} default"
        continue
    fi
    FILES_SERVIES="${FILES_SERVIES} $(echo "${ligne}" | sed -n 's/.*--queue=\([a-z0-9_,-]*\).*/\1/p' | tr ',' ' ')"
done

for f in ${FILES_ATTENDUES}; do
    case " ${FILES_SERVIES} " in
        *" ${f} "*) ;;
        *)
            log "WARNING: aucune unité systemd active ne consomme la file '${f}'."
            log "         Ses jobs s'empileront dans la table 'jobs' sans jamais s'exécuter,"
            log "         et rien d'autre ne le signalera."
            log "         Correctif : sudo bash scripts/server-setup.sh"
            ;;
    esac
done

log "Restarting queue workers..."
cd "${CURRENT_LINK}"
php artisan queue:restart 2>/dev/null || log "No queue workers running (ignored)."

# ─── Step 11: Cleanup old releases ───────────────────────────────────────────
log "Cleaning up old releases (keeping last ${KEEP_RELEASES})..."
cd "${RELEASES_DIR}"
# List directories sorted oldest first, remove all but the most recent N
RELEASES_COUNT=$(ls -1d */ 2>/dev/null | wc -l)
if [ "${RELEASES_COUNT}" -gt "${KEEP_RELEASES}" ]; then
    REMOVE_COUNT=$((RELEASES_COUNT - KEEP_RELEASES))
    ls -1d */ | head -n "${REMOVE_COUNT}" | while read -r old_release; do
        log "  Removing old release: ${old_release}"
        rm -rf "${RELEASES_DIR}/${old_release}"
    done
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
log "Deployment completed successfully!"
log "Current release: ${RELEASE_DIR}/takussan-api"
