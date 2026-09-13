# Image de l'API Takussan (ADR-0028 §3-4). UNE image par commit, qui sert la préproduction ET la
# production : aucune configuration n'y est cuite, tout arrive par l'environnement du conteneur.
#
#   runtime — api, worker, worker-media, scheduler et release : même image, commandes différentes
#   seed    — runtime + dépendances de dev, pour `db:seed` (Faker en est une, TCK-353)
#
# Pas de HEALTHCHECK ici : worker et scheduler n'écoutent aucun port, une sonde HTTP d'image les
# déclarerait tous malades. La sonde vit sur le seul service `api` (deploy/takussan/compose.api.yml).
#
# Pas de directive `# syntax=` : le frontend intégré à BuildKit suffit à ce fichier, et la directive
# ajoute à CHAQUE build une requête vers Docker Hub — trois builds tombés sur un délai dépassé le
# 2026-09-13, avant la première ligne de ce fichier.
# Épinglé sur la version lue le 2026-09-13 : `frankenphp version` → FrankenPHP v1.12.7, PHP 8.4.25.
ARG FRANKENPHP_TAG=1.12.7-php8.4-bookworm

FROM dunglas/frankenphp:${FRANKENPHP_TAG} AS base
# Les extensions de la CI (api-ci.yml), plus redis (REDIS_CLIENT=phpredis), exif (medialibrary),
# pcntl (arrêt propre de queue:work) et opcache.
RUN install-php-extensions pdo_pgsql pgsql redis intl bcmath gd zip exif pcntl opcache \
 && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
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
RUN mkdir -p storage/app/private storage/app/public storage/framework/cache/data \
      storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
 && composer dump-autoload --no-dev --optimize --no-scripts \
 && php artisan package:discover --ansi \
 && php artisan storage:link \
 && find config/scout.php app/Support/Search lang/fr/properties.php \
      $(grep -rl toSearchableArray app/Models) -type f \
      | sort | xargs sha256sum | sha256sum | cut -d' ' -f1 > .search-shape \
 && chmod 755 docker/*.sh \
 && chown -R www-data:www-data storage bootstrap/cache /data/caddy /config/caddy
USER www-data
EXPOSE 8080
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
