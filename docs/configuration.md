# Configuration — Takussan (Backend + Frontend)

Document de référence pour configurer le monorepo **Takussan** de A à Z (dépendances, services externes, variables d'environnement, étapes d'installation).

> Monorepo :
> - `takussan-api/` — Laravel 13, PHP ^8.4
> - `takussan-web/` — Next.js 16.3.1, React 19, TypeScript 5

---

## 1. Stack technique

### 1.1 Backend — `takussan-api/`

| Couche | Techno | Version |
|---|---|---|
| Runtime | PHP | ^8.4 |
| Framework | Laravel | ^13.0 |
| Auth API | Laravel Sanctum | ^4.3 (SPA cookie + Personal Access Tokens) |
| Search | Laravel Scout | ^11.1 — **driver `meilisearch` sur TOUS les environnements**, CI comprise (ADR-0008, TCK-280). `collection` est un défaut hérité du framework qui ne prouve rien : il filtre en PHP sur une collection Eloquent. |
| OAuth social | Laravel Socialite | ^5.26 + providers `apple`, `facebook` (Google natif) |
| Admin panel | ~~Filament~~ — **supprimé le 2026-08-15** (TCK-287, ardoise D-41). L'administration est en Next.js : `/admin/*` pour l'admin d'agence, `/super-admin/*` pour la plateforme. | — |
| Permissions | ~~spatie/laravel-permission~~ — **retiré en TCK-278**, remplacé par les profils polymorphes (cf. Règle 5 de `models-spec.md`) | — |
| Audit log | spatie/laravel-activitylog | ^5.0 |
| Médias | spatie/laravel-medialibrary | ^11.0 |
| PDF | spatie/laravel-pdf | ^2.0 (driver `cloudflare` par défaut, `dompdf` / `browsershot` / `gotenberg` possibles) |
| Query API | spatie/laravel-query-builder | ^7.2 (cf. `docs/spatie-query-builder.md`) |
| Image processing | intervention/image | ^4.2 — **majeure montée le 2026-08-17** (TCK-319, PR #181). v4 remplace `read()` par `decodePath()`, `create()` par `createImage()`, et `place($img, $pos, $x, $y, 0-100)` par `insert($img, $x, $y, $pos, 0,0-1,0)` : l'unité d'opacité change en même temps que la méthode. Un seul fichier l'importe, `app/Services/Media/WatermarkService.php`. |
| Excel / CSV | maatwebsite/excel | ^4.0 + league/csv ^9.16 |
| 2FA | pragmarx/google2fa ^9.0 + bacon/bacon-qr-code ^3.1 |
| Subscriptions | lemonsqueezy/laravel | ^1.9 |
| Tooling dev | Pint, Pail, PHPUnit ^12.5, Mockery, Faker, Collision |

### 1.2 Frontend — `takussan-web/`

| Couche | Techno | Version |
|---|---|---|
| Framework | Next.js | 16.3.1 (App Router, Turbopack par défaut) |
| UI | React / React DOM | 19.2.4 |
| Langage | TypeScript | ^5 |
| Styling | Tailwind CSS | ^4 (via `@tailwindcss/postcss`) + `tw-animate-css`, `tailwind-merge` |
| Composants | shadcn/ui (style `base-nova`) + `@base-ui/react` ^1.4 + `lucide-react` |
| Data fetching | @tanstack/react-query ^5.99 (+ devtools) |
| Formulaires | react-hook-form ^7.73 + @hookform/resolvers ^5.2 + zod ^4.3 |
| i18n | next-intl ^4.9 (config `src/i18n/request.ts`) |
| Cartes | leaflet ^1.9 + react-leaflet ^5.0 |
| Drag & drop | @dnd-kit/core ^6.3 |
| Carrousels | embla-carousel-react ^8.6 |
| Tests | Vitest ^4.1 + @testing-library/react ^16.3 + jsdom ^29 |
| Lint | ESLint ^9 + eslint-config-next |

---

## 2. Dépendances externes (services tiers à provisionner)

| Catégorie | Service | Obligatoire | Variables clés |
|---|---|---|---|
| **DB** | PostgreSQL 17 | ✅ | `DB_CONNECTION=pgsql` — **seul moteur supporté, sur TOUS les environnements, suite de tests comprise** (ADR-0020). SQLite et MySQL ont été retirés. Puis `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` |
| **Cache** | Redis (recommandé) | ✅ (prod) | `CACHE_STORE=redis`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| **Queue** | Database / Redis / SQS / Beanstalkd | ✅ | `QUEUE_CONNECTION` |
| **Storage** | Local / S3 (AWS) | ✅ | `FILESYSTEM_DISK`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET`, `AWS_DEFAULT_REGION` |
| **Mail** | SMTP / Postmark / Resend / SES | ✅ (prod) | `MAIL_MAILER`, `POSTMARK_API_KEY` ou `RESEND_API_KEY` ou `AWS_*` |
| **Search** | Meilisearch (Algolia / Typesense supportés) | ✅ (preview + prod) | `SCOUT_DRIVER` + (`MEILISEARCH_HOST` & `MEILISEARCH_KEY`) ou (`ALGOLIA_APP_ID` & `ALGOLIA_SECRET`) ou (`TYPESENSE_*`) |
| **OAuth Google** | Google Cloud Console | ⚠️ (si SSO Google) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| **OAuth Facebook** | Meta for Developers | ⚠️ (si SSO Facebook) | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_REDIRECT_URI` |
| **OAuth Apple** | Apple Developer (Services ID + .p8) | ⚠️ (si SSO Apple) | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH`, `APPLE_REDIRECT_URI` |
| **CDN images** | Bunny.net ou Cloudflare | ⚠️ (prod) | `CDN_ENABLED=true`, `CDN_PROVIDER`, `CDN_BASE_URL`, `CDN_PULL_ZONE`, `CDN_SIGNING_KEY`, `BUNNY_*` ou `CLOUDFLARE_*` |
| **PDF** | Cloudflare Browser Rendering / Gotenberg / Browsershot / DomPDF | ✅ | `LARAVEL_PDF_DRIVER` |
| **SMS** | Orange API SN, mTarget, lAfricaMobile (fallback chain) | ✅ (notifs) | `SMS_DEFAULT_DRIVER`, `SMS_*_SEND_URL`, `SMS_WEBHOOK_URL_TOKEN`, `SMS_*_WEBHOOK_IPS` (clefs par-agence stockées en DB sur `Integration`) |
| **Paiements** | Lemon Squeezy | ⚠️ (option) | `LEMON_SQUEEZY_*` (cf. `config/lemon-squeezy.php`) |
| **Broadcasting** | Pusher / Ably / Reverb | ⚠️ (option realtime) | `BROADCAST_CONNECTION`, `PUSHER_*` ou `REVERB_*` ou `ABLY_KEY` |
| **Logs** | Papertrail / Slack / stack | ⚠️ (option) | `LOG_CHANNEL`, `PAPERTRAIL_URL`, `SLACK_BOT_USER_OAUTH_TOKEN` |
| **Frontend → Backend** | Backend Laravel exposé | ✅ | `NEXT_PUBLIC_API_URL` |

---

## 3. Variables d'environnement — Backend (`takussan-api/.env`)

> Toutes les variables suivantes sont consommées par les fichiers de `config/` du backend. Copier `.env.example` puis adapter.

### 3.1 App

```env
APP_NAME=Takussan
APP_ENV=local            # local | testing | staging | production
APP_KEY=                 # généré par `php artisan key:generate`
APP_DEBUG=true           # ⚠️ false en prod
APP_URL=http://localhost:8002
APP_LOCALE=fr
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=fr_FR
APP_MAINTENANCE_DRIVER=file
BCRYPT_ROUNDS=12
```

### 3.2 Frontend & Sanctum (CSRF + cookies SPA)

```env
FRONTEND_URL=http://localhost:3000
SANCTUM_STATEFUL_DOMAINS=localhost:3000
```

### 3.3 Base de données

**PostgreSQL 17 sur tous les environnements, suite de tests comprise** ([ADR-0020](adr/0020-postgresql-sur-tous-les-environnements.md)).
SQLite et MySQL ont été retirés : ce ne sont plus des variantes supportées, et `config/database.php`
replie sur `pgsql` quand `DB_CONNECTION` manque. Il n'y a donc **rien à commenter ni à décommenter
ici** — ces six lignes sont l'environnement, pas un exemple parmi d'autres.

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5433
DB_DATABASE=takussan
DB_USERNAME=takussan
DB_PASSWORD=takussan
```

> ⚠ **5433 et non 5432.** Le port canonique est laissé à une éventuelle installation brew : les
> conteneurs du dépôt sont décalés d'un cran (5433 / 7701 / 6380 / 1026), pour que les deux mondes
> cohabitent au lieu que l'un démonte l'autre. Viser 5432 ne produit **aucun rouge** — les services
> répondent, ce sont ceux de brew — et rien de ce que `docker-compose.yml` garantit ne s'applique
> alors : ni PostgreSQL 17, ni `--locale=C` (dont dépend le sens de six contraintes d'unicité sur
> texte), ni la disponibilité de pgvector. `./dev.sh doctor` nomme ce cas.

### 3.4 Session / Cache / Queue / Filesystem

```env
SESSION_DRIVER=database     # database | redis | cookie | file
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null

CACHE_STORE=redis           # redis recommandé
QUEUE_CONNECTION=database   # ou redis / sqs
BROADCAST_CONNECTION=log    # log | pusher | ably | reverb
FILESYSTEM_DISK=local       # ou s3 en prod

# Redis
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
```

### 3.5 Logs

```env
LOG_CHANNEL=stack
LOG_STACK=single
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug
```

### 3.6 Search (Laravel Scout + Meilisearch)

Depuis TCK-280, **Meilisearch est le moteur de recherche sur tous les
environnements** — local, CI, preview et production. Le driver `collection` de
Scout (recherche en mémoire) n'est plus utilisé : la suite de tests elle-même
tourne sur un service Meilisearch (cf. `.github/workflows/api-ci.yml`).

```env
# Tous les environnements — Meilisearch
SCOUT_DRIVER=meilisearch
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_KEY=<master_key de /etc/meilisearch.toml>
SCOUT_QUEUE=true            # preview/prod — indexation via la queue (worker requis)
SCOUT_AFTER_COMMIT=true     # preview/prod — n'indexe qu'après commit de transaction
SCOUT_PREFIX=preview_       # PREVIEW UNIQUEMENT — isole les index de la prod
```

> ⚠️ `SCOUT_PREFIX=preview_` est **obligatoire sur preview** quand preview et prod
> partagent la même instance Meilisearch (même VPS) : sans lui, les index
> `properties` / `messages` / `documents` des deux environnements entrent en
> collision. La prod laisse `SCOUT_PREFIX` vide.

#### Installer Meilisearch en local (macOS)

```bash
brew install meilisearch
brew services start meilisearch        # service en arrière-plan, port 7700
```

Master key locale — créer `/opt/homebrew/var/config.toml` (chargé automatiquement,
le service brew tourne avec ce répertoire de travail) :

```toml
master_key = "<32+ caractères>"
env = "development"
```

#### Installer Meilisearch en production (VPS Ubuntu)

```bash
# 1. Binaire via le dépôt apt officiel Meilisearch
echo "deb [trusted=yes] https://apt.fury.io/meilisearch/ /" | sudo tee /etc/apt/sources.list.d/meilisearch.list
sudo apt update && sudo apt install meilisearch

# 2. Utilisateur système dédié + répertoires de données
sudo useradd -d /var/lib/meilisearch -s /bin/false -m -r meilisearch
sudo mkdir -p /var/lib/meilisearch/data /var/lib/meilisearch/dumps /var/lib/meilisearch/snapshots
sudo chown -R meilisearch:meilisearch /var/lib/meilisearch
```

Configuration `/etc/meilisearch.toml` (master key : `openssl rand -base64 24`) :

```toml
env          = "production"
master_key   = "<master key générée>"
db_path      = "/var/lib/meilisearch/data"
dump_dir     = "/var/lib/meilisearch/dumps"
snapshot_dir = "/var/lib/meilisearch/snapshots"
http_addr    = "127.0.0.1:7700"   # localhost uniquement — jamais exposé publiquement
```

Service systemd `/etc/systemd/system/meilisearch.service`, puis activation :

```ini
[Unit]
Description=Meilisearch
After=network.target

[Service]
User=meilisearch
Group=meilisearch
ExecStart=/usr/bin/meilisearch --config-file-path /etc/meilisearch.toml
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now meilisearch
curl http://127.0.0.1:7700/health      # → {"status":"available"}
```

#### Côté Laravel / Scout

Sept modèles portent le trait `Searchable` — `Property`, `Document`, `Message`, et
depuis TCK-281 `Customer`, `MaintenanceRequest`, `Agency`, `User` ; les
réglages d'index (`searchableAttributes`, `filterableAttributes`,
`sortableAttributes`, `rankingRules`) sont définis dans `config/scout.php`.

