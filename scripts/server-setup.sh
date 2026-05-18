#!/usr/bin/env bash
#
# server-setup.sh — Idempotent one-shot setup for Takussan on a Contabo VPS.
#
# Creates the directory layout, isolated PHP-FPM pool, Laravel queue worker
# (systemd) and scheduler cron for one environment (preprod by default).
# Reuses the existing `deploy` user (shared with CheckPrint on the same VPS).
#
# Usage:
#   sudo bash server-setup.sh                    # preprod (default)
#   ENV_NAME=prod APP_DIR=/var/www/takussan \
#     POOL_NAME=takussan \
#     QUEUE_SERVICE=takussan-queue \
#     sudo bash server-setup.sh                  # prod
#
# Re-running is safe — existing pool/service/cron are detected and re-written.
#
set -euo pipefail

# ─── Configuration (overridable via env) ─────────────────────────────────────
APP_DIR="${APP_DIR:-/var/www/takussan-preprod}"
ENV_NAME="${ENV_NAME:-preprod}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
WEB_GROUP="${WEB_GROUP:-www-data}"
POOL_NAME="${POOL_NAME:-takussan-preprod}"
QUEUE_SERVICE="${QUEUE_SERVICE:-takussan-queue-preprod}"
PHP_VERSION="${PHP_VERSION:-8.3}"

log() { echo "[setup] $*"; }

# ─── Pre-flight ──────────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || { echo "ERROR: run as root or with sudo." >&2; exit 1; }

if ! id "$DEPLOY_USER" &>/dev/null; then
    echo "ERROR: user '$DEPLOY_USER' missing. Expected to exist (shared with CheckPrint)." >&2
    echo "       Create it manually if Takussan is the first app on this VPS:" >&2
    echo "       adduser --disabled-password --gecos '' $DEPLOY_USER && usermod -aG $WEB_GROUP $DEPLOY_USER" >&2
    exit 1
fi

if ! command -v "php$PHP_VERSION" >/dev/null 2>&1; then
    echo "ERROR: php$PHP_VERSION not installed. Install via ondrej/php PPA." >&2
    exit 1
fi

POOL_FILE="/etc/php/$PHP_VERSION/fpm/pool.d/$POOL_NAME.conf"
SERVICE_FILE="/etc/systemd/system/$QUEUE_SERVICE.service"

# ─── 1. Directory layout ─────────────────────────────────────────────────────
log "Creating $APP_DIR layout"
mkdir -p "$APP_DIR/releases"
mkdir -p "$APP_DIR/shared/storage/app/public"
mkdir -p "$APP_DIR/shared/storage/app/private"
mkdir -p "$APP_DIR/shared/storage/framework/cache/data"
mkdir -p "$APP_DIR/shared/storage/framework/sessions"
mkdir -p "$APP_DIR/shared/storage/framework/views"
mkdir -p "$APP_DIR/shared/storage/framework/testing"
mkdir -p "$APP_DIR/shared/storage/logs"

chown -R "$DEPLOY_USER:$WEB_GROUP" "$APP_DIR"
chmod -R 775 "$APP_DIR/shared/storage"

# ─── 2. PHP-FPM pool ─────────────────────────────────────────────────────────
log "Writing PHP-FPM pool $POOL_FILE"
cat > "$POOL_FILE" <<CONF
; Takussan ($ENV_NAME) — isolated PHP-FPM pool
[$POOL_NAME]
user = $DEPLOY_USER
group = $WEB_GROUP
listen = /run/php/$POOL_NAME.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660

pm = dynamic
pm.max_children = 10
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 4
pm.max_requests = 500

php_admin_value[error_log] = /var/log/php/$POOL_NAME.error.log
php_admin_flag[log_errors] = on
php_admin_value[memory_limit] = 256M
php_admin_value[upload_max_filesize] = 20M
php_admin_value[post_max_size] = 25M

env[APP_ENV] = $ENV_NAME
CONF

mkdir -p /var/log/php
touch "/var/log/php/$POOL_NAME.error.log"
chown "$DEPLOY_USER:$WEB_GROUP" "/var/log/php/$POOL_NAME.error.log"

