#!/usr/bin/env bash
#
# server-setup.sh — One-time server setup for Takussan (Ubuntu 24.04)
#
# Run as root or with sudo on the Contabo server.
# Creates the deploy user, directory structure for production and preview,
# and installs the deploy script.
#

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
APP_DIR="/var/www/takussan"
PREVIEW_DIR="/var/www/takussan-preview"
DEPLOY_USER="deploy"
WEB_GROUP="www-data"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Helpers ──────────────────────────────────────────────────────────────────
log() {
    echo "[setup] $*"
}

setup_app_directories() {
    local dir="$1"
    log "Creating directory structure under ${dir}..."

    mkdir -p "${dir}/releases"
    mkdir -p "${dir}/shared/storage/app/public"
    mkdir -p "${dir}/shared/storage/framework/cache/data"
    mkdir -p "${dir}/shared/storage/framework/sessions"
    mkdir -p "${dir}/shared/storage/framework/views"
    mkdir -p "${dir}/shared/storage/logs"

    log "Setting ownership to ${DEPLOY_USER}:${WEB_GROUP} for ${dir}..."
    chown -R "${DEPLOY_USER}:${WEB_GROUP}" "${dir}"

    log "Setting permissions 775 on ${dir}/shared/storage..."
    chmod -R 775 "${dir}/shared/storage"
}

install_deploy_script() {
    local dest_dir="$1"
    local deploy_src="${SCRIPT_DIR}/deploy.sh"
    local deploy_dest="${dest_dir}/deploy.sh"

    if [ ! -f "${deploy_src}" ]; then
        log "WARNING: deploy.sh not found at ${deploy_src}. Skipping copy."
        log "         You will need to manually copy deploy.sh to ${deploy_dest}."
    else
        log "Copying deploy.sh to ${deploy_dest}..."
        cp "${deploy_src}" "${deploy_dest}"
        chmod +x "${deploy_dest}"
        chown "${DEPLOY_USER}:${WEB_GROUP}" "${deploy_dest}"
        log "deploy.sh installed at ${deploy_dest}."
    fi
}

setup_queue_service() {
    local name="$1"
    local app_dir="$2"
    local service_file="/etc/systemd/system/${name}.service"

    if [ -f "${service_file}" ]; then
        log "Queue worker service ${name} already exists, updating..."
    fi

    log "Creating queue worker systemd service ${name}..."
    cat > "${service_file}" <<UNIT
[Unit]
Description=Takussan Queue Worker (${name})
After=network.target mysql.service

[Service]
User=${DEPLOY_USER}
Group=${WEB_GROUP}
WorkingDirectory=${app_dir}/current
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5
StandardOutput=append:${app_dir}/shared/storage/logs/queue-worker.log
StandardError=append:${app_dir}/shared/storage/logs/queue-worker.log

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    systemctl enable "${name}"
    # Start only if a release is already deployed — otherwise systemd would
    # immediately fail (WorkingDirectory=current/ doesn't exist on first run).
    if [ -d "${app_dir}/current" ]; then
        systemctl restart "${name}"
        log "Queue worker service ${name} installed and (re)started."
    else
        log "Queue worker service ${name} installed and enabled."
        log "  (Will start automatically after the first successful deploy creates ${app_dir}/current.)"
    fi
}

# ─── Root check ───────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root or with sudo." >&2
    exit 1
fi

# ─── Step 1: Create deploy user ──────────────────────────────────────────────
if id "${DEPLOY_USER}" &>/dev/null; then
    log "User '${DEPLOY_USER}' already exists, skipping creation."
else
    log "Creating user '${DEPLOY_USER}'..."
    adduser --disabled-password --gecos "Deploy user for Takussan" "${DEPLOY_USER}"
fi

if id -nG "${DEPLOY_USER}" | grep -qw "${WEB_GROUP}"; then
    log "User '${DEPLOY_USER}' is already in group '${WEB_GROUP}'."
else
    log "Adding '${DEPLOY_USER}' to group '${WEB_GROUP}'..."
    usermod -aG "${WEB_GROUP}" "${DEPLOY_USER}"
fi

# ─── Step 2: Create directory structures (production + preview) ──────────────
setup_app_directories "${APP_DIR}"
setup_app_directories "${PREVIEW_DIR}"

# ─── Step 3: Install deploy script (production + preview) ────────────────────
install_deploy_script "${APP_DIR}"
install_deploy_script "${PREVIEW_DIR}"

# ─── Step 4: Set up SSH directory for deploy user ─────────────────────────────
DEPLOY_HOME=$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)
SSH_DIR="${DEPLOY_HOME}/.ssh"

if [ ! -d "${SSH_DIR}" ]; then
    log "Creating ${SSH_DIR} for authorized_keys..."
    mkdir -p "${SSH_DIR}"
    chmod 700 "${SSH_DIR}"
    touch "${SSH_DIR}/authorized_keys"
    chmod 600 "${SSH_DIR}/authorized_keys"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${SSH_DIR}"
