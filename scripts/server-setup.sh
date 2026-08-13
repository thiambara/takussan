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

setup_github_known_hosts() {
    local ssh_dir="$1"
    local known_hosts="${ssh_dir}/known_hosts"

    # Official GitHub ED25519 fingerprint (rotated 2023-03-24 after the
    # exposure incident). Verify against
    # https://docs.github.com/en/authentication/keys-to-remember-when-using-ssh
    local expected_ed25519_fp="SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"

    if [ -f "${known_hosts}" ] && grep -q "^github\.com " "${known_hosts}"; then
        log "GitHub host keys already in ${known_hosts}, skipping."
        return
    fi

    log "Fetching GitHub SSH host keys via ssh-keyscan..."
    local tmpfile
    tmpfile=$(mktemp)

    if ! ssh-keyscan -t ed25519,ecdsa,rsa github.com > "${tmpfile}" 2>/dev/null; then
        log "WARNING: ssh-keyscan github.com failed (network issue?). Skipping."
        rm -f "${tmpfile}"
        return
    fi

    # Defense against MITM during setup: verify the ED25519 fingerprint
    # matches the value GitHub publishes.
    local actual_fp
    actual_fp=$(ssh-keygen -lf "${tmpfile}" 2>/dev/null | awk '/ED25519/{print $2}')

    if [ "${actual_fp}" != "${expected_ed25519_fp}" ]; then
        log "ERROR: GitHub ED25519 fingerprint mismatch — refusing to trust."
        log "  Expected: ${expected_ed25519_fp}"
        log "  Got:      ${actual_fp:-<none>}"
        log "  Check https://docs.github.com/en/authentication/keys-to-remember-when-using-ssh"
        log "  (GitHub may have rotated its host keys — update expected_ed25519_fp.)"
        rm -f "${tmpfile}"
        return 1
    fi

    cat "${tmpfile}" >> "${known_hosts}"
    rm -f "${tmpfile}"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "${known_hosts}"
    chmod 644 "${known_hosts}"
    log "GitHub host keys added to ${known_hosts} (ED25519 fingerprint verified)."
}

setup_php_fpm_pool() {
    local name="$1"
    local socket_name="$2"
    local max_children="$3"
    local min_spare="$4"
    local max_spare="$5"

    local php_version
    php_version=$(php -v 2>/dev/null | awk '/^PHP/{print $2}' | cut -d. -f1,2)

    if [ -z "${php_version}" ]; then
        log "WARNING: PHP not found in PATH. Skipping pool ${name}."
        log "         Install PHP first, then re-run this script."
        return
    fi

    local pool_dir="/etc/php/${php_version}/fpm/pool.d"
    local pool_file="${pool_dir}/${name}.conf"

    if [ ! -d "${pool_dir}" ]; then
        log "WARNING: ${pool_dir} does not exist. Is php${php_version}-fpm installed?"
        log "         apt install php${php_version}-fpm, then re-run this script."
        return
    fi

    # Pin the detected PHP version so deploy.sh knows which FPM unit to reload
    # after the symlink swap (opcache clear).
    if [ ! -d /etc/takussan ]; then
        mkdir -p /etc/takussan
        chmod 755 /etc/takussan
    fi
    echo "${php_version}" > /etc/takussan/php-version
    chmod 644 /etc/takussan/php-version

    if [ -f "${pool_file}" ]; then
        log "PHP-FPM pool ${name} already exists, updating..."
    else
        log "Creating PHP-FPM pool ${name} (PHP ${php_version})..."
    fi

    cat > "${pool_file}" <<POOL
[${name}]
user = ${DEPLOY_USER}
group = ${WEB_GROUP}
listen = /run/php/${socket_name}.sock
listen.owner = ${WEB_GROUP}
listen.group = ${WEB_GROUP}
listen.mode = 0660

pm = dynamic
pm.max_children = ${max_children}
pm.start_servers = 2
pm.min_spare_servers = ${min_spare}
pm.max_spare_servers = ${max_spare}
pm.max_requests = 500

php_admin_value[memory_limit] = 256M
php_admin_value[upload_max_filesize] = 25M
php_admin_value[post_max_size] = 30M
POOL

    PHP_FPM_VERSION="${php_version}"
    PHP_FPM_NEEDS_RELOAD=1
    log "Pool ${name} written to ${pool_file}."
}