```bash
php artisan scout:sync-index-settings           # pousse les réglages d'index
php artisan scout:import "App\Models\Property"  # peuple un index (1ère fois)
php artisan scout:import "App\Models\Document"
php artisan scout:import "App\Models\Message"
# TCK-281 — quatre index de plus, à peupler au même titre :
php artisan scout:import "App\Models\Customer"
php artisan scout:import "App\Models\MaintenanceRequest"
php artisan scout:import "App\Models\Agency"
php artisan scout:import "App\Models\User"
```

- `scout:sync-index-settings` est exécuté **automatiquement à chaque déploiement**
  par `scripts/deploy.sh` (Step 6b) quand `SCOUT_DRIVER=meilisearch`.
- `scout:import` est une opération **ponctuelle** — 1er déploiement, ou après modif
  d'un `toSearchableArray()`. À lancer manuellement sur le serveur.

> ⚠️ **`scripts/deploy.sh` ne lance AUCUN `scout:import`.** Un déploiement crée les
> index et les paramètre correctement — et les laisse **VIDES**. La recherche rend
> alors zéro résultat *sans lever la moindre exception* : rien dans les journaux, rien
> dans le monitoring, un écran de liste qui répond « aucun résultat » à toutes les
> requêtes. C'est la forme la plus coûteuse de panne, celle qui ne se signale pas.
> Cette page ne suffit donc pas : la commande est **aussi** inscrite dans le runbook
> de première mise en production (`docs/backlog/tickets/TCK-288-…`), parce que c'est
> là qu'on la lira le jour où elle sert. *(L'automatisation dort sur la branche non
> mergée `chore/deploy-meilisearch-reindex`.)*
- `SCOUT_QUEUE=true` exige un worker de queue actif (`takussan-queue.service`) pour
  traiter les jobs `Laravel\Scout\Jobs\MakeSearchable`.

