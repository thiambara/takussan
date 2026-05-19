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
log "Cloning repository..."
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${RELEASE_DIR}"

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
log "Installing Composer dependencies..."
cd "${RELEASE_DIR}/takussan-api"
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
# Hits /up on localhost with the right Host header. Any non-200 triggers the
# rollback trap (restores previous symlink, removes new release).
case "${APP_DIR}" in
    */takussan)         HOST_HEADER="api.takussan.com" ;;
    */takussan-preview) HOST_HEADER="preview.api.takussan.com" ;;
    *)                  HOST_HEADER="" ;;
esac

if [ -n "${HOST_HEADER}" ]; then
    log "Health check: curl http://127.0.0.1/up (Host: ${HOST_HEADER})..."
    HEALTH_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
        -H "Host: ${HOST_HEADER}" \
        --max-time 10 \
        http://127.0.0.1/up || echo "000")

    if [ "${HEALTH_CODE}" != "200" ]; then
        log "FATAL: Health check failed (HTTP ${HEALTH_CODE}). Triggering rollback..."
        false   # trips the ERR trap → rollback() restores previous release
    fi
    log "Health check passed (HTTP 200)."
else
    log "WARNING: APP_DIR=${APP_DIR} doesn't match any known vhost — skipping health check."
fi

# ─── Step 10: Restart queue workers ──────────────────────────────────────────
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
