# Image de l'API Takussan (ADR-0028 §3-4). UNE image par commit, qui sert la préproduction ET la
# production : aucune configuration n'y est cuite, tout arrive par l'environnement du conteneur.
#
#   runtime — api, worker, worker-media, scheduler et release : même image, commandes différentes
#   seed    — runtime + dépendances de dev, pour `db:seed` (Faker en est une, TCK-353)
#
# Aucune sonde d'image (HEALTHCHECK NONE, plus bas) : worker et scheduler n'écoutent aucun port, une
# sonde HTTP d'image les déclarerait tous malades. La sonde vit sur le seul service `api`
# (deploy/takussan/compose.api.yml).
#
# Pas de directive `# syntax=` : le frontend intégré à BuildKit suffit à ce fichier, et la directive
# ajoute à CHAQUE build une requête vers Docker Hub — trois builds tombés sur un délai dépassé le
# 2026-09-13, avant la première ligne de ce fichier.
# Épinglé sur la version lue le 2026-09-13 : `frankenphp version` → FrankenPHP v1.12.7, PHP 8.4.25.
ARG FRANKENPHP_TAG=1.12.7-php8.4-bookworm

FROM dunglas/frankenphp:${FRANKENPHP_TAG} AS base
# Les extensions de la CI (api-ci.yml), plus exif (medialibrary), pcntl (arrêt propre de
# queue:work) et opcache. redis vient juste après, hors d'install-php-extensions.
RUN install-php-extensions pdo_pgsql pgsql intl bcmath gd zip exif pcntl opcache \
 && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
# redis (REDIS_CLIENT=phpredis), construit depuis la source de GitHub et non de pecl.php.net : ses
# 504 ont fait tomber « Image de l'API » trois fois le 2026-10-21 (#858, #876, #916), une panne
# extérieure qui consommait les réparations des agents. Même montage que l'archive PECL que posait
# install-php-extensions, relevé sur l'image déployée (sha-8745592ad) : liblzf embarquée — le
# sous-module de phpredis 6.3.0, que l'archive de GitHub n'inclut pas —, zstd et lz4 liées au
# système ; `php -m` identique. Les deux archives sont vérifiées par leur empreinte.
ARG PHPREDIS_VERSION=6.3.0
ARG PHPREDIS_SHA256=cb8f81df1a275599e4f8ddcfec7e1f65ed1953e6f5673649149fd680ebff4cad
ARG LIBLZF_COMMIT=fb25820c3c0aeafd127956ae6c115063b47e459a
ARG LIBLZF_SHA256=8e425b5bf7a569543e29cb4a16a913445d80c4efe83b371760ca798ca9b819ed
RUN apt-get update \
 && apt-get install -y --no-install-recommends libzstd-dev liblz4-dev \
 && curl -fsSL "https://codeload.github.com/phpredis/phpredis/tar.gz/refs/tags/${PHPREDIS_VERSION}" -o /tmp/phpredis.tgz \
 && curl -fsSL "https://codeload.github.com/nemequ/liblzf/tar.gz/${LIBLZF_COMMIT}" -o /tmp/liblzf.tgz \
 && printf '%s  %s\n' "$PHPREDIS_SHA256" /tmp/phpredis.tgz "$LIBLZF_SHA256" /tmp/liblzf.tgz | sha256sum -c - \
 && docker-php-source extract \
 && mkdir -p /usr/src/php/ext/redis/liblzf \
 && tar -xzf /tmp/phpredis.tgz --strip-components=1 -C /usr/src/php/ext/redis \
 && tar -xzf /tmp/liblzf.tgz --strip-components=1 -C /usr/src/php/ext/redis/liblzf \
 && docker-php-ext-configure redis --enable-redis-lzf --enable-redis-zstd --with-libzstd=/usr --enable-redis-lz4 --with-liblz4=/usr \
 && docker-php-ext-install -j"$(nproc)" redis \
 && docker-php-source delete \
 && apt-mark manual libzstd1 liblz4-1 \
 && apt-get purge -y libzstd-dev liblz4-dev && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /tmp/phpredis.tgz /tmp/liblzf.tgz