### 3.7 Mail

```env
MAIL_MAILER=log             # log | smtp | postmark | resend | ses
MAIL_HOST=127.0.0.1
MAIL_PORT=2525
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_FROM_ADDRESS="hello@takussan.com"
MAIL_FROM_NAME="${APP_NAME}"
# POSTMARK_API_KEY=
# RESEND_API_KEY=
```

### 3.8 AWS / S3 (filesystem + media-library quand `FILESYSTEM_DISK=s3`)

```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=
AWS_USE_PATH_STYLE_ENDPOINT=false
```

### 3.9 OAuth — Google / Facebook / Apple

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI="${FRONTEND_URL}/auth/oauth/google/callback"

FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_REDIRECT_URI="${FRONTEND_URL}/auth/oauth/facebook/callback"

# Apple (Services ID, ex. com.takussan.web)
APPLE_CLIENT_ID=
APPLE_TEAM_ID=                  # 10 caractères, top-right Apple Developer
APPLE_KEY_ID=                   # 10 caractères, key ID du .p8
APPLE_PRIVATE_KEY_PATH=         # chemin absolu vers AuthKey_XXXXXXXXXX.p8
APPLE_REDIRECT_URI="${FRONTEND_URL}/auth/oauth/apple/callback"
```

### 3.10 CDN (TCK-105)

```env
CDN_ENABLED=false               # bascule à true une fois le CDN provisionné
CDN_PROVIDER=bunny              # bunny | cloudflare
CDN_BASE_URL=                   # ex. https://takussan.b-cdn.net
CDN_PULL_ZONE=
CDN_SIGNING_KEY=                # HMAC-SHA256
CDN_SIGNATURE_TTL=300           # secondes