log "Restarting php$PHP_VERSION-fpm"
systemctl restart "php$PHP_VERSION-fpm"

# ─── 3. Queue worker (systemd) ───────────────────────────────────────────────
log "Writing queue worker service $SERVICE_FILE"
cat > "$SERVICE_FILE" <<UNIT
[Unit]
Description=Takussan Laravel Queue Worker ($ENV_NAME)
After=network.target mysql.service

[Service]
User=$DEPLOY_USER
Group=$WEB_GROUP
WorkingDirectory=$APP_DIR/current
ExecStart=/usr/bin/php$PHP_VERSION artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5
StandardOutput=append:$APP_DIR/shared/storage/logs/queue-worker.log
StandardError=append:$APP_DIR/shared/storage/logs/queue-worker.log

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$QUEUE_SERVICE"
# Service is started only after the first successful deploy creates current/.
log "Queue service $QUEUE_SERVICE enabled (will start after first deploy)."

# ─── 4. Laravel scheduler cron ──────────────────────────────────────────────
CRON_LINE="* * * * * cd $APP_DIR/current && php$PHP_VERSION artisan schedule:run >> /dev/null 2>&1"
EXISTING=$(crontab -u "$DEPLOY_USER" -l 2>/dev/null || true)

if echo "$EXISTING" | grep -qF "$APP_DIR/current"; then
    log "Scheduler cron for $APP_DIR already present, skipping."
else
    log "Adding scheduler cron for $APP_DIR"
    (echo "$EXISTING"; echo "$CRON_LINE") | crontab -u "$DEPLOY_USER" -
fi

# ─── 5. Sudoers — allow deploy to restart this env's services ────────────────
SUDOERS_FILE="/etc/sudoers.d/takussan-$ENV_NAME"
log "Writing $SUDOERS_FILE"
cat > "$SUDOERS_FILE" <<SUDO
# Allow $DEPLOY_USER to manage Takussan $ENV_NAME services without password.
# Other entries (CheckPrint) live in /etc/sudoers.d/deploy and are untouched.
$DEPLOY_USER ALL=(root) NOPASSWD: /bin/systemctl restart $QUEUE_SERVICE
$DEPLOY_USER ALL=(root) NOPASSWD: /bin/systemctl restart php$PHP_VERSION-fpm
$DEPLOY_USER ALL=(root) NOPASSWD: /bin/systemctl reload nginx
SUDO
chmod 440 "$SUDOERS_FILE"

# ─── Done ───────────────────────────────────────────────────────────────────
log ""
log "=================================================="
log "  Takussan $ENV_NAME setup complete."
log "=================================================="
log ""
log "Next steps:"
log "  1. Create MySQL database:"
log "       sudo mysql -e \"CREATE DATABASE takussan_${ENV_NAME}\""
log "       sudo mysql -e \"CREATE USER 'takussan_${ENV_NAME:0:3}'@'localhost' IDENTIFIED BY '<password>'\""
log "       sudo mysql -e \"GRANT ALL ON takussan_${ENV_NAME}.* TO 'takussan_${ENV_NAME:0:3}'@'localhost'; FLUSH PRIVILEGES\""
log ""
log "  2. Add SSH GitHub Deploy Key for $DEPLOY_USER:"
log "       sudo -iu $DEPLOY_USER ssh-keygen -t ed25519 -f ~/.ssh/takussan_deploy -N ''"
log "       cat ~deploy/.ssh/takussan_deploy.pub  # → GitHub repo Settings → Deploy keys"
log "       Add SSH config alias 'github.com-takussan' in ~deploy/.ssh/config"
log ""
log "  3. Configure Nginx vhost (root: $APP_DIR/current/public)"
log "     and run certbot for SSL."
log ""
log "  4. Add GitHub Actions secrets: CONTABO_HOST, CONTABO_USER, CONTABO_SSH_KEY,"
log "     REPO_URL, ENV_FILE_PREVIEW."
log ""
log "  5. Push to branch 'preview' → workflow deploys automatically."
