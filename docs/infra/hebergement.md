# Hébergement — le relevé du serveur et le runbook

> Décision : [ADR-0028](../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Plan :
> [2026-09-13-auto-hebergement-vps-dokploy](../plans/2026-09-13-auto-hebergement-vps-dokploy.md).
> Ce document RELÈVE ce qui vit dans Dokploy et que le dépôt ne contrôle pas. Il ne porte **aucune
> valeur secrète** : les valeurs sont dans Dokploy et dans le gestionnaire de mots de passe.

## Ce qui sert quoi

| Hôte | Service Dokploy | Image | Relevé le |
|---|---|---|---|
| `preview.api.takussan.com` | Compose `takussan-api-preview`, service `api:8080` | `ghcr.io/thiambara/takussan-api:preview` | *non mesuré* |
| `preview.takussan.com` | Application `takussan-web-preview` | `ghcr.io/thiambara/takussan-web:preview` | *non mesuré* |
| `preview.api.checkprintplus.com` | Compose `cpp-api-preview`, service `api:8080` | `ghcr.io/thiambara/check-print-plus-api:preview` | *non mesuré* |
| `preview.checkprintplus.com` | Application `cpp-web-preview` | `ghcr.io/thiambara/check-print-plus-web:preview` | *non mesuré* |
| `deploy.takussan.com` | l'interface de Dokploy | — | *non mesuré* |

La production s'ajoute à ce tableau en phase F du plan. D'ici là, `www.takussan.com` reste servi par
Vercel ([ADR-0017](../adr/0017-deploiement-du-front-pilote-par-vercel.md), [relevé](frontend-deploiement.md)).

## Ce que le dépôt porte

| Fichier | Rôle |
|---|---|
| `takussan-api/Dockerfile`, `takussan-api/docker/` | l'image de l'API — `api`, workers, planificateur, `release` et `seed` |
| `takussan-web/Dockerfile` | l'image du front, **une par environnement** (`NEXT_PUBLIC_*` est inliné au build) |
| `deploy/takussan/compose.api.yml` | la pile d'API d'un environnement, déclarée dans Dokploy |
| `deploy/server/compose.data.yml` | Meilisearch et les deux Redis, partagés par les deux projets |
| `deploy/server/bootstrap.sh` | la préparation d'un Ubuntu 24.04 vierge |
| `.github/workflows/images.yml` | construit, pousse sur GHCR, déclenche Dokploy, **prouve** par `X-Build-Sha` |
| `deploy/takussan/smoke-api.sh`, `deploy/takussan/smoke-web.sh` | les tests de fumée locaux des images |

## Le relevé de Dokploy

| Élément | Valeur | Relevé le | Commande |
|---|---|---|---|
| Version de Dokploy | *non mesuré* | | `docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` |
| Hôte interne PostgreSQL | *non mesuré* | | page du service `postgres` dans Dokploy |
| Hôte interne MySQL | *non mesuré* | | page du service `mysql` |
| Plages Cloudflare dans `traefik.yml` | *non mesuré* | | `curl -s https://www.cloudflare.com/ips-v4` puis comparer au fichier |
| Sous-réseau de `dokploy-network` | *non mesuré* | | `docker network inspect dokploy-network -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'` |
| Sauvegardes planifiées | *non mesuré* | | onglet Backups de chaque service Database |
| Sauvegarde de la configuration de Dokploy | *non mesuré* | | Settings → Backups |

### Les variables d'environnement, par service — les CLÉS, jamais les valeurs

La table de référence est celle du plan, tâche D1. Toute clé ajoutée dans Dokploy s'ajoute ici.

## Runbook

**Tester une image en local, avant de pousser** :

```bash
docker build --build-arg BUILD_SHA=smoke --target runtime -t ghcr.io/thiambara/takussan-api:local takussan-api
docker build --build-arg BUILD_SHA=smoke --target seed -t ghcr.io/thiambara/takussan-api:local-seed takussan-api
deploy/takussan/smoke-api.sh image      # l'image seule
deploy/takussan/smoke-api.sh pile       # la pile Compose, contre les services de docker-compose.yml
deploy/takussan/smoke-web.sh            # l'image du front (exige ./dev.sh api)
```

**Redéployer** : pousser sur `preview` (ou `workflow_dispatch` de *Images et déploiement*). Le
workflow n'est vert que lorsque `X-Build-Sha` rend le commit.

**Revenir en arrière** : Dokploy → Compose de l'API → Environment → `IMAGE_TAG=sha-<commit>` →
*Deploy*. Front : Application → image `…:preview-sha-<commit>` → *Deploy*. ⚠ Une migration déjà
jouée ne se défait pas par un retour d'image : la revenir d'abord (`php artisan migrate:rollback`
dans un conteneur `release`) ou avancer par un correctif.

**Remettre une préproduction à zéro (seed)** :

```bash
ssh root@178.18.247.62
cd "$(dirname "$(find /etc/dokploy/compose -path '*takussan-api-preview*/deploy/takussan/compose.api.yml')")"
docker compose -p "$(basename "$(dirname "$(dirname "$(dirname "$PWD")")")")" -f compose.api.yml --profile seed run --rm seed
```

Le chemin et le nom de projet Compose sont ceux relevés en D4 ; si Dokploy les range autrement,
c'est le relevé qui fait foi, et cette commande se corrige ici.

**Restaurer une base** : Dokploy → service Database → Backups → *Restore*, depuis R2. La procédure
a été jouée à blanc en D6 ; ses comptes de lignes sont dans le ticket D.

**Reconstruire le serveur** : plan, tâches A2 → A5, puis D1 (déclarer les services depuis ce relevé),
puis restaurer les bases depuis R2.

**Mettre Dokploy à jour** : Settings → *Update*, après avoir lu les notes de version. Relever la
nouvelle version ici.

## Ce que Caddy reprend de l'ancien vhost nginx

| nginx (`scripts/server-setup.sh`, retiré) | `takussan-api/docker/Caddyfile` |
|---|---|
| `client_max_body_size 25M` | `@trop_gros` sur `Content-Length` → `413`, plus `request_body { max_size 25MiB }` pour le corps lu. ⚠ Un envoi chunked (sans `Content-Length`) est borné sans `413`. |
| `gzip on; gzip_min_length 1024` (JSON compris) | `encode zstd gzip { minimum_length 1024 }` |
| `location /storage/ { … max-age=604800, stale-while-revalidate=86400 }` | `@storage` + `header` — **sans** `immutable` |
| `location ~ /\.(?!well-known) { deny all; }` | `@cache_hidden` → `respond 404` |
| `fastcgi_read_timeout 60` | `max_execution_time = 60` (`docker/php.ini`) |

## Ce qui n'est pas mesurable depuis le dépôt

L'état réel de Dokploy (services, domaines, variables) ; le mode SSL et les règles de la zone
Cloudflare ; le contenu du seau R2. Ce relevé les date ; il ne les garantit pas.