# Bunny
BUNNY_ACCESS_KEY=
BUNNY_STORAGE_ZONE=

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

### 3.11 PDF (spatie/laravel-pdf)

```env
LARAVEL_PDF_DRIVER=cloudflare   # cloudflare | browsershot | gotenberg | dompdf
```

### 3.12 SMS (TCK-102 — multi-provider Sénégal)

```env
SMS_DEFAULT_DRIVER=router
SMS_RATE_LIMIT_PER_USER_HOUR=5
SMS_QUIET_HOURS_ENABLED=true     # 22h-06h Africa/Dakar (sauf 2FA)
SMS_WEBHOOK_URL_TOKEN=           # `php artisan tinker` → Str::random(40)

# IP whitelists (CSV) pour callbacks DLR
SMS_ORANGE_WEBHOOK_IPS=
SMS_MTARGET_WEBHOOK_IPS=
SMS_LAM_WEBHOOK_IPS=

# URLs (override les défauts du config si besoin)
# SMS_ORANGE_OAUTH_URL=
# SMS_ORANGE_SEND_URL=
# SMS_MTARGET_SEND_URL=
# SMS_LAM_SEND_URL=
```

> Les credentials par fournisseur SMS sont **stockés en DB** sur la table `integrations` (par agence), pas dans `.env`.