COPY docker/php.ini "$PHP_INI_DIR/conf.d/zz-takussan.ini"
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app

# ── dépendances PHP de production ─────────────────────────────────────────────────────────
FROM base AS vendor
COPY composer.json composer.lock ./
# check-platform-reqs AVANT l'install, comme deploy.sh : une extension manquante se nomme ici,
# pas dans une erreur d'autoload au premier appel.
RUN composer check-platform-reqs --lock --no-dev \
 && composer install --no-dev --no-scripts --no-autoloader --no-interaction --prefer-dist

FROM base AS vendor-dev
COPY composer.json composer.lock ./
RUN composer install --no-scripts --no-autoloader --no-interaction --prefer-dist

# ── assets Vite : welcome.blade.php les charge par @vite ──────────────────────────────────
# resources/css/app.css balaie des vues de vendor/ (@source) : vendor doit être là.
FROM node:24-bookworm-slim AS assets
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
COPY --from=vendor /app/vendor ./vendor
RUN npm run build

# ── image servie ──────────────────────────────────────────────────────────────────────────
FROM base AS runtime
# `sha256sum | sha256sum | cut` plus bas : sans pipefail, un `sha256sum` qui échoue laisserait une
# empreinte vide et une image « valide » qui réimporterait la recherche à chaque déploiement.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG BUILD_SHA=inconnu
ENV BUILD_SHA=${BUILD_SHA}
COPY . .
COPY --from=vendor /app/vendor ./vendor
COPY --from=assets /app/public/build ./public/build
COPY docker/Caddyfile /etc/frankenphp/Caddyfile
# `storage/` n'entre pas dans le contexte (.dockerignore) : on recrée son squelette. Le volume
# nommé `storage` (compose.api.yml) est initialisé depuis ce contenu au premier montage.
# L'empreinte .search-shape couvre tout ce qui façonne un document indexé : la règle de deploy.sh
# (config/scout.php, les modèles Searchable, app/Support/Search, lang/fr/properties.php — TCK-506).
# /config/psysh : `artisan tinker` y écrit ($XDG_CONFIG_HOME vaut /config dans l'image de base, et
# /config appartient à root) — sans lui, tinker meurt sous www-data.
# SC2046 : le `$(grep -rl …)` est VOULU non quoté — c'est une liste de fichiers, un par mot, la
# même règle que `modeles_indexes()` de docker/lib.sh ; aucun chemin du dépôt ne porte d'espace.
# hadolint ignore=SC2046
RUN mkdir -p storage/app/private storage/app/public storage/framework/cache/data \
      storage/framework/sessions storage/framework/views storage/logs bootstrap/cache /config/psysh \
 && composer dump-autoload --no-dev --optimize --no-scripts \
 && php artisan package:discover --ansi \
 && php artisan storage:link \
 && find config/scout.php app/Support/Search lang/fr/properties.php \
      $(grep -rl toSearchableArray app/Models) -type f \
      | sort | xargs sha256sum | sha256sum | cut -d' ' -f1 > .search-shape \
 && chmod 755 docker/*.sh \
 && chown -R www-data:www-data storage bootstrap/cache /data/caddy /config/caddy /config/psysh
USER www-data
EXPOSE 8080
# L'image de base porte `HEALTHCHECK curl -f http://localhost:2019/metrics` : l'API d'admin de
# Caddy, que le Caddyfile coupe (`admin off`). Héritée, elle déclarait worker, worker-media et
# scheduler malades (mesuré le 2026-09-13 : `container takussan-smoke-worker-media-1 is unhealthy`).
HEALTHCHECK NONE
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]

# ── seed d'une préproduction ──────────────────────────────────────────────────────────────
FROM runtime AS seed
USER root
COPY --from=vendor-dev /app/vendor ./vendor
RUN composer dump-autoload --optimize --no-scripts \
 && php artisan package:discover --ansi \
 && chown -R www-data:www-data bootstrap/cache
USER www-data