fi

# ─── Step 5: Setup Laravel scheduler crons ────────────────────────────────────
CRON_PROD="* * * * * cd ${APP_DIR}/current && php artisan schedule:run >> /dev/null 2>&1"
CRON_PREVIEW="* * * * * cd ${PREVIEW_DIR}/current && php artisan schedule:run >> /dev/null 2>&1"

EXISTING_CRON=$(crontab -u "${DEPLOY_USER}" -l 2>/dev/null || true)

if echo "${EXISTING_CRON}" | grep -qF "${APP_DIR}/current"; then
    log "Production scheduler cron already exists, skipping."
else
    log "Adding production scheduler cron..."
    (echo "${EXISTING_CRON}"; echo "${CRON_PROD}") | crontab -u "${DEPLOY_USER}" -
fi

EXISTING_CRON=$(crontab -u "${DEPLOY_USER}" -l 2>/dev/null || true)

if echo "${EXISTING_CRON}" | grep -qF "${PREVIEW_DIR}/current"; then
    log "Preview scheduler cron already exists, skipping."
else
    log "Adding preview scheduler cron..."
    (echo "${EXISTING_CRON}"; echo "${CRON_PREVIEW}") | crontab -u "${DEPLOY_USER}" -
fi

log "Cron jobs installed: schedule:run every minute for production and preview."

# ─── Step 6: Setup Laravel queue worker services ─────────────────────────────
setup_queue_service "takussan-queue" "${APP_DIR}"
setup_queue_service "takussan-queue-preview" "${PREVIEW_DIR}"

# ─── Done ─────────────────────────────────────────────────────────────────────
log ""
log "============================================"
log "  Server setup complete!"
log "============================================"
log ""
log "Next steps:"
log ""
log "  1. Copy your .env files to the shared directories:"
log "     # Production"
log "     cp /path/to/your/.env ${APP_DIR}/shared/.env"
log "     chown ${DEPLOY_USER}:${WEB_GROUP} ${APP_DIR}/shared/.env"
log "     chmod 640 ${APP_DIR}/shared/.env"
log "     # Preview"
log "     cp /path/to/your/preview.env ${PREVIEW_DIR}/shared/.env"
log "     chown ${DEPLOY_USER}:${WEB_GROUP} ${PREVIEW_DIR}/shared/.env"
log "     chmod 640 ${PREVIEW_DIR}/shared/.env"
log ""
log "  2. Copy existing storage/ to shared/storage/ (if migrating):"
log "     cp -a /path/to/existing/storage/* ${APP_DIR}/shared/storage/"
log "     chown -R ${DEPLOY_USER}:${WEB_GROUP} ${APP_DIR}/shared/storage"
log "     chmod -R 775 ${APP_DIR}/shared/storage"
log ""
log "  3. Generate an SSH key on the server for GitHub Deploy Key:"
log "     su - ${DEPLOY_USER}"
log "     ssh-keygen -t ed25519 -C \"takussan-deploy-key\" -f ~/.ssh/github_deploy"
log "     cat ~/.ssh/github_deploy.pub"
log "     -> Add this as a Deploy Key in GitHub repo Settings > Deploy Keys"
log ""
log "  4. Generate an SSH key for GitHub Actions to connect to this server:"
log "     ssh-keygen -t ed25519 -C \"github-actions\" -f /tmp/github_actions_key"
log "     cat /tmp/github_actions_key.pub >> ${SSH_DIR}/authorized_keys"
log "     cat /tmp/github_actions_key"
log "     -> Save the private key for the next step, then remove: rm /tmp/github_actions_key*"
log ""
log "  5. Add these GitHub Secrets (repo Settings > Secrets and variables > Actions):"
log "     CONTABO_HOST       — Server IP or hostname"
log "     CONTABO_USER       — ${DEPLOY_USER}"
log "     CONTABO_SSH_KEY    — Private key from step 4"
log "     REPO_URL           — git@github.com:<org>/<repo>.git"
log "     ENV_FILE           — Production .env contents"
log "     ENV_FILE_PREVIEW   — Preview .env contents"
log ""
log "  6. Configure Nginx vhosts and reload:"
log "     # Production:  root ${APP_DIR}/current/public;"
log "     # Preview:     root ${PREVIEW_DIR}/current/public;"
log "     #              server_name preview.api.takussan.com;"
log "     sudo nginx -t && sudo systemctl reload nginx"
log ""
log "  7. Add Cloudflare DNS A record:"
log "     preview.api -> server IP (Proxied)"
log ""
log "  8. SSL certificates:"
log "     sudo certbot --nginx -d preview.api.takussan.com"
log ""