### 3.13 Visites & comptes

```env
VISITS_FEEDBACK_WINDOW_HOURS=24
ACCOUNT_DELETION_GRACE_DAYS=30
ACCOUNT_DELETION_REMINDER_DAYS=7
```

### 3.14 Activity Log (spatie)

```env
ACTIVITYLOG_ENABLED=true
ACTIVITYLOG_BUFFER_ENABLED=false
```

### 3.15 Seeding (volumes configurables — voir `database/seeders/Support/SeedingConfig.php`)

```env
SEED_DOWNLOAD_MEDIA=false
SEED_AGENCIES=3
SEED_PROPERTIES_PER_AGENCY=150
SEED_CUSTOMERS_PER_AGENCY=120
SEED_BOOKINGS_PER_AGENCY=100
SEED_LEASES_PER_AGENCY=90
SEED_MAINTENANCE_PER_AGENCY=50
SEED_CONVERSATIONS_PER_AGENCY=60
SEED_DOCUMENTS_PER_AGENCY=40
SEED_EDGE_CASES=true
SEED_REFERENTIAL_INTEGRITY=true
SEED_FILTER_COVERAGE=true
SEED_DEMO_USERS=true
```

### 3.16 Vite (assets backend)

```env
VITE_APP_NAME="${APP_NAME}"
```

---

## 4. Variables d'environnement — Frontend (`takussan-web/.env.local`)

