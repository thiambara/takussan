#!/usr/bin/env bash
#
# deploy.sh — Zero-downtime deployment for Takussan (Laravel API).
#
# Usage: deploy.sh <repo-url> [branch] [app-dir]
#
# - Sparse-checkouts the takussan-api/ subdir of the monorepo
# - Symlinks shared .env (written from $ENV_FILE) and shared/storage
# - composer install --no-dev, migrate --force, config/route/view:cache
# - Atomic symlink swap (releases/<ts> → current)
# - Restarts queue worker, reloads nginx, restarts PHP-FPM
# - Trap ERR triggers full rollback (current restored, release dir removed)
# - Keeps the last 5 releases
#
set -euo pipefail

# ─── Arguments ──────────────────────────────────────────────────────────────
REPO_URL="${1:?Usage: deploy.sh <repo-url> [branch] [app-dir]}"
BRANCH="${2:-preview}"
APP_DIR="${3:-/var/www/takussan-preprod}"

# ─── Configuration ──────────────────────────────────────────────────────────
RELEASES_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
CURRENT_LINK="$APP_DIR/current"
KEEP_RELEASES=5
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RELEASE_DIR="$RELEASES_DIR/$TIMESTAMP"

# Tunables (env-overridable so prod can change without editing this file)
PHP_BIN="${PHP_BIN:-php8.3}"
PHP_FPM_SERVICE="${PHP_FPM_SERVICE:-php8.3-fpm}"
QUEUE_SERVICE="${QUEUE_SERVICE:-takussan-queue-preprod}"
MONOREPO_SUBDIR="${MONOREPO_SUBDIR:-takussan-api}"

# ─── State ──────────────────────────────────────────────────────────────────
PREVIOUS_RELEASE=""

# ─── Helpers ────────────────────────────────────────────────────────────────
log() { echo "[deploy] $(date '+%H:%M:%S') $*"; }

get_previous_release() {
    if [ -L "$CURRENT_LINK" ]; then
        readlink -f "$CURRENT_LINK"
    fi
}

rollback() {
    local exit_code=$?
    log "ERROR: deploy failed (exit=$exit_code). Rolling back..."

    if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
        log "Restoring symlink to previous release: $PREVIOUS_RELEASE"
        ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK.tmp" \
            && mv -Tf "$CURRENT_LINK.tmp" "$CURRENT_LINK"
    else
        log "No previous release to restore (first deploy?)."
    fi

    if [ -d "$RELEASE_DIR" ]; then
        log "Removing failed release: $RELEASE_DIR"
        rm -rf "$RELEASE_DIR"
    fi
    if [ -d "$RELEASE_DIR.tmp" ]; then
        rm -rf "$RELEASE_DIR.tmp"
    fi

    log "Rollback complete."
    exit 1
}
trap rollback ERR

# ─── Pre-flight ─────────────────────────────────────────────────────────────
log "Starting deploy"
log "  repo    : $REPO_URL"
log "  branch  : $BRANCH"
log "  app dir : $APP_DIR"
log "  release : $TIMESTAMP"

[ -d "$SHARED_DIR" ] || {
    log "FATAL: $SHARED_DIR missing. Run server-setup.sh first."
    exit 1
}

# Write shared/.env from $ENV_FILE if provided (injected by GH Actions secret).
# Otherwise require a pre-existing file.
if [ -n "${ENV_FILE:-}" ]; then
    log "Writing $SHARED_DIR/.env from ENV_FILE secret"
    printf '%s\n' "$ENV_FILE" > "$SHARED_DIR/.env"
    chmod 640 "$SHARED_DIR/.env"
elif [ ! -f "$SHARED_DIR/.env" ]; then
    log "FATAL: no ENV_FILE provided and $SHARED_DIR/.env does not exist."
    exit 1
fi

[ -d "$SHARED_DIR/storage" ] || {
    log "FATAL: $SHARED_DIR/storage missing."
    exit 1
}

