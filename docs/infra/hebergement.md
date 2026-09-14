# Hébergement — le relevé du serveur et le runbook

> Décision : [ADR-0028](../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Plan :
> [2026-09-13-auto-hebergement-vps-dokploy](../plans/2026-09-13-auto-hebergement-vps-dokploy.md).
> Ce document RELÈVE ce qui vit dans Dokploy et que le dépôt ne contrôle pas. Il ne porte **aucune
> valeur secrète** : les valeurs sont dans Dokploy et dans le gestionnaire de mots de passe.

## Ce qui sert quoi

| Hôte | Service Dokploy | Image | Relevé le |
|---|---|---|---|
| `preview.api.takussan.com` | Compose `takussan-api-preview`, service `api:8080` — A en DNS seul | `ghcr.io/thiambara/takussan-api:preview` | 2026-09-14 : `/up` → `200`, `X-Build-Sha` = `preview`, Let's Encrypt |
| `preview.takussan.com` | Application `takussan-web-preview` — A proxifié (était un CNAME Vercel) | `ghcr.io/thiambara/takussan-web:preview` | 2026-09-14 : `401` sans authentification, `200` avec (la racine rend `307` vers `/fr`) ; `cf-ray`, aucun `x-vercel-id` ; plafond 384 Mio |
| `preview.api.checkprintplus.com` | Compose `cpp-api-preview`, service `api:8080` | `ghcr.io/thiambara/check-print-plus-api:preview` | déclaré, **non déployé** : attend le registre `ghcr.io` (jeton `read:packages`) |
| `preview.checkprintplus.com` | Application `cpp-web-preview` — encore un CNAME Vercel | `ghcr.io/thiambara/check-print-plus-web:preview` | déclaré, **non déployé**, DNS non basculé |
| `deploy.takussan.com` | l'interface de Dokploy — A proxifié, certificat d'origine Let's Encrypt | — | 2026-09-14 : `200`, `http` → `301` |

La production s'ajoute à ce tableau en phase F du plan. D'ici là, `www.takussan.com` reste servi par
Vercel ([ADR-0017](../adr/0017-deploiement-du-front-pilote-par-vercel.md), [relevé](frontend-deploiement.md)).

⚠ **Tant que Vercel construit une branche, `next.config.ts` doit rester constructible par Vercel.**
`output: 'standalone'`, dont l'image a besoin, casse l'adaptateur de Vercel (`ENOENT …
.next/next-server.js.nft.json`, mesuré le 2026-09-13) : il n'est donc actif que hors de Vercel
(`VERCEL=1` au build). La condition tombe en phase F, quand plus aucune branche ne passe par Vercel.

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

⚠ **Les images de Takussan sont publiques**, comme le dépôt : leur manifeste se lit avec un jeton
GHCR anonyme (`200` sur `api:preview`, `api:preview-seed` et `web:preview`, mesuré le 2026-09-14).
Rien de secret ne doit donc y entrer ; les valeurs vivent dans Dokploy. Celles de check-print-plus
sont privées, parce que ce dépôt-là l'est : c'est pour elles que Dokploy déclare le registre `ghcr.io`
avec un jeton `read:packages`.

Elles ne sont construites que pour `linux/amd64` : un poste arm64 ne les tire pas. L'audit se refait
donc sur le serveur, **en root** (sous l'utilisateur de l'image, `www-data` ou `node`, `find` ne voit
ni `/root` ni `/etc/ssl/private`) :

```bash
ssh root@178.18.247.62 'for i in takussan-api:preview takussan-api:preview-seed takussan-web:preview; do
  echo "== $i"; docker run --rm --pull always --user 0 --entrypoint find ghcr.io/thiambara/$i / -xdev \
    \( -name ".env*" -o -name "*.key" -o -name "*.pem" -o -name auth.json -o -name "id_rsa*" -o -name "id_ed25519*" \) \
    -not -path "/proc/*" -not -path "/sys/*" -not -path "/etc/ssl/certs/*" -not -path "*/vendor/*" -not -path "*/node_modules/*"
done'
```

Attendu, et relevé le 2026-09-14 : `/usr/lib/ssl/cert.pem` (le magasin public des autorités de
certification de Debian) pour les deux images de l'API, rien pour le front. Aucun `.env`, ni dans
`/app` ni ailleurs, et `Config.Env` ne porte que des variables d'outillage et `BUILD_SHA`.

## Le relevé de Dokploy

| Élément | Valeur | Relevé le | Commande |
|---|---|---|---|
| Version de Dokploy | `dokploy/dokploy:v0.30.6` | 2026-09-14 | `docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` |
| Version de Traefik | `traefik:v3.6.7` — un conteneur hors Swarm, `dokploy-traefik` | 2026-09-14 | `docker ps --filter name=dokploy-traefik --format '{{.Image}}'` |
| Hôte interne PostgreSQL | `serveur-postgres-egr6ii` — PostgreSQL 17.11, `pgvector/pgvector:pg17`, limite 1 Gio | 2026-09-14 | `docker service ls` (Dokploy suffixe le nom donné) |
| Hôte interne MySQL | `serveur-mysql-vsqugl` — MySQL 8.4.11, limite 640 Mio | 2026-09-14 | `docker service ls` |
| Meilisearch, Redis | `meilisearch:7700` (v1.16), `redis-takussan:6379`, `redis-cpp:6379` — Compose `donnees` du projet *Serveur*, sans port publié | 2026-09-14 | `docker ps --format '{{.Names}} {{.Image}}'` |
| Bases de préproduction | `takussan_preview` (`LOCALE C`, `CONNECT` révoqué à `PUBLIC`) ; `checkprintplus_preview` (`utf8mb4_unicode_ci` — Dokploy la crée en `utf8mb4_0900_ai_ci`, à corriger à chaque création) | 2026-09-14 | plan, tâche A4, étapes 9 et 10 |
| Plages Cloudflare dans `traefik.yml` | 15 plages v4 et 7 v6 du 2026-09-14, sous `web` **et** `websecure` | 2026-09-14 | `curl -s https://www.cloudflare.com/ips-v4` puis comparer au fichier |
| Sous-réseau de `dokploy-network` | `10.0.1.0/24` (overlay) — tête de `TRUSTED_PROXIES` | 2026-09-14 | `docker network inspect dokploy-network -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'` |
| IP du client jusqu'à Laravel | prouvée par ablation sur `preview.api.takussan.com` (DNS seul) : liste = `203.0.113.7` → `403 Source IP not allowed` avec **et** sans `X-Forwarded-For: 203.0.113.7` ; liste = IP du poste → le filtre laisse passer. La clé est ensuite retirée | 2026-09-14 | plan, tâche D5, étape 4 |
| Port 3000 | fermé à tous : `000` depuis le poste, `200` depuis le serveur ; `:8080` non publié | 2026-09-14 | plan, tâche A3, étape 6 |
| Zones Cloudflare | `takussan.com`, `checkprintplus.com` : SSL Full (strict), *Always Use HTTPS* désactivé | 2026-09-14 | `GET /zones/<id>/settings/ssl` |
| Nettoyage Docker quotidien | actif | 2026-09-14 | `settings.getWebServerSettings` → `enableDockerCleanup` |
| Budget au repos (préproduction Takussan seule, après seed) | 5 697 Mo disponibles sur 7 941 ; `st` 0 ; disque 24 % ; Dokploy seul : 867 Mo | 2026-09-14 | plan, tâche D6, étape 4 ; détail par conteneur au § Budget du plan |
| Médias de la préproduction Takussan | 948 Mo dans le volume `takussan-api-preview-4iza80_storage` | 2026-09-14 | `du -sh /var/lib/docker/volumes/<projet>_storage/_data` |
| Sauvegardes planifiées | *non mesuré* — attend le seau R2 (A5) | | onglet Backups de chaque service Database |
| Sauvegarde de la configuration de Dokploy | *non mesuré* — la version la propose (`backup.manualBackupWebServer`) ; attend R2 | | Settings → Backups |

Projets Dokploy : **Serveur** (Compose `donnees`, `postgres`, `mysql`), **Takussan** (Compose
`takussan-api-preview`, Application `takussan-web-preview`) et **CheckPrint Plus** (Compose
`cpp-api-preview`, Application `cpp-web-preview`). Leurs identifiants sont les variables de
l'environnement GitHub `preview` de chaque dépôt et se relisent par `project.all`, jamais recopiés.

Le dépôt privé `thiambara/check-print-plus` est cloné par une clé SSH générée dans Dokploy
(`github-check-print-plus`, ed25519, `SHA256:5oIiaemPIlJVC5cTwrCEqzsnkYSCQ0z5JAk7qmOn56E`), posée en
*deploy key* **en lecture seule** sous le nom `dokploy`.

Le projet Compose de l'API Takussan s'appelle `takussan-api-preview-4iza80`, et Dokploy range son
dépôt dans `/etc/dokploy/compose/takussan-api-preview-4iza80/code/`, avec le `.env` qu'il écrit à côté
de `deploy/takussan/compose.api.yml`. ⚠ Le Compose `donnees` clone **aussi** tout le dépôt : un `find`
qui ne filtre pas sur `takussan-api-preview` tombe sur son `compose.api.yml`, sans `.env`. Les valeurs
`${…}` d'un environnement Dokploy sont interpolées par Compose (relu dans le conteneur le 2026-09-14).

### Les variables d'environnement, par service — les CLÉS, jamais les valeurs

La table de référence est celle du plan, tâche D1. Toute clé ajoutée dans Dokploy s'ajoute ici.

**`takussan-api-preview`** (Compose, onglet *Environment* ; relevé le 2026-09-14, 71 clés, aucune
vide) :

- fixées par le plan : `IMAGE_TAG`, `APP_KEY` (neuve), `APP_DEBUG`, `APP_URL`, `FRONTEND_URL`,
  `SANCTUM_STATEFUL_DOMAINS`, `TRUSTED_PROXIES`, `DB_CONNECTION`, `DB_HOST`, `DB_PORT`,
  `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `SESSION_DRIVER`, `CACHE_STORE`, `QUEUE_CONNECTION`,
  `REDIS_CLIENT`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_CACHE_DB`,
  `SCOUT_DRIVER`, `SCOUT_PREFIX`, `MEILISEARCH_HOST`, `MEILISEARCH_KEY` (la clé `preview_*`, jamais
  la maîtresse), `LOG_CHANNEL`, `LOG_LEVEL`, `FILESYSTEM_DISK`, `LARAVEL_PDF_DRIVER` ;
- relevées dans le `.env` de l'ancienne préproduction (export A1) : `APP_NAME`, `APP_ENV`,
  `APP_LOCALE`, `APP_FALLBACK_LOCALE`, `APP_FAKER_LOCALE`, `APP_MAINTENANCE_DRIVER`,
  `BCRYPT_ROUNDS`, `SESSION_LIFETIME`, `SESSION_ENCRYPT`, `SESSION_SECURE_COOKIE`, `SESSION_PATH`,
  `SESSION_DOMAIN`, `SESSION_COOKIE`, `BROADCAST_CONNECTION`, `LOG_STACK`, `SCOUT_QUEUE`,
  `SCOUT_AFTER_COMMIT`, `MAIL_MAILER`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`,
  `MAIL_CONTACT_ADDRESS`, `RESEND_API_KEY`, `VITE_APP_NAME`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, et
  les douze `SEED_*` (dont `SEED_DOWNLOAD_MEDIA=true` : le seed télécharge des médias).

Absentes de l'export, donc aux défauts de `config/` : `SMS_*`, `WHATSAPP_*`, `FACEBOOK_*`, `APPLE_*`,
`CDN_*`, `BUNNY_*`. Une fonctionnalité qui en dépend ne marche pas en préproduction tant qu'on ne les
pose pas.

**Courriels.** Le transport `resend` de Laravel exige `resend/resend-php`, que le dépôt n'a eu qu'à
partir du 2026-09-14 : jusque-là, chaque notification par courriel mourait dans le worker (`Class
"Resend" not found`, 35 échecs relevés sur la préproduction) — et l'ancien serveur, qui installait le
même `composer.lock`, n'en envoyait pas davantage. Décision du porteur, le même jour :

- **production** : `MAIL_MAILER=resend` avec le SDK (`tests/Feature/Mail/ResendMailerTest.php`
  construit le transport) — comme CheckPrint Plus, dont le `composer.lock` porte
  `resend/resend-laravel` et `resend/resend-php` ;
- **préproduction** : `MAIL_MAILER=log`, posé dans Dokploy et relu dans `api` et `worker`. Le seed
  écrit des adresses sous des domaines `.sn` qui peuvent exister : une préproduction qui envoie
  vraiment écrit à des inconnus. Les échecs accumulés ont été vidés (`queue:flush`, 36 → 0).

⚠ `docs/infra/prod-drivers.json` décrit encore les `.env` de l'ancien serveur (relevé du
2026-08-16, `MAIL_MAILER=resend` en préproduction) : les valeurs vivent désormais dans Dokploy, et
ce relevé-ci fait foi pour elles.

**`takussan-web-preview`** (Application) : aucune variable, tout est inliné dans l'image ; une
authentification basique, dont `utilisateur:motdepasse` est aussi le secret `PREVIEW_BASIC_AUTH` de
l'environnement GitHub `preview`.

**`cpp-api-preview`** (Compose ; relevé le 2026-09-14, 56 clés, aucune vide) :

- fixées par le plan (tâche D7) : `IMAGE_TAG`, `APP_KEY` (neuve), `APP_DEBUG`, `APP_URL`,
  `FRONTEND_URL`, `GOOGLE_REDIRECT_URI` (écrite en clair : l'export portait
  `${FRONTEND_URL}/auth/google/callback`), `TRUSTED_PROXIES`, `TELESCOPE_ENABLED`, `LOG_CHANNEL`,
  `LOG_LEVEL`, `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`,
  `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_CACHE_DB`, `QUEUE_CONNECTION`,
  `CACHE_STORE`, `SESSION_DRIVER` (`database`, là où l'ancienne préproduction disait `redis`) ;
- relevées dans l'export A1 : `APP_NAME`, `APP_ENV`, `APP_LOCALE`, `APP_FALLBACK_LOCALE`,
  `APP_FAKER_LOCALE`, `BCRYPT_ROUNDS`, `APP_MAINTENANCE_DRIVER`, `SANCTUM_STATEFUL_DOMAINS`,
  `SESSION_LIFETIME`, `SESSION_ENCRYPT`, `SESSION_PATH`, `SESSION_DOMAIN`, `BROADCAST_CONNECTION`,
  `FILESYSTEM_DISK`, `LOG_STACK`, `MAIL_MAILER`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`,
  `MAIL_CONTACT_ADDRESS`, `RESEND_API_KEY`, `REDIS_CLIENT`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, et les neuf `LEMON_SQUEEZY_*` de l'export.

Absentes de l'export, donc aux défauts de `config/` : `LICENSE_DESKTOP_SECRET`,
`LICENSE_SIGNATURE_TTL`, `LICENSE_RATE_LIMIT_PER_KEY`, `LICENSE_RATE_LIMIT_PER_IP`,
`LEMON_SQUEEZY_REDIRECT_URL`, `SESSION_SECURE_COOKIE`, `AWS_*`, `REDIS_QUEUE*`,
`REDIS_CACHE_CONNECTION`. ⚠ Sans `LICENSE_DESKTOP_SECRET`, les routes de licence de l'application
de bureau ne vérifient rien d'utile en préproduction.

**`cpp-web-preview`** (Application) : image **privée**, tirée par le registre `ghcr.io` ; une
authentification basique (`CPP_PREVIEW_BASIC_AUTH` du fichier de transit, futur secret
`PREVIEW_BASIC_AUTH` de l'environnement GitHub `preview` de check-print-plus).

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

⚠ **Sauf tant que l'environnement GitHub n'est pas raccordé à Dokploy** : si une des variables
`DOKPLOY_*` ou le secret `DOKPLOY_API_KEY` manque, le job *Déploiement et preuve* s'arrête tôt, **en
vert**, sur la notice « Dokploy n'est pas raccordé à « preview » : images poussées, rien déployé. »
(premier passage réel le 2026-09-14, run `34792488601`). Un vert de ce workflow ne prouve un
déploiement que si son journal porte la preuve `X-Build-Sha`, pas cette notice.

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
puis restaurer les bases depuis R2. La réinstallation elle-même se fait dans le panneau Contabo :

1. *my.contabo.com → Your services →* le VPS `178.18.247.62` *→ Manage → Reinstall*.
2. Image : *Standard images →* **Ubuntu 24.04**, nue — ni *Apps & Panels* (Docker, Dokploy, Plesk…),
   ni image personnalisée : `bootstrap.sh` installe Docker lui-même et refuse toute autre version.
3. Utilisateur `root` ; un mot de passe long, au gestionnaire de mots de passe (il ne sert plus qu'à
   la console VNC : `bootstrap.sh` coupe le SSH par mot de passe) ; **deux** clés SSH publiques, celle
   du poste (`~/.ssh/takussan_contabo.pub`) et celle de secours (`~/.ssh/takussan_secours.pub`).
4. *Cloud-Init* et *user data* vides. Le disque est effacé.
5. Depuis le poste : `ssh-keygen -R 178.18.247.62` (l'empreinte du serveur a changé), puis
   `scp deploy/server/bootstrap.sh root@178.18.247.62:` et
   `ssh root@178.18.247.62 "ADMIN_IP=$(curl -s https://api.ipify.org) bash bootstrap.sh"`, et les
   mesures de la tâche A2, étape 4.
6. Dokploy (plan, tâche A3) : lancer l'installation **détachée**, jamais au premier plan d'une
   session SSH. Le 2026-09-14, une coupure réseau du poste a tué l'installation avec la session.

   ```bash
   ssh root@178.18.247.62 'nohup sh -c "curl -sSL https://dokploy.com/install.sh | sh" > /root/dokploy-install.log 2>&1 < /dev/null &'
   ssh root@178.18.247.62 'tail -3 /root/dokploy-install.log'   # jusqu'à « Dokploy is installed! »
   ```

⚠ Avant d'effacer : exporter et **relire** l'export (plan, tâche A1). Celui du 2026-09-13 est
`~/Sauvegardes/vps-2026-09-13.tar.gpg` sur le poste du porteur, phrase de passe dans le trousseau
macOS (`security find-generic-password -s vps-export-2026-09-13 -w`).

**Les jetons de la migration** (Cloudflare, R2, GHCR, clé d'API Dokploy) transitent par
`~/Sauvegardes/migration-secrets.env` sur le poste, en mode `600`, jamais par le chat ni le dépôt ;
leur place définitive est dans Dokploy, les environnements GitHub et le gestionnaire de mots de passe.
Le fichier se supprime à la fin de la migration.

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