```env
# URL du backend Laravel — doit matcher APP_URL côté takussan-api
NEXT_PUBLIC_API_URL=http://127.0.0.1:8002
```

> Toute variable exposée au navigateur **doit** être préfixée `NEXT_PUBLIC_`. Les secrets restent côté server actions / route handlers.

---

## 5. Configuration de A à Z — Étapes

### 5.1 Pré-requis système

- **PHP ^8.4** avec extensions : `bcmath`, `ctype`, `curl`, `dom`, `fileinfo`, `gd` (ou `imagick` si Intervention Image), `intl`, `mbstring`, `openssl`, `pdo`, **`pdo_pgsql`**, `redis` (phpredis), `tokenizer`, `xml`, `zip`.
  ⚠ **`pdo_pgsql`, et pas `pdo_mysql` ni `pdo_sqlite`** (ADR-0020). Ce n'est pas une équivalence : sans lui, l'API **ne se connecte à rien** — et le message ne nomme pas l'extension manquante.
- **Composer 2.x**
- **Node.js ≥ 20.x** + **npm** (frontend `engines` non strict, mais types `@types/node ^20`)
- **Database** : **PostgreSQL 17**, sur *tous* les environnements, **suite de tests comprise**
  ([ADR-0020](adr/0020-postgresql-sur-tous-les-environnements.md)). SQLite et MySQL ont été
  **retirés** : ce ne sont plus des variantes supportées, et `phpunit.xml` force `pgsql` sans repli
  — **sans instance PostgreSQL, `php artisan test` ne démarre pas**, au même titre que Meilisearch.
  L'image attendue est `pgvector/pgvector:pg17` et non `postgres:17` : l'extension doit être
  *disponible* partout dès maintenant, alors qu'aucune table ne l'utilise encore.
  Le gain n'est pas PostgreSQL, c'est que **la base de test EST celle de la production** : la
  divergence « tests permissifs, production stricte » que les pièges de migration de
  [`../CLAUDE.md`](../CLAUDE.md) existaient pour compenser n'existe plus.
- **Meilisearch** — **obligatoire, pas optionnel** (ADR-0008). `phpunit.xml` force
  `SCOUT_DRIVER=meilisearch` sans repli : **sans instance, `php artisan test` ne démarre pas.**
- **Git**
- **Redis** — ⚠️ **cette ligne affirmait « la production tourne en `CACHE_STORE=database` », et
  c'était faux.** Mesuré le 2026-08-16 : `.env.preview` **et** `.env.prod` déclarent tous deux
  `CACHE_STORE=redis`, `SESSION_DRIVER=redis` et `REDIS_HOST=127.0.0.1:6379`. Seule la file de jobs
  tourne en `database`. Le relevé fait foi et vit dans
  [`infra/prod-drivers.json`](infra/prod-drivers.json) — ne pas le recopier ici (TCK-300).

  **Ce que personne n'a vérifié** : que Redis écoute réellement sur le serveur. `server-setup.sh`
  ne l'installe pas, et la production n'ayant *jamais* été déployée (D-04), le premier démarrage est
  aussi le premier essai. À lever au tout début de TCK-288, par `redis-cli ping`, avant tout le reste.
- *(Optionnel)* Gotenberg ou navigateur headless si `LARAVEL_PDF_DRIVER` ∉ {`dompdf`, `cloudflare`}

> **Le plus simple est de ne rien installer de tout cela** : `docker-compose.yml` à la racine sert
> PostgreSQL 17 (`pgvector/pgvector:pg17`), Meilisearch, Redis et Mailpit, et `./dev.sh` démarre
> l'ensemble en une commande (ADR-0011). `./dev.sh doctor` dit ce qui répond et ce qui manque.

### 5.2 Cloner le repo

```bash
git clone <url> takussan && cd takussan
```

### 5.3 Backend — installation