PREVIOUS_RELEASE=$(get_previous_release)
if [ -n "$PREVIOUS_RELEASE" ]; then
    log "Previous release: $PREVIOUS_RELEASE"
else
    log "No previous release (first deploy)."
fi

mkdir -p "$RELEASES_DIR"

# ─── 1. Sparse-checkout the API subdir ──────────────────────────────────────
log "Cloning $REPO_URL@$BRANCH (sparse: $MONOREPO_SUBDIR)..."
git clone --depth 1 --branch "$BRANCH" --filter=blob:none --no-checkout \
    "$REPO_URL" "$RELEASE_DIR.tmp"

cd "$RELEASE_DIR.tmp"
git sparse-checkout init --cone
git sparse-checkout set "$MONOREPO_SUBDIR"
git checkout

if [ ! -d "$RELEASE_DIR.tmp/$MONOREPO_SUBDIR" ]; then
    log "FATAL: $MONOREPO_SUBDIR/ not found in clone."
    exit 1
fi

# Flatten: the release dir's root is the Laravel app, not the monorepo.
mv "$RELEASE_DIR.tmp/$MONOREPO_SUBDIR" "$RELEASE_DIR"
rm -rf "$RELEASE_DIR.tmp"

# ─── 2. Symlink shared .env + storage ───────────────────────────────────────
log "Linking shared .env"
rm -f "$RELEASE_DIR/.env"
ln -sfn "$SHARED_DIR/.env" "$RELEASE_DIR/.env"

log "Linking shared storage"
rm -rf "$RELEASE_DIR/storage"
ln -sfn "$SHARED_DIR/storage" "$RELEASE_DIR/storage"

# ─── 3. Composer install (production) ───────────────────────────────────────
log "composer install --no-dev"
cd "$RELEASE_DIR"
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# ─── 4. Migrations ──────────────────────────────────────────────────────────
# NOTE: writes to DB happen here. Rollback restores code but NOT the schema.
# Always write backward-compatible migrations.
log "artisan migrate --force"
$PHP_BIN artisan migrate --force

# ─── 5. Caches ──────────────────────────────────────────────────────────────
log "artisan config:cache"
$PHP_BIN artisan config:cache
log "artisan route:cache"
$PHP_BIN artisan route:cache
log "artisan view:cache"
$PHP_BIN artisan view:cache

# ─── 6. Storage public symlink (idempotent) ─────────────────────────────────
log "artisan storage:link"
$PHP_BIN artisan storage:link || log "storage:link already exists (ok)"

# ─── 7. Atomic symlink swap ─────────────────────────────────────────────────
log "Swapping $CURRENT_LINK → $RELEASE_DIR (atomic)"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.tmp"
mv -Tf "$CURRENT_LINK.tmp" "$CURRENT_LINK"

# ─── 8. Restart queue + reload services ─────────────────────────────────────
log "Restarting queue + reloading services"
cd "$CURRENT_LINK"
$PHP_BIN artisan queue:restart 2>/dev/null || log "  queue:restart: no running workers (ok)"
sudo /bin/systemctl restart "$QUEUE_SERVICE" 2>/dev/null \
    || log "  systemctl restart $QUEUE_SERVICE failed (ok if not started yet)"
sudo /bin/systemctl restart "$PHP_FPM_SERVICE"
sudo /bin/systemctl reload nginx

# ─── 9. Cleanup old releases ────────────────────────────────────────────────
log "Cleaning up old releases (keeping last $KEEP_RELEASES)"
cd "$RELEASES_DIR"
COUNT=$(ls -1d */ 2>/dev/null | wc -l)
if [ "$COUNT" -gt "$KEEP_RELEASES" ]; then
    REMOVE=$((COUNT - KEEP_RELEASES))
    ls -1d */ | head -n "$REMOVE" | while read -r old; do
        log "  removing $old"
        rm -rf "$RELEASES_DIR/$old"
    done
fi

# ─── Done ───────────────────────────────────────────────────────────────────
log "Deploy OK"
log "  current → $RELEASE_DIR"