setup_nginx_vhost() {
    local name="$1"         # e.g. api.takussan.com or preview.api.takussan.com
    local app_dir="$2"      # /var/www/takussan or /var/www/takussan-preview
    local socket_name="$3"  # takussan or takussan-preview
    local server_name="$4"  # api.takussan.com or preview.api.takussan.com

    local sites_available="/etc/nginx/sites-available"
    local sites_enabled="/etc/nginx/sites-enabled"

    if [ ! -d "${sites_available}" ]; then
        log "WARNING: ${sites_available} not found. Is nginx installed?"
        log "         apt install nginx, then re-run this script."
        return
    fi

    local vhost_file="${sites_available}/${name}"

    if [ -f "${vhost_file}" ]; then
        log "Nginx vhost ${name} already exists, updating..."
    else
        log "Creating nginx vhost ${name} (${server_name})..."
    fi

    # HTTP-only vhost. Certbot --nginx will add the 443 server block and a
    # 301 redirect on first run (see Next steps below).
    cat > "${vhost_file}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    root ${app_dir}/current/public;
    index index.php;

    client_max_body_size 25M;

    access_log /var/log/nginx/${name}.access.log;
    error_log  /var/log/nginx/${name}.error.log;

    location /storage/ {
        alias ${app_dir}/shared/storage/app/public/;
        expires 7d;
    }

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/${socket_name}.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_read_timeout 60;
    }

    # Allow Let's Encrypt HTTP-01 challenges; deny everything else dotted.
    location ~ /\.(?!well-known) { deny all; }
}
NGINX

    ln -sf "${vhost_file}" "${sites_enabled}/${name}"
    NGINX_NEEDS_RELOAD=1
    log "Vhost ${name} written to ${vhost_file} and enabled."
}

setup_deploy_sudoers() {
    local php_version="$1"
    local sudoers_file="/etc/sudoers.d/takussan-deploy"

    if [ -z "${php_version}" ]; then
        log "WARNING: PHP version unknown, skipping sudoers setup."
        log "         deploy.sh will not be able to reload php-fpm after deploys."
        return
    fi

    # ⚠ LES QUATRE unités, pas deux. sudoers compare les chaînes de commande à l'IDENTIQUE :
    # après le passage à deux workers par application, l'alias n'en listait que la moitié, et
    # l'opérateur se voyait refuser le redémarrage des workers de fond. Toute unité ajoutée par
    # `setup_queue_service` doit apparaître ici.
    #
    # ⚠⚠ Cette explication vit DANS LE SCRIPT et non dans le heredoc ci-dessous, et ce n'est pas
    # une question de goût. Le heredoc n'est pas quoté — il doit l'être, pour interpoler
    # `${DEPLOY_USER}` et `${php_version}` — donc bash y exécute aussi les backticks. Un
    # `\`setup_queue_service\`` écrit dans un commentaire du heredoc INVOQUAIT réellement la
    # fonction, EN ROOT, et supprimait le mot du fichier écrit. Reproduit.
    #
    # *Un heredoc non quoté n'est pas un bloc de texte : c'est du code, y compris dans ce qui
    # ressemble à un commentaire.* `scripts/check-heredocs.mjs` le vérifie désormais.
    log "Writing sudoers entry at ${sudoers_file}..."
    cat > "${sudoers_file}" <<SUDO
# Takussan — allow deploy user to reload php-fpm/nginx + restart queue workers
# LES QUATRE unites : sudoers compare les chaines de commande a l'identique.
# Toute unite ajoutee par setup_queue_service (cf. scripts/server-setup.sh) doit figurer ici.
# without password. Needed by scripts/deploy.sh post-symlink-swap (opcache clear)
# and by the operator when (re)starting queue services after first deploy.
Cmnd_Alias TAKUSSAN_RELOAD = /bin/systemctl reload php${php_version}-fpm, /bin/systemctl reload nginx, /bin/systemctl start takussan-queue, /bin/systemctl start takussan-queue-media, /bin/systemctl start takussan-queue-preview, /bin/systemctl start takussan-queue-preview-media, /bin/systemctl restart takussan-queue, /bin/systemctl restart takussan-queue-media, /bin/systemctl restart takussan-queue-preview, /bin/systemctl restart takussan-queue-preview-media, /bin/systemctl status takussan-queue, /bin/systemctl status takussan-queue-media, /bin/systemctl status takussan-queue-preview, /bin/systemctl status takussan-queue-preview-media
${DEPLOY_USER} ALL=(root) NOPASSWD: TAKUSSAN_RELOAD
SUDO
    chmod 0440 "${sudoers_file}"

    # Validate syntax BEFORE the file is honored (broken sudoers bricks sudo).
    if ! visudo -c -f "${sudoers_file}" >/dev/null; then
        log "ERROR: visudo validation failed on ${sudoers_file}, removing."
        rm -f "${sudoers_file}"
        return 1
    fi
    log "Sudoers entry installed and validated."
}