```bash
cd takussan-api

# 1. Dépendances PHP + assets
composer install
npm install

# 2. Variables d'environnement
cp .env.example .env
php artisan key:generate

# 3. Base de données
#    Prérequis DUR : le conteneur doit tourner. `php artisan migrate` sur une base absente
#    ne dit pas « démarre PostgreSQL », il dit « Connection refused ».
docker compose up -d postgres            # depuis la RACINE du monorepo
php artisan migrate
php artisan db:seed                      # seed démo (volumes via SEED_*)

# 4. Storage
php artisan storage:link

# 5. (optionnel) Search index
# php artisan scout:import "App\\Models\\Property"

# 6. Lancer
php artisan serve --port=8002            # ⚠️ port fixe (frontend hardcodé)
# ou pile complète :
# composer dev   # serve + queue:listen + pail + vite (concurrently)
```

Avant chaque commit backend : `./vendor/bin/pint`

### 5.4 Frontend — installation

```bash
cd takussan-web

# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env.local
# éditer NEXT_PUBLIC_API_URL si le backend ne tourne pas sur :8002

# 3. Lancer
npm run dev          # http://localhost:3000

# Tests / lint / build
npm run lint
npm run test
npm run build
```

### 5.5 Configuration des services externes

#### a) Google OAuth
1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application)
2. Authorized redirect URI : `${FRONTEND_URL}/auth/oauth/google/callback`
3. Renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dans `.env`

#### b) Facebook OAuth
1. developers.facebook.com → Create App → Facebook Login
2. Valid OAuth Redirect URI : `${FRONTEND_URL}/auth/oauth/facebook/callback`
3. Renseigner `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`

#### c) Apple OAuth (TCK-081)
1. Apple Developer → Identifiers → **Services ID** (ex. `com.takussan.web`) → activer Sign In with Apple
2. Configurer les domaines + return URL `${FRONTEND_URL}/auth/oauth/apple/callback`
3. Apple Developer → **Keys** → créer une clé "Sign In with Apple" → télécharger le `.p8`
4. Stocker le `.p8` hors repo (ex. `storage/app/keys/AuthKey_XXXXXXXXXX.p8`) avec permissions `0600`
5. Remplir `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH`

#### d) Sanctum SPA
- `FRONTEND_URL` et `SANCTUM_STATEFUL_DOMAINS` doivent **matcher exactement** l'origin du frontend (host:port, sans schéma)
- Le frontend doit appeler `GET /sanctum/csrf-cookie` avant tout POST authentifié
- CORS : vérifier `config/cors.php` → `supports_credentials = true` et `paths` couvrent `api/*` + `sanctum/csrf-cookie`

#### e) S3 / Media library
- Provisionner bucket (public ou privé selon les collections — voir `cdn.secure_collections`)
- IAM user avec `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sur le bucket
- `FILESYSTEM_DISK=s3` + `AWS_*` renseignées
- `php artisan media-library:regenerate` après bascule

#### f) CDN (Bunny.net ou Cloudflare)
- Créer pull-zone pointant vers le bucket S3 ou l'origin Laravel
- Récupérer `BUNNY_ACCESS_KEY`, `BUNNY_STORAGE_ZONE`, ou `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`
- Définir `CDN_BASE_URL` = URL publique du pull-zone
- Générer `CDN_SIGNING_KEY` (`openssl rand -hex 32`) pour signer les URLs des `secure_collections`
- Basculer `CDN_ENABLED=true`

#### g) SMS multi-provider (TCK-102)
- Comptes : Orange API SN (api.orange.com), mTarget, lAfricaMobile
- Ajouter chaque provider activé dans la table `integrations` (par agence) — pas dans `.env`
- Générer le webhook token : `php artisan tinker` → `Str::random(40)` → `SMS_WEBHOOK_URL_TOKEN`
- Configurer côté provider l'URL de callback `https://api.takussan.com/webhooks/sms/{provider}/{token}`
- Renseigner les IP whitelists `SMS_*_WEBHOOK_IPS` (CSV)

#### h) Mail (prod)
- Choisir un transporteur (`postmark`, `resend`, `ses`, `smtp`)
- Configurer SPF / DKIM / DMARC sur le domaine d'envoi
- Vérifier `MAIL_FROM_ADDRESS` et tester avec `php artisan tinker` → `Mail::raw(...)`

#### i) PDF (Cloudflare Browser Rendering, défaut)
- Activer Browser Rendering dans le compte Cloudflare
- Réutiliser `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`
- Sinon basculer `LARAVEL_PDF_DRIVER` sur `gotenberg` (service docker), `browsershot` (Chromium local) ou `dompdf` (PHP pur, qualité moindre)

### 5.6 Vérifications post-installation

```bash
cd takussan-api
php artisan about                  # tableau complet de la config
php artisan config:clear
php artisan route:list             # vérifier les routes API exposées
php artisan test                   # smoke

cd ../takussan-web
npm run lint
npm run test
npm run build
```

### 5.7 Production — checklist additionnelle

- [ ] `APP_ENV=production`, `APP_DEBUG=false`
- [ ] `APP_KEY` défini et sauvegardé (rotation via `APP_PREVIOUS_KEYS`)
- [ ] `CACHE_STORE=redis`, `SESSION_DRIVER=redis`, `QUEUE_CONNECTION=database` — **valeurs
      relevées dans les `.env` livrés**, pas prescrites de mémoire. Cette ligne demandait
      `QUEUE_CONNECTION=redis` quand les deux fichiers déclarent `database` ; le relevé fait foi
      ([`infra/prod-drivers.json`](infra/prod-drivers.json)), et `check-prod-drivers.mjs` casse si
      cette ligne s'en écarte de nouveau
- [ ] `php artisan config:cache && php artisan route:cache && php artisan view:cache && php artisan event:cache`
- [ ] Worker queue : `php artisan queue:work` via supervisor / systemd
- [ ] Scheduler cron : `* * * * * php artisan schedule:run >> /dev/null 2>&1`
- [ ] HTTPS obligatoire (cookie `Secure` + Sanctum domain)
- [ ] `SESSION_SECURE_COOKIE=true` — 🔴 **absente des `.env` livrés, et c'est le seul manque qui
      coûte.** `config/session.php:172` la lit **sans défaut** : `env('SESSION_SECURE_COOKIE')` rend
      `null`, qui est faux, donc le cookie de session n'est **pas** marqué `Secure`. Sur un
      déploiement HTTPS, un repli en clair suffit à le faire émettre en clair.
- [ ] `SESSION_SAME_SITE=lax` — également absente des `.env` livrés, mais **sans conséquence** :
      `config/session.php:202` la lit avec le défaut `'lax'`, exactement la valeur prescrite.
      *Deux clés absentes du même fichier n'ont pas le même coût — c'est le défaut du code qui
      décide, pas l'absence.* L'ardoise D-11 les mettait dans le même sac.
- [ ] CDN actif (`CDN_ENABLED=true`) et `secure_collections` correctement listées
- [ ] Backups DB + storage automatisés
- [ ] Frontend déployé avec `NEXT_PUBLIC_API_URL` pointant vers l'API HTTPS
- [ ] CORS / Sanctum stateful domains alignés sur le domaine prod
- [ ] Logs centralisés (Papertrail / Slack channel) via `LOG_CHANNEL`

---

## 6. Références internes

- `docs/features.md` — spec fonctionnelle
- `docs/models-spec.md` — spec data/modèles
- `docs/spatie-query-builder.md` — conventions API
- `docs/design-guidelines.md` — UI / UX
- `docs/plans/2026-04-18-seeding-annee-activite.md` — plan d'origine du seeding démo (archive : le
  raisonnement, pas l'état ; la source est `takussan-api/database/seeders/`)
- `docs/backlog/INDEX.md` — kanban des tickets
- `CLAUDE.md` — règles agent / monorepo