setup_laravel_logrotate() {
    local logrotate_file="/etc/logrotate.d/takussan"

    if [ ! -d /etc/logrotate.d ]; then
        log "WARNING: /etc/logrotate.d does not exist. Skipping logrotate setup."
        return
    fi

    # `copytruncate` et NON `create` — et le commentaire d'origine expliquait pourquoi il ne
    # fallait pas s'en soucier, à tort.
    #
    # « Laravel re-opens log handles per request » vaut pour PHP-FPM, pas pour les workers de
    # file : ce sont des processus de LONGUE DURÉE (`--max-time=3600`) qui gardent leur
    # descripteur ouvert. Avec `create`, logrotate renomme le fichier et en crée un neuf ; les
    # workers continuent d'écrire dans le fichier renommé, et le journal vivant reste vide
    # jusqu'au prochain redémarrage. L'endroit où un opérateur regarde en premier est
    # exactement celui qui cesse d'être écrit.
    #
    # `copytruncate` copie puis tronque en place : le descripteur reste valide, aucun signal
    # n'est nécessaire, et PHP-FPM n'en souffre pas.
    #
    # *Un commentaire qui explique pourquoi une précaution est inutile mérite d'être relu quand
    # le type de processus change.*
    #
    # (Comme pour sudoers, cette prose reste HORS du heredoc : il n'est pas quoté, donc les
    # backticks y seraient exécutés.)
    log "Writing logrotate config at ${logrotate_file}..."
    cat > "${logrotate_file}" <<LOGROTATE
${APP_DIR}/shared/storage/logs/*.log
${PREVIEW_DIR}/shared/storage/logs/*.log
{
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    # copytruncate : cf. le commentaire de setup_laravel_logrotate dans scripts/server-setup.sh.
    copytruncate
    sharedscripts
}
LOGROTATE
    chmod 644 "${logrotate_file}"
    log "Logrotate config installed."
}

print_validation_summary() {
    local pass=0 fail=0 status label
    local php_version="${PHP_FPM_VERSION:-}"
    if [ -z "${php_version}" ] && [ -f /etc/takussan/php-version ]; then
        php_version=$(cat /etc/takussan/php-version)
    fi

    _vcheck() {
        # $1 = label, $2 = command (eval'd). PASS if exit code 0.
        label="$1"; shift
        if eval "$@" >/dev/null 2>&1; then
            log "  PASS  ${label}"
            pass=$((pass + 1))
        else
            log "  FAIL  ${label}"
            fail=$((fail + 1))
        fi
    }

    log ""
    log "=== Validation summary ==="

    _vcheck "deploy user exists" "id ${DEPLOY_USER}"
    _vcheck "deploy user in ${WEB_GROUP}" "id -nG ${DEPLOY_USER} | grep -qw ${WEB_GROUP}"
    _vcheck "${APP_DIR} exists" "[ -d ${APP_DIR} ]"
    _vcheck "${PREVIEW_DIR} exists" "[ -d ${PREVIEW_DIR} ]"
    _vcheck "/etc/takussan/php-version present (${php_version:-?})" "[ -s /etc/takussan/php-version ]"

    if [ -n "${php_version}" ]; then
        _vcheck "php${php_version}-fpm active" "systemctl is-active --quiet php${php_version}-fpm"
        _vcheck "/etc/php/${php_version}/fpm/pool.d/takussan.conf" "[ -f /etc/php/${php_version}/fpm/pool.d/takussan.conf ]"
        _vcheck "/etc/php/${php_version}/fpm/pool.d/takussan-preview.conf" "[ -f /etc/php/${php_version}/fpm/pool.d/takussan-preview.conf ]"
    fi

    _vcheck "/run/php/takussan.sock exists" "[ -S /run/php/takussan.sock ]"
    _vcheck "/run/php/takussan-preview.sock exists" "[ -S /run/php/takussan-preview.sock ]"

    _vcheck "nginx -t passes" "nginx -t"
    _vcheck "vhost api.takussan.com enabled" "[ -L /etc/nginx/sites-enabled/api.takussan.com ]"
    _vcheck "vhost preview.api.takussan.com enabled" "[ -L /etc/nginx/sites-enabled/preview.api.takussan.com ]"

    # Les QUATRE unités. Le résumé n'en validait que deux après le passage à deux workers par
    # application : un `systemctl enable` raté sur le worker de fond passait « tout vert », et
    # c'est justement celui qui porte le travail invisible.
    for _u in takussan-queue takussan-queue-media takussan-queue-preview takussan-queue-preview-media; do
        _vcheck "${_u} service enabled" "systemctl is-enabled --quiet ${_u}"
    done

    _vcheck "prod scheduler cron present" "crontab -u ${DEPLOY_USER} -l 2>/dev/null | grep -qF '${APP_DIR}/current'"
    _vcheck "preview scheduler cron present" "crontab -u ${DEPLOY_USER} -l 2>/dev/null | grep -qF '${PREVIEW_DIR}/current'"

    _vcheck "/etc/sudoers.d/takussan-deploy valid" "[ -f /etc/sudoers.d/takussan-deploy ] && visudo -c -f /etc/sudoers.d/takussan-deploy"
    _vcheck "/etc/logrotate.d/takussan present" "[ -f /etc/logrotate.d/takussan ]"

    local deploy_home
    deploy_home=$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)
    _vcheck "deploy known_hosts contains github.com" "grep -q '^github\\.com ' ${deploy_home}/.ssh/known_hosts"

    log ""
    log "=== Summary: ${pass} pass, ${fail} fail ==="
    if [ "${fail}" -gt 0 ]; then
        log "Some checks failed — review the log above and the FAIL lines."
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

    # `--queue` est OBLIGATOIRE, et son absence a été un défaut réel.
    #
    # Sans lui, `queue:work` ne consomme que la file `default`. Or le code pousse
    # explicitement sur trois files nommées — `onQueue('media')` (2 sites),
    # `onQueue('notifications-urgent')` (1 site), `onQueue('reconciliation')` (2 sites).
    # Leurs jobs s'empilaient donc indéfiniment dans la table `jobs` sans jamais être
    # exécutés : pas d'erreur, pas de timeout, pas d'alerte. L'API répondait 200, la
    # ligne partait en base, et l'effet attendu n'arrivait simplement jamais.
    #
    # Une file sans consommateur est le défaut le plus silencieux qui soit — il ne se
    # manifeste que par l'absence de quelque chose, et l'absence ne déclenche rien.
    #
    # Toute nouvelle file nommée doit être AJOUTÉE ICI — `scripts/check-queues.mjs` le
    # vérifie désormais, sur les deux consommateurs (cette unité et `dev.sh`).
    #
    # DEUX workers, et non un ordre de files — parce qu'aucun ordre ne convient.
    #
    # `Worker::getNextJob()` parcourt les files dans l'ordre et rend le PREMIER job trouvé :
    # une file n'est servie que si toutes celles qui la précèdent sont vides à cet instant.
    # Sur UN seul worker, tout ordre affame donc quelqu'un — et les deux ordres ont été essayés :
    #
    #   `…,default,media,reconciliation` → un import massif remplit `default`, et pendant une
    #     heure les photos restent sans filigrane et la réconciliation bancaire ne tourne pas ;
    #   `…,media,reconciliation,default` → `RegenerateAgencyWatermarksJob` parcourt TOUS les
    #     biens d'une agence et pousse deux jobs par média : une seule régénération met des
    #     milliers de jobs devant `default`, et ce sont les relances de facture, les digests,
    #     les purges RGPD et les exports qui s'arrêtent.
    #
    # Le commentaire de la première correction affirmait que `media` avait un « volume borné ».
    # C'était l'hypothèse qui rendait l'ordre acceptable, et elle est fausse : mesurée dans
    # `RegenerateAgencyWatermarksJob`, la file `media` est la plus volumineuse des quatre.
    #
    # *Quand deux ordres opposés produisent chacun une famine, ce n'est pas l'ordre qui est
    # mauvais : c'est l'idée qu'un seul consommateur puisse servir des files concurrentes.*
    #
    # D'où DEUX unités par application :
    #   · `${name}`        → `notifications-urgent,default` — l'interactif et le fourre-tout
    #   · `${name}-media`  → `media,reconciliation`        — le travail de fond, volumineux
    #
    # Aucune ne peut affamer l'autre : elles ne partagent aucune file. `check-queues.mjs` sait
    # lire plusieurs `queue:work` par consommateur et exige l'UNION — ce qui a été ajouté deux
    # revues plus tôt, précisément pour ce cas.
    #
    # Toute nouvelle file nommée doit être AJOUTÉE à l'une des deux, et la garde le vérifie.
    local files_worker="$3"   # littéral, passé par les appels en bas de ce fichier
    cat > "${service_file}" <<UNIT
[Unit]
Description=Takussan Queue Worker (${name})
After=network.target mysql.service

[Service]
User=${DEPLOY_USER}
Group=${WEB_GROUP}
WorkingDirectory=${app_dir}/current
# Les files servies par CE worker. Le second en sert d'autres — voir le commentaire du script.
ExecStart=/usr/bin/php artisan queue:work --queue=${files_worker} --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5
# Un journal PAR UNITÉ — pour la LISIBILITÉ, la rotation étant traitée ailleurs.
#
# Les deux workers d'une application écrivaient dans le même fichier : leurs lignes s'entrelaçaient
# et « pourquoi ce job n'est-il pas parti ? » exigeait de démêler deux flux. Un fichier par unité
# rend la question directe.
#
# ⚠ Le commentaire précédent invoquait ici la strophe logrotate « qui utilise create sans
# copytruncate » — alors que le MÊME commit venait de la passer à copytruncate. Il décrivait donc
# l'état qu'il supprimait, et un lecteur convaincu par lui aurait pu « réparer » la strophe en
# sens inverse, réintroduisant le journal vivant qui reste vide après rotation.
#
# *Un commentaire écrit pendant un changement décrit facilement le monde d'avant.*
StandardOutput=append:${app_dir}/shared/storage/logs/${name}.log
StandardError=append:${app_dir}/shared/storage/logs/${name}.log

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

# Pre-populate GitHub host keys so `git clone` and `ssh -T github.com-takussan`
# don't prompt the deploy user on first run.
setup_github_known_hosts "${SSH_DIR}"

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

# ─── Step 6: Setup PHP-FPM pools (production + preview) ──────────────────────
# Production pool — slightly higher worker count.
setup_php_fpm_pool "takussan"         "takussan"         10 2 4
# Preview pool — leaner.
setup_php_fpm_pool "takussan-preview" "takussan-preview" 5  1 3

if [ "${PHP_FPM_NEEDS_RELOAD:-0}" = "1" ] && [ -n "${PHP_FPM_VERSION:-}" ]; then
    log "Reloading php${PHP_FPM_VERSION}-fpm to pick up new pools..."
    systemctl reload "php${PHP_FPM_VERSION}-fpm"
fi

# ─── Step 7: Setup Nginx vhosts (production + preview) ───────────────────────
# Vhost filename = server_name (standard nginx convention).
setup_nginx_vhost "api.takussan.com"         "${APP_DIR}"     "takussan"         "api.takussan.com"
setup_nginx_vhost "preview.api.takussan.com" "${PREVIEW_DIR}" "takussan-preview" "preview.api.takussan.com"

if [ "${NGINX_NEEDS_RELOAD:-0}" = "1" ]; then
    log "Validating nginx config..."
    if nginx -t; then
        log "Reloading nginx..."
        systemctl reload nginx
    else
        log "ERROR: nginx -t failed — vhosts written but NOT reloaded."
        log "       Fix the config, then run: sudo nginx -t && sudo systemctl reload nginx"
        exit 1
    fi
fi

# ─── Step 8: Setup Laravel queue worker services ─────────────────────────────
# Deux workers par application : l'interactif + le fourre-tout d'un côté, le travail de fond
# volumineux de l'autre. Ils ne partagent aucune file, donc aucun ne peut affamer l'autre.
setup_queue_service "takussan-queue"               "${APP_DIR}"     "notifications-urgent,default"
setup_queue_service "takussan-queue-media"         "${APP_DIR}"     "media,reconciliation"
setup_queue_service "takussan-queue-preview"       "${PREVIEW_DIR}" "notifications-urgent,default"
setup_queue_service "takussan-queue-preview-media" "${PREVIEW_DIR}" "media,reconciliation"

# ─── Step 9: Sudoers entry for deploy user ────────────────────────────────────
# Allows deploy.sh to reload php-fpm post-symlink-swap (opcache clear) and
# lets the operator manage queue workers without typing the deploy password.
setup_deploy_sudoers "${PHP_FPM_VERSION:-}"

# ─── Step 10: Logrotate for Laravel logs ──────────────────────────────────────
setup_laravel_logrotate

# ─── Step 11: Validation summary ──────────────────────────────────────────────
print_validation_summary

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
log "  6. Add Cloudflare DNS A records (DNS only, gray cloud):"
log "     api          -> server IP   (prod)"
log "     preview.api  -> server IP   (preview)"
log ""
log "  7. SSL certificates (Certbot updates the vhosts to add 443 + redirect):"
log "     sudo certbot --nginx -d api.takussan.com"
log "     sudo certbot --nginx -d preview.api.takussan.com"
log "     sudo certbot renew --dry-run"
log ""
