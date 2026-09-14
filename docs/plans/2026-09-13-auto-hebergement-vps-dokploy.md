# Auto-hébergement de Takussan et CheckPrint Plus sur le VPS, par Dokploy — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir les deux projets (front Next.js, API Laravel, workers, planificateur, données) depuis
des conteneurs sur le VPS Contabo `178.18.247.62`, déployés par Dokploy à partir d'images construites
dans GitHub Actions. Retirer Vercel et la chaîne `deploy.sh` / `server-setup.sh`.

**Architecture:** Décision : [ADR-0028](../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Le
serveur est réinstallé à blanc, puis reçoit Dokploy (Traefik et Swarm à un nœud). Chaque API tourne
dans un Compose versionné (`release` → `api`, `worker…`, `scheduler`), chaque front dans une
Application Dokploy. Les données sont servies par des services Database de Dokploy (PostgreSQL,
MySQL) et par un Compose versionné (Redis, Meilisearch). GitHub Actions construit, pousse sur GHCR,
déclenche Dokploy, puis **prouve** le déploiement en lisant `X-Build-Sha` sur l'URL publique.

**Tech Stack:** Ubuntu 24.04 · Docker · Dokploy · Traefik · FrankenPHP (mode classique) sur PHP 8.4 ·
Node 24 · Next.js 16 `output: 'standalone'` · PostgreSQL 17 `pgvector/pgvector:pg17` · MySQL 8.4 ·
Redis 8 · Meilisearch v1.16 · GHCR · Cloudflare (DNS, proxy, R2).

## Global Constraints

- **Aucun secret dans un dépôt, dans une image ni dans un journal de CI.** `thiambara/takussan` est
  **public**. Les secrets vivent dans l'interface de Dokploy, dans les secrets GitHub et dans un
  gestionnaire de mots de passe. Rien d'autre.
- **Le serveur ne construit aucune image** (ADR-0028 §2). Pas de `docker build` sur le VPS, pas de
  construction depuis Git dans Dokploy, pas de preview par PR.
- **Aucun nom d'hôte public ne change** (ADR-0028 §9) : `api.checkprintplus.com` est écrit en dur
  dans l'application de bureau (`flutter_app/lib/core/config/env_config.dart:10-11`).
- **Une image de front ne se construit pas sans** `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_SITE_URL`
  (Takussan), ni sans `NEXT_PUBLIC_BACKEND_API_URL`, `BACKEND_API_HOST` et `NEXT_PUBLIC_SITE_URL`
  (CheckPrint Plus).
- **FrankenPHP en mode classique.** Pas de mode worker ni d'Octane sans un nouvel ADR.
- **Aucun port de base de données publié** sur l'interface publique.
- **Versions épinglées** : PHP 8.4, Node 24, `pgvector/pgvector:pg17`, `mysql:8.4`,
  `getmeili/meilisearch:v1.16`, `redis:8-alpine`. Ce sont les versions de `docker-compose.yml` et de la
  CI : le développement et le déploiement ne divergent pas.
- **Chaque vérification est une mesure datée**, avec sa commande. Une valeur de production ne se
  déduit jamais d'une configuration (CLAUDE.md, [J-04](../journal-des-corrections.md#j-04)).
- **Toute garde modifiée se prouve par ablation** : on casse ce qu'elle garde, elle doit rougir en
  nommant le défaut ; on répare, elle reverdit.
- Commits en français, préfixés du type conventionnel, avec le ticket (`build(api): … (TCK-NNN)`).
  **Ni push ni fusion sans demande explicite du porteur.**

---

## Vue d'ensemble

```
            ┌── Piste A — le serveur (runbook, en SSH et dans Dokploy) ──┐
            │  A1 export → A2 réinstallation → A3 Dokploy → A4 données →  │
            │  A5 sauvegardes                                             │
 Tâche 0 ───┼── Piste B — dépôt takussan ────────────────────────────────┼──► D (préproductions) ──► E (Vercel hors préprod) ──► F (production)
 (tickets)  │  B1 image API → B2 Compose API → B3 image front →           │        série                série                         série, ≥ 3 mois
            │  B4 workflow → B5 gardes → B6 documentation                 │
            └── Piste C — dépôt check-print-plus ─────────────────────────┘
               C1 image API + Compose → C2 image front → C3 workflow → C4 doc
```

- **A, B et C avancent en parallèle.** B et C ne touchent pas le serveur : tout y est éprouvé en
  local, par Docker.
- **La coupure des préproductions va de A2 à la fin de D.** Pour la raccourcir, **B1 à B3 et C1 à C2
  sont faits et éprouvés en local avant de lancer A2.** Il n'y a aucune donnée de production à
  protéger (ADR-0028, contexte, fait 1) : la coupure ne coûte que l'accès aux préproductions.
- **D, E et F sont en série.** F n'a lieu que lorsque le porteur décide la mise en production — pas
  avant trois mois, selon lui au 2026-09-13. Ses prémisses **se re-mesurent** en ouvrant F.
- Pendant D et E, `www.takussan.com` et `checkprintplus.com` restent servis par Vercel. Rien de ce
  plan ne touche les fronts de production avant F.

### Budget de la machine — à mesurer, pas à croire

8 Go de mémoire, 4 vCPU partagés, 70 Go de disque, pour quatre environnements à terme. Les limites
ci-dessous sont des **plafonds** posés par conteneur ; la colonne « attendu » est une estimation
**à remplacer par la mesure** de la tâche D6 (`docker stats --no-stream`).

| Conteneur | Plafond | Attendu au repos | Mesuré le 2026-09-14, 02:04 Z (Takussan seule, après seed) | Mesuré le 2026-09-14, 11:03 Z (les deux préproductions, AC4) | Mesuré sous charge d'images, 2026-09-14, 21:05 Z (TCK-520) | Instances à terme |
|---|---|---|---|---|---|---|
| Système, Docker, Dokploy (et sa base), Traefik | — | ~900 Mo | Dokploy 867 + sa base 36 + Traefik 27 = **930 Mo**, hors système | Dokploy 1 013 + sa base 72 + Traefik 33 = **1 118 Mo** | — | 1 |
| PostgreSQL 17 (`shared_buffers=256MB`) | 1 Go | ~350 Mo | 86 Mo | 92 Mo | — | 1 |
| MySQL 8.4 (`innodb_buffer_pool_size=256M`) | 640 Mo | ~450 Mo | 197 Mo | 248 Mo | — | 1 |
| Meilisearch | 768 Mo | ~150 Mo | 118 Mo (817 biens indexés) | 115 Mo | — | 1 |
| Redis Takussan / Redis CheckPrint Plus | 192 Mo / 96 Mo | ~15 Mo chacun | 6 / 5 Mo | 6 / 6 Mo | — | 1 + 1 |
| Takussan `api` / `worker` / `worker-media` / `scheduler` | 384 / 256 / 384 / 192 Mo | ~90 / 70 / 70 / 60 Mo | 72 / 58 / 46 / 45 Mo | 54 / 47 / 45 / 43 Mo | — | × 2 environnements |
| CheckPrint Plus `api` / `worker` / `scheduler` | 256 / 192 / 128 Mo | ~80 / 60 / 50 Mo | *non déployé* | 54 / 34 / 35 Mo | — | × 2 |
| Front Takussan / front CheckPrint Plus | **512** / 256 Mo (TCK-520) | ~120 / 90 Mo | 95 Mo / *non déployé* | 57 / 57 Mo | **327 Mo** (pic, 8 clients, 50 photos en AVIF `w=1920`, depuis un conteneur froid à 51 Mo ; 219 Mo pour 4 clients `w=640`) / **140 Mo** (4 clients, 200 pages) | × 2 |

Au total, le 2026-09-14 à 02:04 Z : **5 697 Mo disponibles** sur 7 941, `st` à `0` sur les douze
relevés de `vmstat 5 12`, disque à **24 %** (17 Go sur 72), charge `0,50 / 0,94 / 1,08` sur 4 vCPU,
swap intact. Les trois seuils tiennent, avec un seul des quatre environnements servi.

Avec les **deux** préproductions servies, le même jour à 11:03 Z (AC4, deux minutes après un
déploiement) : **5 349 Mo disponibles**, `st` à `0` sur les douze relevés, disque à **25 %** (18 Go
sur 72), charge `0,26 / 0,37 / 0,44`, swap intact. Les trois seuils tiennent avec deux environnements
sur quatre. ⚠ Le conteneur le plus lourd de la machine est **Dokploy lui-même** (867 → 1 013 Mo en neuf
heures), et c'est le seul sans plafond (`docker stats` : la mémoire de la machine) : à surveiller
avant F.

⚠ **Le repos ne dit rien du plafond d'un front.** Le front Takussan, mesuré à 57 Mo deux minutes
après un déploiement, était à **308 Mo** dix heures plus tard sans charge particulière (relevé du
2026-09-14, 22:03 Z), et **327 Mo** sous une charge d'images depuis un conteneur froid — 85 % d'un
plafond de 384 Mo. Le plafond se décide sur le pic mesuré, avec 20 % de marge : **512 Mo** pour le
front Takussan (327 × 1,2 = 393, arrondi au palier), 256 Mo suffisent au front CheckPrint Plus
(140 × 1,2 = 168). La charge est rejouable : `SITE=… PHOTOS=… CLIENTS=8 W=1920 charge-images.sh`
(TCK-520, notes d'implémentation). Aucun `OOMKilled`, mémoire disponible de la machine jamais sous
5 000 Mo pendant la charge.

**Seuils d'alerte**, relevés en D6 puis surveillés — par `deploy/server/seuils.sh` et `seuils.timer`, une alerte Telegram par franchissement (TCK-519) :

| Mesure | Commande | Seuil |
|---|---|---|
| Mémoire disponible | `awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo` | **≥ 1 500 Mo** |
| Vol de CPU par l'hyperviseur | `vmstat 5 12`, colonne `st` | **< 10** en moyenne |
| Disque | `df -h /` | **< 75 %** |

Le premier seuil franchi déclenche le premier geste de montée en charge prévu par ADR-0028 : **sortir
les préproductions, ou PostgreSQL, sur une autre machine** — pas agrandir celle-ci.

## Carte des fichiers

**Dépôt `thiambara/takussan`**

| Fichier | Tâche | Rôle |
|---|---|---|
| `deploy/server/bootstrap.sh` | A2 | prépare un Ubuntu 24.04 vierge : swap, mises à jour, SSH, pare-feu, Docker, fermeture du port 3000 |
| `deploy/server/compose.data.yml` | A4 | Meilisearch et les deux Redis, partagés par les deux projets |
| `deploy/server/.env.example` | A4 | les **clés** (jamais les valeurs) que `compose.data.yml` exige |
| `takussan-api/Dockerfile` | B1 | image unique de l'API, du worker, du planificateur et du seed |
| `takussan-api/.dockerignore` | B1 | exclut `.env*`, `vendor/`, `node_modules/`, `storage/` vivant, tests |
| `takussan-api/docker/Caddyfile` | B1 | reprend les règles du vhost nginx (taille de corps, cache de `/storage`, gzip, fichiers cachés) |
| `takussan-api/docker/php.ini` | B1 | réglages PHP de production |
| `takussan-api/docker/entrypoint.sh` | B1 | met en cache config, routes, vues et évènements **au démarrage** |
| `takussan-api/docker/release.sh` | B1 | migrations, réconciliation des rôles, synchronisation Meilisearch |
| `deploy/takussan/compose.api.yml` | B2 | la pile d'API d'un environnement |
| `deploy/takussan/.env.smoke.example` | B2 | l'environnement du test de fumée local |
| `deploy/takussan/smoke-api.sh` | B1, B2 | le test de fumée de l'image (B1) puis de la pile (B2), rejouable |
| `takussan-api/docker/seed.sh`, `takussan-api/docker/lib.sh` | B1 | le seed d'une préproduction ; la liste des modèles indexés, partagée avec `release.sh` |
| `takussan-web/Dockerfile`, `takussan-web/.dockerignore` | B3 | image du front, par environnement |
| `takussan-web/next.config.ts` | B3 | `output: 'standalone'`, en-tête `X-Build-Sha` |
| `.github/workflows/images.yml` | B4 | construit, pousse, déclenche Dokploy, prouve le déploiement |
| `scripts/check-queues.mjs` | B5 | lit le Compose au lieu de `server-setup.sh` et `deploy.sh` |
| `scripts/check-front-env-keys.mjs` | B5 | exige aussi les `ARG` du Dockerfile et les `build-args` du workflow |
| `docs/infra/hebergement.md` | B6 | le relevé de l'état Dokploy et le runbook |
| **Supprimés** | B4, B5, B6 | `.github/workflows/deploy.yml`, `deploy-preview.yml`, `scripts/deploy.sh`, `scripts/server-setup.sh`, `scripts/seed-environnement.sh`, `scripts/seed-remote.sh`, `docs/infra/premier-deploiement.md`, `docs/infra/deploy-preview.html` |
| **Supprimés à F** | F5 | `.github/workflows/front-deploy-map.yml`, `docs/infra/frontend-deploiement.{md,json}`, `takussan-web/vercel.json` (créé en E1, pour ne vivre que jusque-là) |

**Dépôt `thiambara/check-print-plus`**

| Fichier | Tâche | Rôle |
|---|---|---|
| `laravel_api/Dockerfile`, `laravel_api/.dockerignore`, `laravel_api/docker/{Caddyfile,php.ini,entrypoint.sh,release.sh}` | C1 | même patron que B1, MySQL |
| `deploy/compose.api.yml`, `deploy/.env.smoke.example`, `deploy/smoke-api.sh` | C1 | pile d'API et test de fumée |
| `web/Dockerfile`, `web/.dockerignore`, `web/next.config.ts` | C2 | image du front, secret de build Sentry |
| `.github/workflows/images.yml` | C3 | préproduction sur `preview`, production par `workflow_dispatch` confirmé |
| `docs/hebergement.md` | C4 | relevé et renvoi vers ADR-0028 et ce plan |
| **Supprimés** | C3, C4 | `.github/workflows/deploy.yml`, `deploy-preview.yml`, `scripts/deploy.sh`, `scripts/deploy-prod-vps.sh`, `scripts/deploy-preview-vps.sh`, `scripts/server-setup.sh`, `netlify.toml` |

---

## Tâche 0 : les tickets

Un ticket par piste et par phase, **avant** tout code : le statut d'un ticket suit ce qui est fusionné
sur `dev` (CLAUDE.md, « Specs & backlog »).

- [ ] **Étape 1 : relever le dernier numéro**

Run: `ls docs/backlog/tickets | sed -E 's/^TCK-([0-9]+).*/\1/' | sort -n | tail -1`
Expected: `509` au 2026-09-13. Numéroter à partir du suivant.

- [ ] **Étape 2 : créer les tickets par `/write-spec`**

Un ticket pour chacun : A (serveur), B1-B2 (image et Compose d'API), B3 (image du front), B4-B5
(workflow et gardes), B6 (documentation), D (raccordement des préproductions), E (retrait de Vercel
des préproductions), F (production). `spec_refs` pointe vers ADR-0028 et ce plan ; `depends_on`
reproduit le graphe de la vue d'ensemble. Le ticket F porte `status: todo` et le tag `attendre-go`.

Chacun des trois tickets existants se ferme quand **son** défaut est mesuré fermé, avec une note qui
renvoie à ADR-0028 : TCK-288 à la fin de D (la chaîne qu'il visait n'existe plus), TCK-333 à la fin
de E (plus aucun build Vercel de préproduction), TCK-332 à la fin de F (le front public appelle une
API servie).

- [ ] **Étape 3 : régénérer l'index et vérifier**

Run: `node docs/backlog/gen-index.mjs && node docs/backlog/check-backlog.mjs`
Expected: sortie verte, sans écart.

- [ ] **Étape 4 : commit**

```bash
git add docs/backlog
git commit -m "docs(backlog): tickets de la migration vers l'auto-hébergement (ADR-0028)"
```

---

## Écarts constatés à l'exécution (2026-09-13)

Le code des tâches ci-dessous est celui du plan **tel qu'écrit** ; ce qui a été livré s'en écarte sur
les points suivants, chacun mesuré. Le dépôt fait foi.

| Où | Le plan disait | Mesuré | Livré |
|---|---|---|---|
| B1, C1 — Dockerfile de l'API | « pas de HEALTHCHECK » | l'image de base porte `curl -f http://localhost:2019/metrics` ; héritée, worker et scheduler sont déclarés malades | `HEALTHCHECK NONE`, et une vérification d'image qui l'exige |
| B1, C1 — Dockerfile de l'API | — | `artisan tinker` meurt sous `www-data` : `/config` (`$XDG_CONFIG_HOME`) appartient à root | `/config/psysh` créé et donné à `www-data` |
| B1, B3, C1, C2 — Dockerfiles | `# syntax=docker/dockerfile:1.7` | une requête vers Docker Hub à chaque build ; trois builds tombés sur un délai dépassé | directive retirée des quatre Dockerfiles. Le `RUN --mount=type=secret` de `web/` (CheckPrint Plus) passe sans elle : build avec un jeton sonde, zéro fuite dans l'historique, le système de fichiers et le journal |
| B1, C1 — Caddyfile | `request_body { max_size 25MiB }` reproduit `client_max_body_size` | il ne coupe que le corps LU : un POST de 26 Mio rendait 405 ou 302, jamais 413 | matcher `@trop_gros` sur `Content-Length`, `respond 413` |
| B2, C1 — `smoke-api.sh pile` | `up -d --wait` | Compose refuse `HEALTHCHECK NONE` sous `--wait` (« has no healthcheck configured ») ; Dokploy ne passe pas `--wait` | `up -d` puis vérifications explicites (release en 0, api saine, services en marche) |
| B2, C1 — `smoke-api.sh pile` | `compose run --rm release` | `run` suit `pull_policy: always`, pas le `--pull never` d'`up` | `run --rm --pull never` |
| B2, B3, C1, A2 — scripts | `cmd \| grep -q …` | sous `pipefail`, `grep -q` sort à la première correspondance, l'écrivain prend SIGPIPE (141) : deux ablations sur quatre ont rougi sur une vérification qu'elles ne touchaient pas | sortie capturée, puis `grep -q … <<<"$(cmd)"` |
| B2 — sonde des files | `dispatch(fn () => logger(…))` dans tinker | une closure écrite dans tinker n'est pas sérialisable | `Artisan::queue('inspire')->onQueue(…)` |
| B3, C2 — `smoke-web.sh` | tout échec du build sans origine vaut refus | un échec réseau y comptait comme refus : faux vert (piste C) | le refus exige le message de sa garde |
| B4, C3 — actions Docker | `@v3`, `@v3`, `@v6` | majeures publiées : v4.3.0, v4.6.0, v7.3.0 | `@v4`, `@v4`, `@v7` |
| A2 — `bootstrap.sh` | `iptables -D DOCKER-USER $(…)` | découpage de mots non quoté (shellcheck) | `read -ra` sur la règle relevée |
| C2 — `web/Dockerfile` | sans `NEXT_PUBLIC_SITE_URL`, `seo.ts` « retombe sur `https://checkprintplus.com` » | `ENV NEXT_PUBLIC_SITE_URL=${…}` pose une chaîne VIDE, que `??` ne remplace pas : `robots.txt` déclare `Sitemap: /sitemap.xml`, aucune canonique absolue | la garde reste ; son commentaire dit « origine vide ». (Côté Takussan, `alternates.ts` teste la chaîne vide : le repli sur la production y joue, le commentaire est juste.) |
| C2, étape 1 — relevé du bundle | `www.` et le motif `'/_next/static/chunks/[^"]+\.js'` | 0 chunk : Next 16 écrit les chemins sans `/` initial dans le flux RSC | motif `_next/static/chunks/[0-9a-zA-Z_-]+\.js` sur `/`, `/download`, `/auth/login` de l'apex : 16 chunks. La production ne pose **ni** DSN Sentry **ni** URL de téléchargement : ces variables restent vides |
| B3 — `next.config.ts` | `output: 'standalone'` sans condition | le build Vercel de la PR meurt après compilation dans `onBuildComplete` : `ENOENT … .next/next-server.js.nft.json`, que le mode standalone ne produit pas (34 succès sur les 35 déploiements précédents). `master` passe encore par Vercel jusqu'à F | `output: process.env.VERCEL ? undefined : 'standalone'` ; l'image, qui ne pose pas `VERCEL`, garde le standalone |
| C — CI de l'API CheckPrint Plus | — | rouge sur `dev` depuis 2026-06-14 : Pint (`TemplateFactory.php`) arrêtait le job, et masquait 15 tests qui ne passaient que sur un poste portant `public/build` et une clé LemonSqueezy dans son `.env` (reproduit en local : 15 échecs, 999 réussites) | Pint appliqué ; `withoutVite()` dans `TestCase` ; clé factice dans `phpunit.xml` (`Http::preventStrayRequests()` bloque tout appel réel) |
| C1, étape 11 — commit | `git add … deploy` | aurait embarqué `deploy/smoke-web.sh`, qui est de C2 | fichiers listés un par un |
| C3 — retrait de `deploy.yml` | — | c'est lui qui déploie aujourd'hui l'API de CheckPrint Plus à chaque `push` sur `master` | à la fusion sur `master`, plus rien ne déploie l'API avant la phase F ; le VPS étant réinstallé en piste A, l'ancienne cible disparaît de toute façon |
| A3, étape 1 — installation (2026-09-14) | `ssh … 'curl … \| sh'` au premier plan | une coupure réseau du poste a tué l'installation avec la session SSH | installation détachée (`nohup … > /root/dokploy-install.log`), runbook du relevé |
| A3, étape 5 — Let's Encrypt | — | `traefik.yml` garde l'adresse `test@localhost.com` posée par l'installation ; l'émission réussit quand même (certificat `CN=deploy.takussan.com`, émetteur `YR1`) | laissé tel quel, noté au relevé |
| A3, étape 3 — Cloudflare | des enregistrements proxifiés à relever | **aucun** enregistrement proxifié dans les deux zones ; Bot Fight illisible par le jeton (erreur `10000`, permission *Bot Management* absente) | Full (strict) posé sans effet sur le trafic existant ; Bot Fight vérifié au tableau de bord par le porteur |
| A4, étapes 7 et 10 — hôtes internes | l'hôte « affiché » | Dokploy **suffixe** le nom fourni : `serveur-postgres` devient `serveur-postgres-egr6ii`, `serveur-mysql` devient `serveur-mysql-vsqugl` | l'hôte se relève, il ne se choisit pas ; il est au relevé |
| A4, étape 10 — MySQL | `CREATE DATABASE … utf8mb4_unicode_ci` à la main | Dokploy crée la base et l'utilisateur lui-même, par l'environnement de l'image, en `utf8mb4_0900_ai_ci` (défaut de 8.4) ; le `GRANT` porte sur `checkprintplus\_preview` (souligné échappé) | `ALTER DATABASE … COLLATE utf8mb4_unicode_ci`, relu après redémarrage |
| B4 — `images.yml`, premier passage réel | un déploiement non raccordé est « sauté » | le job *Déploiement et preuve* **tourne** et s'arrête en vert sur une notice | runbook : seule la preuve `X-Build-Sha` prouve un déploiement |
| D1, étape 2 — valeurs relevées | reprises « du `.env` exporté en A1 » | les `.env` sont **dans** les archives `<projet>-shared.tgz` de l'export, pas à côté ; celui de la préproduction Takussan n'a aucune clé `SMS_*`, `WHATSAPP_*`, `FACEBOOK_*`, `APPLE_*`, `CDN_*`, `BUNNY_*`, et porte `SEED_DOWNLOAD_MEDIA=true` | clés absentes : défauts de `config/` ; `SEED_*` repris tels quels |
| D1, étape 3 — registre | l'Application du front tire par le registre `ghcr.io` | les images de Takussan sont publiques (jeton GHCR anonyme → `200`) | aucun registre pour Takussan ; il ne sert qu'à CheckPrint Plus (D7) |
| D3, étape 1 — secrets | `gh secret set … ` au clavier | un `… \| gh secret set` rejoué par une boucle de nouvel essai lit une entrée **vide** au second essai : le secret existe, vide | secret relu depuis un fichier, rouvert à chaque essai ; longueur vérifiée |
| D3, étape 2 — premier déploiement | le workflow déploie | le `compose.deploy` déclenché par le workflow a échoué au `pull` (délai dépassé vers `pkg-containers.githubusercontent.com`) ; l'image tirée à la main sur le serveur (32 s), puis `compose.deploy` relancé ; la preuve du workflow a constaté le commit servi | un échec de `pull` se relance ; il n'est pas une erreur de la pile |
| D4 — répertoire du Compose | `find … -path "*takussan*"` | le Compose `donnees` clone **tout** le dépôt : ce motif rend deux `compose.api.yml`, dont un sans `.env` | motif `*takussan-api-preview*` (celui du runbook) |
| D5, étape 2 — sonde des files | `dispatch(fn () => logger(…))` par `tinker --execute` | le défaut déjà relevé en B2, resté dans l'étape de D5 : `RuntimeException  Failed to serialize job … eval()'d code` (rejoué sur le serveur) — rien n'est poussé, et `jobs` → `0` ressemble à une file consommée | l'étape de D5 corrigée : `Artisan::queue('inspire')->onQueue(…)`, lu dans le journal du worker (`inspire … DONE`) |
| D5, étape 2 — `failed_jobs` | `0` | `23`, tous `BookingExpiredNotification` : `Class "Resend" not found` — `MAIL_MAILER=resend` sans `resend/resend-php`, absent de `composer.lock` depuis toujours | défaut de l'application, pas de la pile : relevé, correction laissée au porteur (SDK ou SMTP) |
| D6, étape 4 — plafond du front | 384 Mo (§ Budget) | aucune étape de D1 ne le pose : l'Application `takussan-web-preview` tournait **sans plafond** (`docker stats` : 7,755 GiB, la machine) | `application.update` `memoryLimit` en **octets** (unité confirmée sur PostgreSQL, `1073741824`) : 384 Mio pour le front Takussan, 256 Mio pour celui de CheckPrint Plus ; relu `51 MiB / 384 MiB` |
| D1, étape 2 — `GOOGLE_REDIRECT_URI` | reprise de l'export | sa valeur cite `${FRONTEND_URL}`, défini **plus bas** : `docker compose run` avertit `FRONTEND_URL variable is not set` (la valeur des services déployés était juste) | écrite en clair, comme pour CheckPrint Plus ; il ne reste que deux références, à `APP_NAME`, défini avant elles |
| D7, étape 1 — clé SSH | *Settings → SSH Keys* | `sshKey.generate` puis `sshKey.create` par l'API ; le clone est prouvé par un déploiement qui échoue ensuite au `pull` (`unauthorized`, sans registre) | la clé `github-check-print-plus`, deploy key `dokploy` en lecture seule |
| D8, étape 2 — secrets | — | le dépôt check-print-plus porte aussi une *deploy key* `Contabo` de l'ancien serveur (lecture seule, dernière utilisation le 2026-06-15) | retirée le 2026-09-14 (`gh repo deploy-key delete 145777232`), comme les secrets de la même chaîne ; relu : seule la clé `dokploy` reste |
| A5, étape 3 — clés dans R2 | un objet « sous le préfixe » `postgres/takussan_preview/` | Dokploy fait **précéder** le préfixe déclaré du nom interne du service : `serveur-postgres-egr6ii/postgres/…`, `takussan-api-preview-4iza80_api/volumes/…`, `backup-parse-multi-byte-card-vlwhry/dokploy/…`. Une liste filtrée sur le préfixe déclaré ne rend rien | liste complète du seau ; les clés sont au relevé |
| A5, étape 4 — configuration de Dokploy | *Settings → Backups*, si la version le propose | la v0.30.6 le propose (`backup.create`, `databaseType: web-server`) ; une manuelle : zip de 94 Mo lu dans R2 | activée : `dokploy/`, `30 4 * * *`, 7 exemplaires |
| D6, étape 2 — format de la sauvegarde | `gzip -t` réussi → SQL en clair → `psql` | Dokploy écrit `pg_dump -Fc \| gzip` : un `.sql.gz` qui contient une archive custom (`PGDMP`). `psql` n'en charge **rien**, sans ligne `ERROR` — premier essai : `copie 0` table | le format se lit après décompression ; étape corrigée (`pg_restore --no-owner --no-acl`) |
| D6, étape 2 — préproduction au repos | « aucune écriture n'a lieu » entre la sauvegarde et le comptage | second essai : 90 tables sur 92 égales ; `jobs` 3 → 0 et `scheduled_task_runs` 471 → 464, écrites après la sauvegarde (le planificateur tourne chaque minute) | troisième essai, préproduction arrêtée : diff **vide**, 92 tables, 86 927 lignes. L'étape dit désormais « arrêter d'abord » |
| D6, étape 3 — restauration du volume | « depuis Dokploy » | l'OpenAPI de la v0.30.6 n'expose aucune route de restauration | l'archive lue dans R2 depuis le serveur, extraite dans un volume neuf : 17 629 fichiers, même `sha256` ; volume supprimé ensuite |
| D7, étape 2 — registre | le registre de *Settings → Registry* suffit | `registry.create` ne fait pas de `docker login` sur le serveur, et un Compose n'a pas de champ de registre : le `pull` de l'API privée restait `unauthorized` | `docker login ghcr.io --password-stdin` sur le serveur, `config.json` en `600` ; au relevé, à refaire à chaque rotation du jeton |
| D7, étape 5 — IP par les compteurs | un passage de `reste` par client | une sonde perdue (coupure réseau du poste) rend `poste= serveur=59 poste-usurpant=59` : la valeur vide décale la lecture, et `59` se lit comme un en-tête cru | fenêtre rejouée tant qu'une valeur manque, deux sondes du poste : `59 puis 58 ; 59 ; 57` |
| D7, étape 5 — restauration MySQL | `diff` vide | deux comptages **vides** sont égaux : un premier essai qui n'avait rien compté (guillemets, MySQL local pas prêt) affichait `✓` | `diff` exigé sur une liste non vide : 51 tables, 719 lignes |
| D7, étape 4 — `ProductionSeeder` | « un nombre de plans non nul » | la migration `seed_free_plan` insère déjà un plan : `plans` vaut `1` **avant** le seeder, et le critère serait coché sans lui | comptes avant et après : `plans` 1 → 4, `roles` 0 → 2, `permissions` 0 → 3, `banks` 0 → 537, `templates` 0 → 89 ; attendu corrigé |
| D8, étape 1 — surveillance externe | UptimeRobot ou Better Stack, alerte par courriel | UptimeRobot retenu (usage commercial permis en gratuit, Telegram inclus) ; sa version gratuite ne surveille **pas** l'échéance des certificats | `.github/workflows/certificats.yml` : les certificats d'origine lus chaque jour sur le serveur, rouge sous 14 jours. Sondes mesurées sur le serveur (`tcpdump`) : 6 connexions d'UptimeRobot en 380 s |
| D8, étape 3 — TCK-288 | refermé « à la fin de D » | TCK-288 dépend encore de TCK-332, TCK-352 et TCK-355, ouverts : la garde du backlog refuse de clore un ticket dont une dépendance est ouverte (règle n°2). Et ses critères restants sont de production (`api.takussan.com/up`, index de production, garde de divergence, D-04) | TCK-288 **reste ouvert** jusqu'à F (TCK-517) ; la production ne se touche pas avant la décision du porteur. TCK-515 est refermé seul |

## Piste A — le serveur

Toutes les commandes de cette piste se jouent **sur le serveur** ou dans l'interface de Dokploy, sauf
mention contraire. Les valeurs secrètes ne s'écrivent ni dans le dépôt, ni dans un ticket, ni dans
une sortie collée dans une PR.

### Tâche A1 : exporter ce qui mérite de l'être

Le serveur ne porte que des préproductions, et le porteur accepte de repartir à blanc. L'export est un
**filet**, pas une migration : les bases seront reconstruites par le seed (D4). Ce qui a de la valeur,
ce sont **les `.env`**, qui portent les clés des fournisseurs (SMS, WhatsApp, LemonSqueezy, Resend,
Google), et les médias téléversés à la main.

**Files:** aucun fichier du dépôt.

- [ ] **Étape 1 : relever ce qui existe, sans rien supposer**

```bash
ssh "$CONTABO_USER@178.18.247.62"
sudo -u postgres psql -lqt | cut -d'|' -f1 | sed '/^ *$/d'
sudo mysql -N -e 'SHOW DATABASES'
ls -d /var/www/*/shared
du -sh /var/www/*/shared/storage/app 2>/dev/null
ls /etc/meilisearch* /var/lib/meilisearch 2>/dev/null
```

Expected : `takussan_preview` côté PostgreSQL, les bases de CheckPrint Plus côté MySQL, et les quatre
répertoires `shared` (`takussan`, `takussan-preview`, `check-print-plus`, `check-print-plus-preview`).
**Noter les noms réels** : les étapes suivantes les utilisent.

- [ ] **Étape 2 : exporter**

```bash
d=~/export-$(date +%F) && mkdir -p "$d"
sudo -u postgres pg_dump -Fc -d takussan_preview > "$d/takussan_preview.dump"
# une ligne par base MySQL relevée à l'étape 1
sudo mysqldump --single-transaction --routines --triggers <base_relevée> > "$d/<base_relevée>.sql"
for app in takussan takussan-preview check-print-plus check-print-plus-preview; do
  sudo tar -C "/var/www/$app/shared" -czf "$d/$app-shared.tgz" .env storage/app 2>/dev/null || echo "✗ $app"
done
sudo cp /etc/meilisearch.toml "$d/" 2>/dev/null || true
ls -la "$d"
```

Les `<base_relevée>` sont les noms lus à l'étape 1, pas des gabarits à deviner.

- [ ] **Étape 3 : chiffrer, rapatrier, effacer du serveur**

```bash
sudo tar -C ~ -cf - "$(basename "$d")" | gpg --symmetric --cipher-algo AES256 -o ~/export.tar.gpg
```

Depuis le poste : `scp "$CONTABO_USER@178.18.247.62:export.tar.gpg" ~/Sauvegardes/vps-2026-09-13.tar.gpg`.
La phrase de passe va dans le gestionnaire de mots de passe. **Jamais dans le dépôt**, ni en clair à
côté de l'archive.

- [ ] **Étape 4 : prouver que l'export se relit**

Sur le poste, dans le répertoire de l'archive déchiffrée :

```bash
docker run --rm -v "$PWD:/x" pgvector/pgvector:pg17 pg_restore --list /x/takussan_preview.dump | grep -c 'TABLE DATA'
for f in *-shared.tgz; do echo "$f : $(tar -tzf "$f" | wc -l) entrées"; done
```

Expected : un nombre de tables non nul (de l'ordre de la centaine) et des archives non vides. *Une
sauvegarde jamais relue n'est pas une sauvegarde* (ADR-0028 §7).

### Tâche A2 : réinstaller le serveur et le préparer

**Files:**
- Create: `deploy/server/bootstrap.sh`

**Interfaces:**
- Produces : un Ubuntu 24.04 joignable en SSH **par clé seulement** (root, `PermitRootLogin
  prohibit-password`), ufw sur 22/80/443, Docker installé avec la rotation des journaux, 4 Go de swap,
  l'unité `fermer-port-3000` active. A3 en dépend.

- [ ] **Étape 1 : écrire `deploy/server/bootstrap.sh`**

```bash
#!/usr/bin/env bash
# Prépare un Ubuntu 24.04 VIERGE à recevoir Dokploy (ADR-0028, plan tâche A2).
#
# Idempotent : rejouable sans effet de bord. À lancer en root, une seule fois par machine.
#   ADMIN_IP=<ip publique du poste> bash bootstrap.sh
#
# ADMIN_IP garde l'interface de Dokploy (port 3000) joignable depuis le poste le temps de lui
# donner son domaine (A3). Rejouer ensuite SANS ADMIN_IP ferme le port à tous.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "✗ à lancer en root" >&2; exit 1; }
grep -q 'VERSION_ID="24.04"' /etc/os-release || { echo "✗ Ubuntu 24.04 attendu" >&2; exit 1; }

# ── 1. Swap de 4 Go ──────────────────────────────────────────────────────────────────────
# 8 Go pour quatre environnements : sans swap, le premier pic (un `scout:import`, un seed)
# réveille l'OOM killer, qui choisit sa victime — souvent la base.
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -q --system

# ── 2. Mises à jour de sécurité automatiques ──────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install ufw unattended-upgrades fail2ban curl ca-certificates jq
dpkg-reconfigure -f noninteractive unattended-upgrades

# ── 3. SSH par clé seulement ──────────────────────────────────────────────────────────────
[ -s /root/.ssh/authorized_keys ] || { echo "✗ aucune clé dans /root/.ssh/authorized_keys : on se fermerait dehors" >&2; exit 1; }
cat > /etc/ssh/sshd_config.d/10-durcissement.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh

# ── 4. Pare-feu ───────────────────────────────────────────────────────────────────────────
# ⚠ ufw NE PROTÈGE PAS les ports publiés par Docker : Docker écrit ses règles dans la chaîne
# FORWARD, avant ufw. C'est l'objet du point 6. Et ne JAMAIS installer iptables-persistent :
# il désinstalle ufw.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 5. Docker, journaux bornés AVANT le premier conteneur ─────────────────────────────────
# Sans rotation, un worker bavard remplit le disque, et un disque plein met PostgreSQL en
# lecture seule pour les quatre environnements à la fois.
install -d /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# ── 6. Fermer le port 3000 (interface de Dokploy) sur l'interface publique ────────────────
# Dokploy publie son interface sur 3000, par Docker, donc hors de portée d'ufw. La règle vit
# dans DOCKER-USER, que Docker évalue avant ses propres règles et ne vide jamais. Elle
# compare le port d'ORIGINE (conntrack), puisque le paquet a déjà été redirigé.
cat > /usr/local/sbin/fermer-port-3000 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[ -f /etc/default/fermer-port-3000 ] && . /etc/default/fermer-port-3000
iface=$(ip route show default | awk '{print $5; exit}')
for outil in iptables ip6tables; do
  for _ in $(seq 30); do "$outil" -L DOCKER-USER -n >/dev/null 2>&1 && break; sleep 1; done
  "$outil" -L DOCKER-USER -n >/dev/null 2>&1 || continue
  regle=(-i "$iface" -p tcp -m conntrack --ctorigdstport 3000 --ctdir ORIGINAL)
  "$outil" -C DOCKER-USER "${regle[@]}" -j DROP 2>/dev/null || "$outil" -I DOCKER-USER "${regle[@]}" -j DROP
  # l'exception de l'administrateur, insérée APRÈS, passe donc AVANT le DROP
  if [ "$outil" = iptables ] && [ -n "${ADMIN_IP:-}" ]; then
    "$outil" -C DOCKER-USER -s "$ADMIN_IP" "${regle[@]}" -j RETURN 2>/dev/null \
      || "$outil" -I DOCKER-USER -s "$ADMIN_IP" "${regle[@]}" -j RETURN
  fi
done
EOF
chmod 755 /usr/local/sbin/fermer-port-3000
if [ -n "${ADMIN_IP:-}" ]; then
  echo "ADMIN_IP=${ADMIN_IP}" > /etc/default/fermer-port-3000
else
  rm -f /etc/default/fermer-port-3000
  # retirer une exception posée par un passage précédent
  while iptables -S DOCKER-USER | grep -q -- '--ctorigdstport 3000.*-j RETURN'; do
    iptables -D DOCKER-USER $(iptables -S DOCKER-USER | grep -- '--ctorigdstport 3000.*-j RETURN' | head -1 | sed 's/^-A DOCKER-USER //')
  done
fi
cat > /etc/systemd/system/fermer-port-3000.service <<'EOF'
[Unit]
Description=Ferme le port 3000 (interface Dokploy) sur l'interface publique
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/fermer-port-3000

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable fermer-port-3000
systemctl restart fermer-port-3000

echo "✓ serveur préparé. Mesurer maintenant depuis le POSTE (plan, tâche A2, étape 4)."
```

- [ ] **Étape 2 : vérifier la syntaxe en local, et la garde des heredocs**

Run: `bash -n deploy/server/bootstrap.sh && shellcheck deploy/server/bootstrap.sh`
Expected : aucune sortie. (`scripts/check-heredocs.mjs` ne balaie que `scripts/*.sh` et `dev.sh` ;
les heredocs de ce fichier sont tous quotés `<<'EOF'`, ce que la garde exigerait.)

- [ ] **Étape 3 : réinstaller le serveur**

Dans le panneau Contabo : *Reinstall* → Ubuntu 24.04, **clé SSH publique du poste** en accès root.
Puis :

```bash
scp deploy/server/bootstrap.sh root@178.18.247.62:
ssh root@178.18.247.62 "ADMIN_IP=$(curl -s https://api.ipify.org) bash bootstrap.sh"
```

⚠ **Garder la session ouverte** et tester `ssh root@178.18.247.62 true` depuis un **second**
terminal avant de la fermer : c'est ce qui prouve qu'on ne s'est pas fermé dehors.

- [ ] **Étape 4 : mesurer, depuis le poste**

```bash
ssh -o PasswordAuthentication=yes -o PubkeyAuthentication=no root@178.18.247.62 true   # → Permission denied (publickey)
ssh root@178.18.247.62 'swapon --show; ufw status; docker info --format "{{.LoggingDriver}}"; systemctl is-active fermer-port-3000'
```

Expected : refus du mot de passe ; une ligne `/swapfile 4G` ; ufw actif sur 22, 80 et 443 ;
`json-file` ; `active`.

- [ ] **Étape 5 : commit**

```bash
git add deploy/server/bootstrap.sh
git commit -m "build(infra): script de préparation du serveur pour Dokploy (ADR-0028)"
```

### Tâche A3 : installer et régler Dokploy

**Files:** aucun fichier du dépôt ; les relevés de cette tâche vont dans `docs/infra/hebergement.md` (B6).

**Interfaces:**
- Consumes : le serveur préparé par A2, avec `ADMIN_IP` encore autorisée sur le port 3000.
- Produces : Dokploy joignable sur `https://deploy.takussan.com` et **seulement** là ; un registre
  GHCR déclaré ; Traefik qui fait confiance aux plages Cloudflare ; une clé d'API Dokploy (secret
  GitHub en D3).

- [ ] **Étape 1 : installer**

```bash
ssh root@178.18.247.62 'curl -sSL https://dokploy.com/install.sh | sh'
ssh root@178.18.247.62 "docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'"
```

Expected : l'installation se termine sur l'URL `http://178.18.247.62:3000`, et la seconde commande
rend l'image et sa version. **Noter la version** : elle entre dans le relevé.

- [ ] **Étape 2 : compte d'administration et double authentification**

Ouvrir `http://178.18.247.62:3000` depuis le poste (seule IP autorisée), créer le compte, puis
*Settings → Profile → Two-Factor Authentication*. Mot de passe et codes de secours dans le
gestionnaire de mots de passe.

- [ ] **Étape 3 : relever la zone Cloudflare AVANT d'y toucher**

Dans le tableau de bord Cloudflare de `takussan.com` puis de `checkprintplus.com`, *DNS → Records* :
noter, pour chaque enregistrement, s'il est **proxifié** (nuage orange) ou non. Puis *SSL/TLS →
Overview* : noter le mode courant.

Le réglage de mode ne s'applique qu'aux enregistrements proxifiés. Si `www` (Vercel) est proxifié, le
passage en Full (strict) le concerne aussi — Vercel présente un certificat valide, donc il le supporte ;
c'est la raison de relever d'abord.

- [ ] **Étape 4 : régler Cloudflare pour les deux zones**

*SSL/TLS → Overview* : **Full (strict)**. *SSL/TLS → Edge Certificates* : **Always Use HTTPS
désactivé** (la redirection est faite par Traefik, et le défi HTTP-01 de Let's Encrypt doit passer
en clair). *Security → Bots* : **Bot Fight Mode désactivé** (ADR-0028, « ce que ça coûte »).

- [ ] **Étape 5 : donner son domaine à Dokploy**

DNS : `deploy.takussan.com` **A** → `178.18.247.62`, **proxifié**. Dans Dokploy : *Settings → Web
Server → Server Domain* = `deploy.takussan.com`, certificat Let's Encrypt, HTTPS activé.

Run (depuis le poste) : `curl -sS -o /dev/null -w '%{http_code}\n' https://deploy.takussan.com/`
Expected : `200` ou une redirection vers la page de connexion (`3xx`), jamais `000` ni `52x`.

- [ ] **Étape 6 : fermer le port 3000 à tous**

```bash
scp deploy/server/bootstrap.sh root@178.18.247.62:
ssh root@178.18.247.62 'bash bootstrap.sh'          # SANS ADMIN_IP
curl -sS -m 5 -o /dev/null -w '%{http_code}\n' http://178.18.247.62:3000/                  # depuis le poste
ssh root@178.18.247.62 "curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/"  # depuis le serveur
```

Expected : `000` depuis le poste (délai dépassé), `200` ou `3xx` depuis le serveur. *Un port fermé se
prouve de l'extérieur* : ufw affiche « 3000 absent » même quand Docker le publie.

- [ ] **Étape 7 : le registre GHCR**

Créer sur GitHub un jeton **classique** portant la seule portée `read:packages` (GHCR ne reconnaît
pas les jetons à grain fin pour tirer une image). Dokploy : *Settings → Registry → Add* :
`ghcr.io`, utilisateur `thiambara`, mot de passe = le jeton. *Test* doit réussir.

- [ ] **Étape 8 : Traefik ne croit les en-têtes `X-Forwarded-*` que de Cloudflare**

Générer la liste **le jour même**, jamais depuis une copie :

```bash
{ curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; } \
  | sed '/^$/d; s/^/          - /'
```

Dokploy : *Traefik → File System → `traefik.yml`*. Ajouter, sous **chacun** des deux points
d'entrée `web` et `websecure`, sans toucher au reste :

```yaml
    forwardedHeaders:
      trustedIPs:
          - 173.245.48.0/20        # ← coller ici la sortie de la commande ci-dessus, entière
```

Puis *Reload Traefik*. Coller la liste datée dans le relevé (B6). La preuve que l'IP du client
arrive jusqu'à Laravel n'est pas ici : elle se fait par ablation en D5.

- [ ] **Étape 9 : entretien et alertes**

- *Settings → Server* : **Daily Docker Cleanup** activé.
- *Settings → Notifications* : un canal (courriel ou Telegram), pour les évènements *échec de
  déploiement*, *sauvegarde de base*, *nettoyage Docker* et *seuil serveur*.
- *Monitoring* : seuils CPU 90 %, mémoire 85 %.

- [ ] **Étape 10 : la clé d'API**

*Settings → Profile → API/CLI → Generate*. La ranger dans le gestionnaire de mots de passe.

Run (depuis le poste) : `curl -fsS -H "x-api-key: $DOKPLOY_API_KEY" https://deploy.takussan.com/api/project.all | jq length`
Expected : un entier (`0` à ce stade). Un `401` signifie une clé fausse ; un HTML, un mauvais chemin.

### Tâche A4 : les données

**Files:**
- Create: `deploy/server/compose.data.yml`
- Create: `deploy/server/.env.example`

**Interfaces:**
- Produces, sur le réseau `dokploy-network` :
  - `meilisearch:7700` ; clé `preview_*` pour Takussan ;
  - `redis-takussan:6379` et `redis-cpp:6379`, protégés par mot de passe ;
  - un service Database PostgreSQL (hôte interne affiché par Dokploy), base et rôle `takussan_preview` ;
  - un service Database MySQL, base et utilisateur `checkprintplus_preview`.
  Les noms d'hôte internes des deux services Database vont au relevé (B6) et dans les
  environnements de D1.

- [ ] **Étape 1 : écrire `deploy/server/compose.data.yml`**

```yaml
# Données partagées du serveur (ADR-0028 §6) : Meilisearch et un Redis par projet.
#
# PostgreSQL et MySQL n'y sont PAS : ce sont des services Database de Dokploy, pour la
# sauvegarde vers R2 et la restauration intégrées. Ce fichier ne porte que ce qui se
# reconstruit — l'index depuis la base, le cache par définition.
#
# Aucun port publié : ces services ne sont joignables que depuis `dokploy-network`.
# Déployé par Dokploy (projet « Serveur », Compose « donnees »), jamais à la main.

services:
  meilisearch:
    image: getmeili/meilisearch:v1.16
    restart: unless-stopped
    environment:
      MEILI_ENV: production
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY:?MEILI_MASTER_KEY manquante}
      MEILI_NO_ANALYTICS: "true"
      MEILI_MAX_INDEXING_MEMORY: 256Mb
    volumes:
      - meili:/meili_data
    mem_limit: 768m
    networks:
      - dokploy-network

  # volatile-lru : seules les clés À DURÉE DE VIE sont évincées. Le cache en porte une ; un
  # verrou ou un compteur sans durée n'est jamais évincé en silence.
  redis-takussan:
    image: redis:8-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy volatile-lru --requirepass ${REDIS_TAKUSSAN_PASSWORD:?REDIS_TAKUSSAN_PASSWORD manquant}
    volumes:
      - redis-takussan:/data
    mem_limit: 192m
    networks:
      - dokploy-network

  redis-cpp:
    image: redis:8-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 64mb --maxmemory-policy volatile-lru --requirepass ${REDIS_CPP_PASSWORD:?REDIS_CPP_PASSWORD manquant}
    volumes:
      - redis-cpp:/data
    mem_limit: 96m
    networks:
      - dokploy-network

volumes:
  meili:
  redis-takussan:
  redis-cpp:

networks:
  dokploy-network:
    external: true
```

- [ ] **Étape 2 : écrire `deploy/server/.env.example`**

```dotenv
# Les CLÉS exigées par compose.data.yml. Les VALEURS vivent dans l'onglet Environment du
# Compose « donnees » de Dokploy et dans le gestionnaire de mots de passe — jamais ici.
MEILI_MASTER_KEY=
REDIS_TAKUSSAN_PASSWORD=
REDIS_CPP_PASSWORD=
```

- [ ] **Étape 3 : valider en local, y compris le refus d'une clé absente**

```bash
MEILI_MASTER_KEY=x REDIS_TAKUSSAN_PASSWORD=y REDIS_CPP_PASSWORD=z \
  docker compose -f deploy/server/compose.data.yml config -q && echo OK
REDIS_TAKUSSAN_PASSWORD=y REDIS_CPP_PASSWORD=z \
  docker compose -f deploy/server/compose.data.yml config -q
```

Expected : `OK`, puis une erreur qui nomme `MEILI_MASTER_KEY manquante`.

- [ ] **Étape 4 : commit, puis déployer depuis Dokploy**

```bash
git add deploy/server/compose.data.yml deploy/server/.env.example
git commit -m "build(infra): données partagées du serveur — Meilisearch et Redis (ADR-0028)"
```

Dokploy : projet **Serveur** → *Create Service → Compose* `donnees`. Fournisseur *Git*, dépôt
`https://github.com/thiambara/takussan.git`, branche `preview` (elle passera à `master` en F3),
chemin `deploy/server/compose.data.yml`, **Autodeploy désactivé**. Onglet *Environment* : les trois
valeurs, chacune générée par `openssl rand -base64 48 | tr -d '/+='`. *Deploy*.

⚠ Ce Compose ne construit rien : Dokploy clone le dépôt et tire des images publiques. Il reste dans la
règle d'ADR-0028 §2.

- [ ] **Étape 5 : mesurer que les trois services répondent sur le réseau interne**

```bash
ssh root@178.18.247.62
docker run --rm --network dokploy-network curlimages/curl -fsS http://meilisearch:7700/health
docker run --rm --network dokploy-network redis:8-alpine redis-cli -h redis-takussan -a "$REDIS_TAKUSSAN_PASSWORD" --no-auth-warning PING
docker run --rm --network dokploy-network redis:8-alpine redis-cli -h redis-cpp PING
```

Expected : `{"status":"available"}`, `PONG`, puis `NOAUTH Authentication required.` — le troisième
prouve que le mot de passe est **exigé**, pas seulement accepté.

- [ ] **Étape 6 : la clé Meilisearch de préproduction, restreinte à ses index**

```bash
docker run --rm --network dokploy-network curlimages/curl -fsS -X POST http://meilisearch:7700/keys \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" -H 'Content-Type: application/json' \
  -d '{"description":"takussan preview","actions":["*"],"indexes":["preview_*"],"expiresAt":null}' | jq -r .key
```

Ranger la clé rendue. Puis **prouver la restriction** :

```bash
docker run --rm --network dokploy-network curlimages/curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST http://meilisearch:7700/indexes -H "Authorization: Bearer $CLE_PREVIEW" \
  -H 'Content-Type: application/json' -d '{"uid":"prod_sonde"}'
docker run --rm --network dokploy-network curlimages/curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST http://meilisearch:7700/indexes -H "Authorization: Bearer $CLE_PREVIEW" \
  -H 'Content-Type: application/json' -d '{"uid":"preview_sonde"}'
```

Expected : `403` pour `prod_sonde`, `202` pour `preview_sonde`. Supprimer ensuite l'index sonde :
`curl -X DELETE …/indexes/preview_sonde` avec la clé maîtresse. La clé `prod_*` se crée en F1.

- [ ] **Étape 7 : le service PostgreSQL**

Dokploy, projet **Serveur** → *Create Service → Database → PostgreSQL* : nom `postgres`, image
**`pgvector/pgvector:pg17`**, base `postgres`, utilisateur `pgadmin`, mot de passe généré. **Aucun
port externe.** *Advanced → Resources* : limite mémoire 1 Go. *Deploy*. Noter l'**hôte interne**
affiché.

- [ ] **Étape 8 : créer la base de préproduction, en déclarant sa collation**

```bash
PG=$(docker ps -q -f ancestor=pgvector/pgvector:pg17 | head -1)
read -rs MDP    # généré par : openssl rand -base64 32 | tr -d '/+='
docker exec -i "$PG" psql -U pgadmin -d postgres -v ON_ERROR_STOP=1 -v mdp="$MDP" <<'SQL'
CREATE ROLE takussan_preview LOGIN PASSWORD :'mdp';
CREATE DATABASE takussan_preview OWNER takussan_preview
  ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0;
REVOKE CONNECT ON DATABASE takussan_preview FROM PUBLIC;
GRANT CONNECT ON DATABASE takussan_preview TO takussan_preview;
ALTER SYSTEM SET shared_buffers = '256MB';
SQL
```

`LOCALE 'C'` se **déclare** à la création : il ne s'hérite pas de l'instance (ADR-0020). Puis
redémarrer le service depuis Dokploy, pour `shared_buffers`.

- [ ] **Étape 9 : mesurer ce que la base est, et ce qu'elle refuse**

```bash
docker exec -i "$PG" psql -U pgadmin -d postgres -At <<'SQL'
SELECT datname, datcollate, datctype, pg_encoding_to_char(encoding) FROM pg_database WHERE datname = 'takussan_preview';
SELECT count(*) FROM pg_collation WHERE collname = 'und-x-icu';
SELECT count(*) FROM pg_available_extensions WHERE name = 'vector';
SHOW shared_buffers;
CREATE ROLE sonde LOGIN PASSWORD 'sonde';
SQL
docker exec -e PGPASSWORD=sonde "$PG" psql -h 127.0.0.1 -U sonde -d takussan_preview -c 'SELECT 1'
docker exec "$PG" psql -U pgadmin -d postgres -c 'DROP ROLE sonde'
```

Expected : `takussan_preview|C|C|UTF8`, `1` (collation ICU, ADR-0025), `1` (pgvector disponible,
ADR-0020), `256MB`, puis **`permission denied for database "takussan_preview"`** pour le rôle sonde.
Ce refus est la preuve du `REVOKE` : sans lui, tout rôle se connecte à toute base.

- [ ] **Étape 10 : le service MySQL et la base de CheckPrint Plus**

Dokploy → *Database → MySQL* : nom `mysql`, image **`mysql:8.4`**, mot de passe root généré, aucun
port externe, limite mémoire 640 Mo. *Deploy*. Puis :

```bash
MY=$(docker ps -q -f ancestor=mysql:8.4 | head -1)
read -rs ROOT; read -rs MDP
docker exec -i -e MYSQL_PWD="$ROOT" "$MY" mysql -uroot <<SQL
CREATE DATABASE checkprintplus_preview CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'checkprintplus_preview'@'%' IDENTIFIED BY '${MDP}';
GRANT ALL PRIVILEGES ON checkprintplus_preview.* TO 'checkprintplus_preview'@'%';
SET PERSIST innodb_buffer_pool_size = 268435456;
SET PERSIST_ONLY performance_schema = OFF;
SQL
docker exec -e MYSQL_PWD="$ROOT" "$MY" mysql -uroot -N -e \
  "SELECT user, host, LENGTH(user) FROM mysql.user WHERE user LIKE 'checkprintplus%';
   SHOW GRANTS FOR 'checkprintplus_preview'@'%';"
```

Expected : `checkprintplus_preview  %  22`, puis le `GRANT ALL PRIVILEGES ON
\`checkprintplus_preview\`.*`. **`LENGTH()` est la mesure** : c'est un nom tronqué d'un caractère,
lisible à l'œil comme juste, qui a fait échouer les deux seuls déploiements de production de
Takussan (CLAUDE.md, « Workflow git »). `utf8mb4_unicode_ci` est la collation par défaut de
`laravel_api/config/database.php`. Redémarrer le service pour `performance_schema`.

### Tâche A5 : les sauvegardes

**Files:** aucun fichier du dépôt.

- [ ] **Étape 1 : le seau R2**

Cloudflare → *R2* : seau `vps-sauvegardes`, indication de localisation Europe. *Manage R2 API
Tokens* : un jeton **Object Read & Write limité à ce seau**. Noter l'identifiant de compte (il forme
l'URL `https://<identifiant de compte>.r2.cloudflarestorage.com`), l'Access Key ID et le secret.

- [ ] **Étape 2 : la destination dans Dokploy**

*Settings → S3 Destinations → Add* : fournisseur Cloudflare, région `auto`, l'URL ci-dessus, le seau,
les deux clés. *Test Connection* doit réussir.

- [ ] **Étape 3 : les sauvegardes de bases**

| Service | Base | Planification | Préfixe | Exemplaires gardés |
|---|---|---|---|---|
| `postgres` | `takussan_preview` | `0 3 * * *` | `postgres/takussan_preview/` | 14 |
| `mysql` | `checkprintplus_preview` | `30 3 * * *` | `mysql/checkprintplus_preview/` | 14 |

Pour chacune, *Backups → Add*, puis **lancer une sauvegarde manuelle tout de suite**.

Expected : un objet par base dans R2, sous le préfixe, de taille non nulle — lu dans le tableau de
bord R2, pas dans la liste de Dokploy. Il n'y a encore aucune ligne dans les bases : ce premier
passage prouve le **chemin**, la restauration à blanc (D5) prouvera le **contenu**.

- [ ] **Étape 4 : la configuration de Dokploy elle-même**

Si la version relevée en A3 propose la sauvegarde de sa propre base (*Settings → Backups*), l'activer
vers R2 : préfixe `dokploy/`, `30 4 * * *`, 7 exemplaires. Elle porte les variables d'environnement de
tous les services. Si la version ne le propose pas, **l'écrire dans le relevé** (B6) : le
gestionnaire de mots de passe reste alors la seule copie des valeurs.

---

## Piste B — dépôt takussan

Tout se joue **en local**, sur la branche de la piste, avec Docker Desktop et les services de
`docker-compose.yml` (`docker compose up -d postgres meilisearch redis`). Rien ne touche le serveur
avant D.

### Tâche B1 : l'image de l'API

**Files:**
- Create: `takussan-api/Dockerfile`
- Create: `takussan-api/.dockerignore`
- Create: `takussan-api/docker/Caddyfile`
- Create: `takussan-api/docker/php.ini`
- Create: `takussan-api/docker/entrypoint.sh`
- Create: `takussan-api/docker/lib.sh`
- Create: `takussan-api/docker/release.sh`
- Create: `takussan-api/docker/seed.sh`
- Create: `deploy/takussan/smoke-api.sh` (partie `image`)

**Interfaces:**
- Produces :
  - image `ghcr.io/thiambara/takussan-api:<tag>`, cible `runtime` — utilisateur `www-data`, écoute
    sur `8080`, `ENTRYPOINT /app/docker/entrypoint.sh`, `CMD frankenphp run` ;
  - image `ghcr.io/thiambara/takussan-api:<tag>-seed`, cible `seed` — la même, plus les dépendances
    de dev ;
  - `/app/docker/release.sh` et `/app/docker/seed.sh`, exécutables, lancés comme `entrypoint` par
    le Compose (B2) ; `/app/.search-shape`, empreinte de 64 caractères hexadécimaux ;
  - l'argument de build `BUILD_SHA`, rendu dans l'en-tête `X-Build-Sha`.

- [ ] **Étape 1 : écrire le test d'abord — `deploy/takussan/smoke-api.sh`, partie `image`**

```bash
#!/usr/bin/env bash
# Test de fumée de l'image d'API Takussan et de sa pile Compose, EN LOCAL (ADR-0028, plan B1-B2).
#
#   deploy/takussan/smoke-api.sh image   # l'image seule
#   deploy/takussan/smoke-api.sh pile    # la pile entière, contre les services de docker-compose.yml
#
# Prérequis : l'image construite sous le tag `local` (et `local-seed` pour la pile) :
#   docker build --build-arg BUILD_SHA=smoke --target runtime -t ghcr.io/thiambara/takussan-api:local takussan-api
#   docker build --build-arg BUILD_SHA=smoke --target seed -t ghcr.io/thiambara/takussan-api:local-seed takussan-api
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE=ghcr.io/thiambara/takussan-api
TAG=local

echec() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }
dans() { docker run --rm --entrypoint "$1" "$IMAGE:$TAG" "${@:2}"; }

verifier_image() {
  local exts n
  exts=$(dans php -m)
  for e in pdo_pgsql pgsql redis intl bcmath gd zip exif pcntl 'Zend OPcache'; do
    grep -qx "$e" <<<"$exts" || echec "extension PHP absente : $e"
  done
  ok "extensions PHP"

  [ "$(dans id -un)" = www-data ] || echec "l'image ne tourne pas sous www-data"
  ok "utilisateur www-data"

  # Le poste porte des .env RÉELS dans takussan-api/ (ignorés par git, PAS par Docker).
  n=$(dans sh -c 'ls -A /app | grep -c "^\.env" || true')
  [ "$n" = 0 ] || echec "$n fichier(s) .env* dans l'image : .dockerignore ne les exclut plus"
  ok "aucun .env dans l'image"

  dans php -r 'require "/app/vendor/autoload.php"; exit(class_exists("Faker\\Factory") ? 1 : 0);' \
    || echec "Faker est dans l'image runtime : des dépendances de dev y sont installées"
  ok "aucune dépendance de dev"

  dans sh -c 'grep -Eqx "[0-9a-f]{64}" /app/.search-shape' || echec ".search-shape absente ou mal formée"
  ok "empreinte .search-shape"

  dans test -f /app/public/build/manifest.json || echec "assets Vite absents (public/build/manifest.json)"
  ok "assets Vite"

  [ "$(dans readlink /app/public/storage)" = /app/storage/app/public ] || echec "lien public/storage absent"
  ok "lien public/storage"

  [ "$(dans printenv BUILD_SHA)" = smoke ] || echec "BUILD_SHA n'est pas transmis à l'image"
  ok "BUILD_SHA"
}

case "${1:-}" in
  image) verifier_image ;;
  *) echo "usage : $0 image|pile" >&2; exit 2 ;;
esac
```

- [ ] **Étape 2 : le lancer, et le voir échouer**

Run: `chmod +x deploy/takussan/smoke-api.sh && deploy/takussan/smoke-api.sh image`
Expected : échec, `Unable to find image 'ghcr.io/thiambara/takussan-api:local'`.

- [ ] **Étape 3 : épingler FrankenPHP**

```bash
docker run --rm dunglas/frankenphp:1-php8.4-bookworm frankenphp version
```

La sortie commence par `FrankenPHP v1.X.Y PHP 8.4.Z`. Le tag épinglé est `1.X.Y-php8.4-bookworm`,
avec les chiffres lus. Le vérifier : `docker buildx imagetools inspect dunglas/frankenphp:<ce tag>` doit
rendre un manifeste. C'est lui qu'on écrit à la première ligne du Dockerfile, à l'étape suivante, à la
place de `1-php8.4-bookworm`.

- [ ] **Étape 4 : écrire `takussan-api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
#
# Image de l'API Takussan (ADR-0028 §3-4). UNE image par commit, qui sert la préproduction ET la
# production : aucune configuration n'y est cuite, tout arrive par l'environnement du conteneur.
#
#   runtime — api, worker, worker-media, scheduler et release : même image, commandes différentes
#   seed    — runtime + dépendances de dev, pour `db:seed` (Faker en est une, TCK-353)
#
# Pas de HEALTHCHECK ici : worker et scheduler n'écoutent aucun port, une sonde HTTP d'image les
# déclarerait tous malades. La sonde vit sur le seul service `api` (deploy/takussan/compose.api.yml).
ARG FRANKENPHP_TAG=1-php8.4-bookworm

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
```

- [ ] **Étape 5 : écrire `takussan-api/.dockerignore`**

```gitignore
# ⚠ `.env*` EN TÊTE. Sur le poste, takussan-api/ porte des .env RÉELS de préproduction et de
# production : ignorés par git, PAS par Docker. Sans cette ligne, `docker build` les copie dans
# une image qu'on pousse ensuite sur un registre. smoke-api.sh le vérifie à chaque passage.
.env*
.git
.idea
.claude
.cursor
.DS_Store
.phpunit.result.cache
node_modules
vendor
public/build
public/hot
public/storage
bootstrap/cache/*.php
storage
tests
docs
coverage*.txt
Dockerfile
.dockerignore
```

- [ ] **Étape 6 : écrire `takussan-api/docker/Caddyfile`**

Chaque règle reprend une règle du vhost nginx de `scripts/server-setup.sh`, qui disparaît en B5.

```caddyfile
{
	frankenphp
	auto_https off
	admin off
	# PAS de `trusted_proxies` ici, et c'est délibéré. Avec lui, Caddy retiendrait comme adresse
	# du client l'IP la plus à GAUCHE de X-Forwarded-For : celle que le client écrit lui-même,
	# et que Cloudflare conserve. Un `X-Forwarded-For: <IP d'un opérateur SMS>` franchirait la
	# liste d'IP des webhooks (D-49). REMOTE_ADDR reste donc Traefik, et Laravel seul remonte la
	# chaîne, de droite à gauche, par TRUSTED_PROXIES (ADR-0028 §8). D5 le prouve par une
	# usurpation refusée.
}

:8080 {
	root * /app/public

	# nginx : gzip on; gzip_min_length 1024 (le JSON de l'API compris).
	encode zstd gzip {
		minimum_length 1024
	}

	# nginx : client_max_body_size 25M, soit 25 × 1024 × 1024 octets — d'où MiB, pas MB.
	request_body {
		max_size 25MiB
	}

	# nginx : location /storage/. PAS `immutable` : RegenerateAgencyWatermarksJob réécrit les
	# conversions à la MÊME URL, et un navigateur ne reverrait jamais la nouvelle.
	@storage path /storage/*
	header @storage Cache-Control "public, max-age=604800, stale-while-revalidate=86400"

	# nginx : location ~ /\.(?!well-known) { deny all; }. public/.htaccess existe et serait servi.
	@cache_hidden {
		path_regexp /\.
		not path /.well-known/*
	}
	respond @cache_hidden 404

	# ADR-0028 §10 : le code servi se prouve.
	header X-Build-Sha {$BUILD_SHA}
	header -Server

	php_server
}
```

- [ ] **Étape 7 : écrire `takussan-api/docker/php.ini`**

```ini
; Réglages de production de l'API Takussan (ADR-0028 §4). Chargé après php.ini-production.
expose_php = Off
memory_limit = 256M
; nginx acceptait 25 Mo : PHP ne doit pas refuser en dessous.
upload_max_filesize = 25M
post_max_size = 26M
; nginx : fastcgi_read_timeout 60.
max_execution_time = 60

; Le code d'une image ne change pas : aucune raison de revérifier les fichiers.
opcache.enable = 1
opcache.validate_timestamps = 0
opcache.memory_consumption = 128
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
realpath_cache_size = 4096K
realpath_cache_ttl = 600
```

- [ ] **Étape 8 : écrire `takussan-api/docker/entrypoint.sh`**

```sh
#!/bin/sh
# Point d'entrée d'api, worker, worker-media et scheduler (ADR-0028 §3).
#
# La configuration se met en cache AU DÉMARRAGE, jamais au build : elle vient de l'environnement
# du conteneur, que l'image ne connaît pas. Un `config:cache` au build figerait des valeurs vides
# dans une image qui sert deux environnements.
#
# `release` et `seed` ne passent PAS par ici (compose.api.yml leur donne leur entrypoint) : une
# configuration en cache ignorerait le `SCOUT_QUEUE=false` que leurs importations exigent.
set -eu
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
exec "$@"
```

- [ ] **Étape 9 : écrire `takussan-api/docker/lib.sh`**

```sh
# Fonctions partagées par release.sh et seed.sh. Sourcé, jamais exécuté.
# APP_ROOT vaut /app dans l'image ; scripts/test-release-reindex.sh le déplace pour rejouer la
# décision de réindexation hors conteneur, en CI.

# Les modèles indexés : tout app/Models/*.php qui définit toSearchableArray() — la règle de
# deploy.sh. Une liste écrite à la main oublierait le prochain modèle Searchable.
modeles_indexes() {
  grep -rl 'toSearchableArray' "${APP_ROOT:-/app}/app/Models" | sort | while read -r f; do
    printf 'App\\Models\\%s\n' "$(basename "$f" .php)"
  done
}
```

- [ ] **Étape 10 : écrire `takussan-api/docker/release.sh`**

```sh
#!/bin/sh
# Service `release` de compose.api.yml : joué UNE fois par déploiement, AVANT api, worker,
# worker-media et scheduler, qui attendent son succès (ADR-0028 §5). Reprend deploy.sh.
set -eu
APP_ROOT=${APP_ROOT:-/app}   # déplacé seulement par scripts/test-release-reindex.sh
. "$APP_ROOT/docker/lib.sh"

php artisan migrate --force

# deploy.sh tolérait cet échec, on le tolère aussi : les rôles système rattrapent le catalogue
# au déploiement suivant.
php artisan membership:reconcile-system-roles \
  || echo "AVERTISSEMENT : membership:reconcile-system-roles a échoué — les rôles système retardent sur le catalogue jusqu'au prochain déploiement." >&2

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  php artisan scout:sync-index-settings \
    || echo "AVERTISSEMENT : scout:sync-index-settings a échoué — filtres et tris de recherche périmés jusqu'au prochain déploiement." >&2

  # deploy.sh comparait fichier par fichier avec la release précédente, présente sur le disque.
  # Un conteneur n'en a pas : on compare l'empreinte de la « forme » des index, calculée au build,
  # à celle de la dernière importation RÉUSSIE, gardée dans le volume. Un écart réimporte TOUS
  # les modèles indexés (ADR-0028, « ce que ça coûte »).
  marqueur="$APP_ROOT/storage/app/private/.search-shape-importee"
  forme=$(cat "$APP_ROOT/.search-shape")
  if [ "$(cat "$marqueur" 2>/dev/null || true)" = "$forme" ]; then
    echo "Recherche : forme des index inchangée — pas d'importation."
  else
    reussi=1
    for modele in $(modeles_indexes); do
      echo "Importation de $modele (synchrone, avec le code de CETTE image)…"
      # SCOUT_QUEUE=false : sinon l'import ne ferait que POUSSER des jobs, exécutés ensuite par
      # l'ANCIEN worker, avec l'ancien toSearchableArray() (revue de la PR 253). La configuration
      # n'est pas en cache ici : la variable de processus l'emporte.
      SCOUT_QUEUE=false php artisan scout:import "$modele" \
        || { echo "AVERTISSEMENT : scout:import $modele a échoué." >&2; reussi=0; }
    done
    # Le marqueur ne s'écrit qu'après TOUTES les importations : un échec rejoue tout au
    # déploiement suivant, au lieu de se croire à jour.
    if [ "$reussi" = 1 ]; then echo "$forme" > "$marqueur"; fi
  fi
fi
```

- [ ] **Étape 11 : écrire `takussan-api/docker/seed.sh`**

```sh
#!/bin/sh
# Service `seed` (profil `seed`) de compose.api.yml : remet à zéro la base d'une PRÉPRODUCTION et
# la remplit. Tourne sur la cible `seed` du Dockerfile, qui porte Faker (TCK-353). Remplace
# scripts/seed-environnement.sh et scripts/seed-remote.sh.
set -eu
APP_ROOT=${APP_ROOT:-/app}
. "$APP_ROOT/docker/lib.sh"

case "${DB_DATABASE:-}" in
  *_preview|*_smoke) ;;
  *) echo "✗ refus : DB_DATABASE='${DB_DATABASE:-}' n'est ni une préproduction (*_preview) ni une base de fumée (*_smoke)." >&2
     exit 1 ;;
esac

php artisan migrate:fresh --force

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  for modele in $(modeles_indexes); do
    php artisan scout:flush "$modele" || echo "AVERTISSEMENT : scout:flush $modele a échoué." >&2
  done
fi

# SCOUT_DRIVER=null pendant le seed : sans lui, chaque ligne créée partirait vers Meilisearch une
# par une. On importe tout d'un bloc ensuite.
SCOUT_DRIVER=null php artisan db:seed --force ${SEEDER_CLASS:+--class="$SEEDER_CLASS"}

if [ "${SCOUT_DRIVER:-}" = "meilisearch" ]; then
  for modele in $(modeles_indexes); do
    SCOUT_QUEUE=false php artisan scout:import "$modele"
  done
  cp "$APP_ROOT/.search-shape" "$APP_ROOT/storage/app/private/.search-shape-importee"
fi
```

- [ ] **Étape 12 : construire, et faire passer le test**

```bash
docker build --build-arg BUILD_SHA=smoke --target runtime -t ghcr.io/thiambara/takussan-api:local takussan-api
docker build --build-arg BUILD_SHA=smoke --target seed -t ghcr.io/thiambara/takussan-api:local-seed takussan-api
deploy/takussan/smoke-api.sh image
```

Expected : huit lignes `✓`, de `extensions PHP` à `BUILD_SHA`.

- [ ] **Étape 13 : ablation de l'exclusion des `.env`, dans un arbre sans secret**

Le poste porte de vrais `.env` : l'ablation ne se fait **pas** dans l'arbre de travail.

```bash
git worktree add ../takussan-ablation HEAD
( cd ../takussan-ablation/takussan-api \
  && echo 'SONDE=1' > .env.sonde \
  && sed -i '' '/^\.env\*$/d' .dockerignore \
  && docker build -q --target runtime -t ghcr.io/thiambara/takussan-api:local . )
deploy/takussan/smoke-api.sh image; echo "code de sortie : $?"
git worktree remove --force ../takussan-ablation
docker build -q --build-arg BUILD_SHA=smoke --target runtime -t ghcr.io/thiambara/takussan-api:local takussan-api
deploy/takussan/smoke-api.sh image
```

Expected : le premier passage échoue sur `1 fichier(s) .env* dans l'image` (le `.env.sonde`), code de
sortie `1` ; après reconstruction depuis l'arbre de travail, tout repasse au vert. *Un test qui
serait vert sans le correctif ne prouve rien.*

- [ ] **Étape 14 : commit**

```bash
git add takussan-api/Dockerfile takussan-api/.dockerignore takussan-api/docker deploy/takussan/smoke-api.sh
git commit -m "build(api): image FrankenPHP de l'API, de ses workers et du seed (ADR-0028)"
```

### Tâche B2 : la pile d'API en Compose, éprouvée en local

**Files:**
- Create: `deploy/takussan/compose.api.yml`
- Create: `deploy/takussan/.env.smoke.example`
- Modify: `deploy/takussan/smoke-api.sh` (partie `pile`)
- Modify: `.gitignore` (racine)

**Interfaces:**
- Consumes : les images `…:local` et `…:local-seed` de B1.
- Produces : `deploy/takussan/compose.api.yml`, services `release`, `api` (port 8080, sonde
  `/up`), `worker`, `worker-media`, `scheduler`, `seed` (profil `seed`), volume `storage`, réseau
  externe `dokploy-network`. Variable d'interpolation obligatoire : `IMAGE_TAG`. B5 fait lire ce
  fichier à `check-queues.mjs` ; D1 le déclare dans Dokploy.

- [ ] **Étape 1 : écrire le test — `deploy/takussan/.env.smoke.example`**

```dotenv
# Environnement du test de fumée LOCAL (deploy/takussan/smoke-api.sh pile). Aucune valeur secrète :
# les services sont ceux de docker-compose.yml, joints depuis les conteneurs par host.docker.internal.
# smoke-api.sh copie ce fichier en deploy/takussan/.env (ignoré par git) et y ajoute APP_KEY.
IMAGE_TAG=local
APP_NAME=Takussan
APP_ENV=production
APP_DEBUG=false
APP_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000
APP_LOCALE=fr
APP_FALLBACK_LOCALE=en
LOG_CHANNEL=stderr
LOG_LEVEL=info
DB_CONNECTION=pgsql
DB_HOST=host.docker.internal
DB_PORT=5433
DB_DATABASE=takussan_smoke
DB_USERNAME=takussan
DB_PASSWORD=takussan
SESSION_DRIVER=database
CACHE_STORE=redis
QUEUE_CONNECTION=database
REDIS_CLIENT=phpredis
REDIS_HOST=host.docker.internal
REDIS_PORT=6380
REDIS_PASSWORD=null
REDIS_DB=14
REDIS_CACHE_DB=15
SCOUT_DRIVER=meilisearch
SCOUT_PREFIX=smoke_
SCOUT_QUEUE=false
MEILISEARCH_HOST=http://host.docker.internal:7701
MEILISEARCH_KEY=masterKey
MAIL_MAILER=log
TRUSTED_PROXIES=172.16.0.0/12
LARAVEL_PDF_DRIVER=dompdf
```

- [ ] **Étape 2 : écrire le test — la partie `pile` de `smoke-api.sh`**

Remplacer le bloc `case` final du script par :

```bash
PROJET=takussan-smoke
COMPOSE=(docker compose -p "$PROJET" -f deploy/takussan/compose.api.yml)
ENV_LOCAL=deploy/takussan/.env
MARQUE='# généré par smoke-api.sh — jetable'

sonde() { docker run --rm --network dokploy-network curlimages/curl -sS "$@"; }
tinker() { "${COMPOSE[@]}" exec -T api php artisan tinker --execute "$1"; }

preparer_pile() {
  if [ -f "$ENV_LOCAL" ] && ! head -1 "$ENV_LOCAL" | grep -qxF "$MARQUE"; then
    echec "$ENV_LOCAL existe et n'a pas été généré par ce script : refus de l'écraser"
  fi
  { echo "$MARQUE"; cat deploy/takussan/.env.smoke.example; echo "APP_KEY=base64:$(openssl rand -base64 32)"; } > "$ENV_LOCAL"
  docker network inspect dokploy-network >/dev/null 2>&1 || docker network create dokploy-network >/dev/null
  docker compose up -d --wait postgres meilisearch redis
  docker compose exec -T postgres psql -U takussan -d postgres -q \
    -c 'DROP DATABASE IF EXISTS takussan_smoke' \
    -c "CREATE DATABASE takussan_smoke ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0"
}

nettoyer_pile() {
  "${COMPOSE[@]}" --profile seed down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_LOCAL"
}

verifier_pile() {
  local api="http://$PROJET-api-1:8080" css n q
  trap nettoyer_pile EXIT
  preparer_pile

  "${COMPOSE[@]}" up -d --pull never --wait || { "${COMPOSE[@]}" logs release; echec "la pile ne démarre pas"; }
  ok "la pile démarre, release d'abord"

  "${COMPOSE[@]}" logs release | grep -q 'Importation de App\\Models\\Property' \
    || echec "le premier release n'a pas importé Property dans Meilisearch"
  "${COMPOSE[@]}" run --rm release | grep -q 'forme des index inchangée' \
    || echec "un second release réimporte alors que la forme des index n'a pas changé"
  ok "release idempotent (importe au premier passage, pas au second)"

  [ "$(sonde -o /dev/null -w '%{http_code}' "$api/up")" = 200 ] || echec "/up ne rend pas 200"
  sonde -D - -o /dev/null "$api/up" | tr -d '\r' | grep -qix 'x-build-sha: smoke' || echec "X-Build-Sha absent ou faux"
  ok "/up à 200, X-Build-Sha: smoke"

  # Une sonde par file que la production doit consommer — les files de check-queues.mjs.
  for q in default notifications-urgent media reconciliation; do
    tinker "dispatch(fn () => logger('sonde $q'))->onQueue('$q');" >/dev/null
  done
  for _ in $(seq 30); do
    n=$(tinker 'echo DB::table("jobs")->count();' | tr -dc '0-9')
    [ "$n" = 0 ] && break; sleep 2
  done
  [ "$n" = 0 ] || echec "$n job(s) jamais consommé(s) : $(tinker 'echo DB::table("jobs")->pluck("queue")->implode(",");')"
  [ "$(tinker 'echo DB::table("failed_jobs")->count();' | tr -dc '0-9')" = 0 ] || echec "des jobs sonde ont échoué"
  ok "les quatre files sont consommées"

  "${COMPOSE[@]}" exec -T api sh -c 'echo sonde > /app/storage/app/public/sonde.txt'
  sonde -D - -o /dev/null "$api/storage/sonde.txt" | tr -d '\r' \
    | grep -qix 'cache-control: public, max-age=604800, stale-while-revalidate=86400' \
    || echec "Cache-Control de /storage différent de celui de nginx"
  ok "Cache-Control de /storage"

  css=$("${COMPOSE[@]}" exec -T api php -r 'foreach (json_decode(file_get_contents("/app/public/build/manifest.json"), true) as $e) { foreach ($e["css"] ?? [] as $c) { echo $c; exit; } }')
  sonde -D - -o /dev/null -H 'Accept-Encoding: gzip' "$api/build/$css" | tr -d '\r' \
    | grep -qix 'content-encoding: gzip' || echec "le CSS n'est pas compressé"
  ok "compression gzip"

  for chemin in /.env /.htaccess /.git/config; do
    [ "$(sonde -o /dev/null -w '%{http_code}' "$api$chemin")" = 404 ] || echec "$chemin n'est pas refusé"
  done
  ok "fichiers cachés refusés (dont public/.htaccess, qui existe)"

  head -c $((24 * 1024 * 1024)) /dev/zero > /tmp/takussan-24mo
  head -c $((26 * 1024 * 1024)) /dev/zero > /tmp/takussan-26mo
  [ "$(docker run --rm --network dokploy-network -v /tmp:/t curlimages/curl -sS -o /dev/null -w '%{http_code}' --data-binary @/t/takussan-26mo "$api/up")" = 413 ] \
    || echec "un corps de 26 Mio n'est pas refusé en 413"
  [ "$(docker run --rm --network dokploy-network -v /tmp:/t curlimages/curl -sS -o /dev/null -w '%{http_code}' --data-binary @/t/takussan-24mo "$api/up")" != 413 ] \
    || echec "un corps de 24 Mio est refusé : la limite est plus basse que celle de nginx"
  rm -f /tmp/takussan-24mo /tmp/takussan-26mo
  ok "limite de corps à 25 Mio, comme nginx"

  sleep 30
  for s in api worker worker-media scheduler; do
    [ "$(docker inspect -f '{{.RestartCount}}' "$PROJET-$s-1")" = 0 ] || echec "$s redémarre en boucle"
  done
  ok "aucun service ne redémarre"

  "${COMPOSE[@]}" --profile seed run --rm -e SEEDER_CLASS="${SEEDER_CLASS:-}" seed >/dev/null || echec "le seed échoue"
  ok "le seed tourne sur la cible seed"

  docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep "$PROJET"
}

case "${1:-}" in
  image) verifier_image ;;
  pile) verifier_pile ;;
  *) echo "usage : $0 image|pile" >&2; exit 2 ;;
esac
```

Le seed complet dure ~260 s (CLAUDE.md, « Les commandes réelles ») ; `SEEDER_CLASS=<une classe
de database/seeders>` le raccourcit pendant la mise au point, mais **la validation de la tâche se
fait sans**.

- [ ] **Étape 3 : le lancer, et le voir échouer**

Run: `deploy/takussan/smoke-api.sh pile`
Expected : échec, `open …/deploy/takussan/compose.api.yml: no such file or directory`.

- [ ] **Étape 4 : écrire `deploy/takussan/compose.api.yml`**

```yaml
# Pile d'API Takussan d'UN environnement — préproduction ou production —, déployée par Dokploy
# (ADR-0028 §5). Le même fichier sert les deux : seuls l'onglet Environment de Dokploy (écrit en
# .env à côté de ce fichier) et IMAGE_TAG changent.
#
# ⚠ Les commandes `queue:work` s'écrivent en CHAÎNES, sur UNE ligne : scripts/check-queues.mjs
# les lit ligne à ligne. Une forme en tableau, ou repliée sur plusieurs lignes, la rendrait
# aveugle.
#
# Le domaine n'est pas ici : Dokploy pose les labels Traefik du service `api` (port 8080) depuis
# son onglet Domains. `container_name` est interdit : Dokploy nomme les conteneurs.

x-api: &api
  image: ghcr.io/thiambara/takussan-api:${IMAGE_TAG:?IMAGE_TAG manquant}
  pull_policy: always
  env_file: .env
  restart: unless-stopped
  volumes:
    - storage:/app/storage/app
  networks:
    - dokploy-network

x-apres-release: &apres-release
  depends_on:
    release:
      condition: service_completed_successfully

services:
  # Migrations, réconciliation des rôles, Meilisearch. Les autres services attendent son SUCCÈS :
  # une migration qui échoue laisse l'ancienne version servir, au lieu du nouveau code sur
  # l'ancien schéma.
  # ⚠ FAUX pour un simple `up -d --build`, mesuré le 2026-09-14 (TCK-522) : Compose recrée `api`
  # avant de lancer release. Le fichier réel et hebergement.md portent la commande en deux temps.
  release:
    <<: *api
    restart: "no"
    entrypoint: ["/app/docker/release.sh"]
    mem_limit: 512m

  api:
    <<: [*api, *apres-release]
    mem_limit: 384m
    healthcheck:
      test: ["CMD", "php", "-r", "exit(@file_get_contents('http://127.0.0.1:8080/up') === false ? 1 : 0);"]
      interval: 15s
      timeout: 5s
      start_period: 30s
      retries: 3

  # Deux workers, les files de scripts/server-setup.sh : notifications-urgent passe devant
  # default, et le média lourd ne retarde pas une notification.
  worker:
    <<: [*api, *apres-release]
    command: php artisan queue:work --queue=notifications-urgent,default --sleep=3 --tries=3 --max-time=3600
    stop_grace_period: 60s
    mem_limit: 256m

  worker-media:
    <<: [*api, *apres-release]
    command: php artisan queue:work --queue=media,reconciliation --sleep=3 --tries=3 --max-time=3600
    stop_grace_period: 120s
    mem_limit: 384m

  scheduler:
    <<: [*api, *apres-release]
    command: php artisan schedule:work
    mem_limit: 192m

  # Jamais démarré par `up` : `docker compose --profile seed run --rm seed`.
  seed:
    <<: *api
    image: ghcr.io/thiambara/takussan-api:${IMAGE_TAG:?IMAGE_TAG manquant}-seed
    profiles: ["seed"]
    restart: "no"
    entrypoint: ["/app/docker/seed.sh"]
    mem_limit: 768m

volumes:
  storage:

networks:
  dokploy-network:
    external: true
```

- [ ] **Étape 5 : ignorer le `.env` jetable**

Ajouter à la fin du `.gitignore` racine :

```gitignore
# Environnements des piles Compose (ADR-0028) : générés en local par les tests de fumée, portés
# par Dokploy sur le serveur. Jamais versionnés — seuls les *.example le sont.
deploy/**/.env
```

Run: `touch deploy/takussan/.env && git status --porcelain deploy/ ; rm deploy/takussan/.env`
Expected : aucune ligne `deploy/takussan/.env`.

- [ ] **Étape 6 : faire passer le test**

Run: `deploy/takussan/smoke-api.sh pile`
Expected : dix lignes `✓`, de `la pile démarre` à `le seed tourne`, puis la mémoire de chaque
conteneur. **Recopier ces chiffres dans le ticket** : ce sont les premiers « attendu » mesurés du
budget.

- [ ] **Étape 7 : ablations**

Une par propriété que le test prétend garder. Chacune se fait, se constate, s'annule
(`git checkout -- <fichier>`), et l'image se reconstruit quand c'est elle qui a changé.

| On casse | Dans | Le test doit échouer sur |
|---|---|---|
| retirer `media,` du `--queue=` de `worker-media` | `compose.api.yml` | `1 job(s) jamais consommé(s) : media` |
| retirer le bloc `@cache_hidden` et son `respond` | `Caddyfile` (image) | `/.htaccess n'est pas refusé` |
| remplacer `25MiB` par `20MiB` | `Caddyfile` (image) | `un corps de 24 Mio est refusé` |
| retirer `entrypoint:` du service `release` | `compose.api.yml` | `un second release réimporte…` ou l'import du premier passage absent — la configuration en cache ignore `SCOUT_QUEUE=false` |
| retirer l'écriture du marqueur (`echo "$forme" > …`) | `release.sh` (image) | `un second release réimporte…` |

⚠ La troisième ligne ne remplace pas `25MiB` par `25MB`, et c'est délibéré. `25MB` (25 × 10⁶) et
`25MiB` (25 × 2²⁰) ne diffèrent que de 1,2 Mo, et **aucune** des deux sondes (24 et 26 Mio) ne
tombe entre eux : l'ablation passerait au vert sans rien prouver. `20MiB` déplace la limite sous la
sonde de 24 Mio. *Une ablation qui ne tombe pas dans l'écart qu'elle vise ne prouve rien.*

- [ ] **Étape 8 : commit**

```bash
git add deploy/takussan/compose.api.yml deploy/takussan/.env.smoke.example deploy/takussan/smoke-api.sh .gitignore
git commit -m "build(api): pile Compose de l'API et son test de fumée local (ADR-0028)"
```

### Tâche B3 : l'image du front

**Files:**
- Create: `takussan-web/Dockerfile`
- Create: `takussan-web/.dockerignore`
- Create: `deploy/takussan/smoke-web.sh`
- Modify: `takussan-web/next.config.ts`

**Interfaces:**
- Produces : image `ghcr.io/thiambara/takussan-web:<environnement>` (et `…:<environnement>-sha-<commit>`),
  utilisateur `node`, port `3000`, sonde de santé intégrée sur `/robots.txt`. Arguments de build
  **obligatoires** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` ; facultatif `BUILD_SHA`. En-tête
  `X-Build-Sha` sur toutes les réponses. B4 passe ces arguments ; B5 fait vérifier par
  `check-front-env-keys.mjs` que chaque `NEXT_PUBLIC_*` lue est un `ARG` de ce Dockerfile.

- [ ] **Étape 1 : écrire le test — `deploy/takussan/smoke-web.sh`**

```bash
#!/usr/bin/env bash
# Test de fumée de l'image du front Takussan, EN LOCAL (ADR-0028, plan B3).
#
# Prérequis : l'API de développement sur 127.0.0.1:8002 (`./dev.sh api`). Les pages publiques la
# consultent au rendu ; le conteneur la joint par host.docker.internal.
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE=ghcr.io/thiambara/takussan-web:local
NOM=takussan-web-smoke
PORT=3999
API=http://host.docker.internal:8002
SITE=https://preview.takussan.com

echec() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }
entetes() { curl -sS -o /dev/null -D - "$@" | tr -d '\r'; }

curl -fsS -o /dev/null http://127.0.0.1:8002/up || echec "l'API de développement ne répond pas : lancer ./dev.sh api"

# 1. Le refus (ADR-0028 §3) : sans NEXT_PUBLIC_SITE_URL, l'image ne se construit pas.
if docker build -q --build-arg NEXT_PUBLIC_API_URL="$API" -t "$IMAGE-refus" takussan-web >/dev/null 2>&1; then
  docker image rm -f "$IMAGE-refus" >/dev/null
  echec "l'image se construit SANS NEXT_PUBLIC_SITE_URL : elle déclarerait ses pages canoniques en production"
fi
ok "build refusé sans NEXT_PUBLIC_SITE_URL"

# 2. L'image, construite comme images.yml la construit.
docker build -q --build-arg NEXT_PUBLIC_API_URL="$API" --build-arg NEXT_PUBLIC_SITE_URL="$SITE" \
  --build-arg BUILD_SHA=smoke -t "$IMAGE" takussan-web >/dev/null
docker rm -f "$NOM" >/dev/null 2>&1 || true
trap 'docker rm -f "$NOM" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NOM" -p "$PORT:3000" "$IMAGE" >/dev/null
for _ in $(seq 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] && break; sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] || { docker logs "$NOM"; echec "le conteneur n'est pas sain"; }
ok "conteneur sain"

[ "$(docker exec "$NOM" id -un)" = node ] || echec "l'image ne tourne pas sous node"
[ "$(docker exec "$NOM" sh -c 'ls -A /app | grep -c "^\.env" || true')" = 0 ] || echec "un .env est entré dans l'image"
ok "utilisateur node, aucun .env"

entetes "http://127.0.0.1:$PORT/robots.txt" | grep -qix 'x-build-sha: smoke' || echec "X-Build-Sha absent ou faux"
curl -fsS "http://127.0.0.1:$PORT/robots.txt" | grep -qxF "Sitemap: $SITE/sitemap.xml" \
  || echec "robots.txt ne déclare pas l'origine $SITE : NEXT_PUBLIC_SITE_URL n'a pas été inlinée"
ok "X-Build-Sha et origine du site"

for langue in fr en wo; do
  [ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/$langue")" = 200 ] || echec "/$langue ne rend pas 200"
done
ok "/fr, /en, /wo à 200"

entetes -H 'Accept: image/avif' "http://127.0.0.1:$PORT/_next/image?url=https%3A%2F%2Fplacehold.co%2F600x400.png&w=640&q=75" \
  | grep -qix 'content-type: image/avif' || echec "l'optimiseur ne sert pas d'AVIF : sharp manque à l'image standalone"
ok "optimiseur d'images en AVIF"

docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' "$NOM"
```

- [ ] **Étape 2 : le lancer, et le voir échouer**

Run: `chmod +x deploy/takussan/smoke-web.sh && ./dev.sh api & sleep 20; deploy/takussan/smoke-web.sh`
Expected : échec dès la première vérification — sans Dockerfile, `docker build` échoue quel que soit
l'argument, et le script le lit comme un refus : `✓ build refusé`, **puis** échec au build réel
(`failed to read dockerfile`). C'est la raison de l'étape 7 : le premier `✓` ne prouve encore rien.

- [ ] **Étape 3 : écrire `takussan-web/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
#
# Image du front Takussan (ADR-0028 §3). UNE image PAR ENVIRONNEMENT : NEXT_PUBLIC_* est inliné à
# la compilation (docs/infra/frontend-deploiement.md), la même image ne peut pas servir deux
# origines.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG BUILD_SHA=inconnu
# Le refus d'ADR-0028 §3. `resoudreOrigineSite()` (src/lib/alternates.ts) reconnaît une
# prévisualisation à VERCEL_ENV, qui n'existe pas ici : sans NEXT_PUBLIC_SITE_URL, une
# préproduction retomberait EN SILENCE sur l'origine de production et y déclarerait ses pages
# canoniques. On refuse avant le premier octet compilé.
RUN test -n "$NEXT_PUBLIC_API_URL" || { echo "✗ NEXT_PUBLIC_API_URL manquant (ADR-0028 §3)" >&2; exit 1; }
RUN test -n "$NEXT_PUBLIC_SITE_URL" || { echo "✗ NEXT_PUBLIC_SITE_URL manquant (ADR-0028 §3)" >&2; exit 1; }
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    BUILD_SHA=${BUILD_SHA} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
# Une Application Dokploy est un service Swarm : il ne bascule le trafic que sur un conteneur sain.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
```

- [ ] **Étape 4 : écrire `takussan-web/.dockerignore`**

```gitignore
# ⚠ `.env*` EN TÊTE : takussan-web/.env.local existe sur le poste. `next build` le LIRAIT, et ses
# valeurs entreraient dans le bundle d'une image poussée sur un registre.
.env*
.next
node_modules
.git
.stitch
.DS_Store
coverage
*.tsbuildinfo
Dockerfile
.dockerignore
```

- [ ] **Étape 5 : `takussan-web/next.config.ts` — sortie autonome et en-tête de commit**

Ajouter, en tête de l'objet `nextConfig` (avant `reactCompiler`) :

```ts
  // ── `output: 'standalone'` — ADR-0028 §3 ─────────────────────────────────────────────────────
  //
  // `next build` produit `.next/standalone/server.js` et n'y copie que les modules que le serveur
  // importe réellement. L'image (takussan-web/Dockerfile) ne porte ni `node_modules` entier ni les
  // dépendances de dev. Sans effet sur `next dev`.
  output: 'standalone',
```

Ajouter, en fin d'objet `nextConfig` (après `images`) :

```ts
  // ── `X-Build-Sha` — ADR-0028 §10 : le code servi se prouve ───────────────────────────────────
  //
  // `BUILD_SHA` est un argument de build (takussan-web/Dockerfile) : la valeur est figée au build,
  // ce qui est exactement ce qu'on veut prouver. `.github/workflows/images.yml` n'est vert que
  // lorsque l'URL publique rend le commit poussé. Hors image — `next dev`, tests —, « inconnu ».
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Build-Sha', value: process.env.BUILD_SHA ?? 'inconnu' }],
      },
    ];
  },
```

Dans le commentaire du bloc `images`, remplacer le paragraphe qui commence par
« L'optimiseur émet `max-age = max(minimumCacheTTL, max-age de l'amont)` » par :

```ts
    // L'optimiseur émet `max-age = max(minimumCacheTTL, max-age de l'amont)` — et
    // l'amont, c'est l'API : le matcher `@storage` de `takussan-api/docker/Caddyfile`
    // (qui reprend le `location /storage/` de l'ancien vhost nginx), et qui domine le
    // défaut de 4 h de `minimumCacheTTL`. Les deux valeurs bougent ensemble ou pas du
    // tout ; le raisonnement (et ce qui interdit `immutable`) vit dans ce Caddyfile.
```

- [ ] **Étape 6 : les vérifications du front, et le test**

```bash
cd takussan-web && npm run lint && npx tsc --noEmit && npm run test && cd ..
deploy/takussan/smoke-web.sh
```

Expected : lint, types et Vitest verts ; puis six lignes `✓`, de `build refusé` à `AVIF`.

- [ ] **Étape 7 : ablation du refus**

Le premier `✓` de l'étape 2 est tombé pour une mauvaise raison (Dockerfile absent). On le prouve
maintenant pour la bonne :

```bash
sed -i '' '/NEXT_PUBLIC_SITE_URL manquant/d' takussan-web/Dockerfile
deploy/takussan/smoke-web.sh; echo "code de sortie : $?"
docker build -q --build-arg NEXT_PUBLIC_API_URL=http://host.docker.internal:8002 -t sans-origine takussan-web
docker run --rm -d --name sans-origine -p 3998:3000 sans-origine && sleep 8
curl -s http://127.0.0.1:3998/robots.txt | grep Sitemap
docker rm -f sans-origine; docker image rm sans-origine
git checkout -- takussan-web/Dockerfile
```

Expected : le test échoue sur `l'image se construit SANS NEXT_PUBLIC_SITE_URL` (code `1`), et
l'image construite sans la garde déclare `Sitemap: https://www.takussan.com/sitemap.xml` —
l'origine de **production**, sur une image de préproduction. C'est le défaut que la ligne existe
pour empêcher, observé.

- [ ] **Étape 8 : commit**

```bash
git add takussan-web/Dockerfile takussan-web/.dockerignore takussan-web/next.config.ts deploy/takussan/smoke-web.sh
git commit -m "build(web): image autonome du front par environnement, en-tête X-Build-Sha (ADR-0028)"
```

### Tâche B4 : le workflow qui construit, déploie et prouve

**Files:**
- Create: `.github/workflows/images.yml`
- Delete: `.github/workflows/deploy.yml`, `.github/workflows/deploy-preview.yml`

**Interfaces:**
- Consumes : les Dockerfile de B1 et B3.
- Produces, sur GHCR :
  - `takussan-api:sha-<commit>`, `takussan-api:<environnement>` ;
  - `takussan-api:sha-<commit>-seed`, `takussan-api:<environnement>-seed` ;
  - `takussan-web:<environnement>-sha-<commit>`, `takussan-web:<environnement>`.
- Lit, dans l'environnement GitHub du même nom : `vars.DOKPLOY_URL`, `vars.DOKPLOY_API_COMPOSE_ID`,
  `vars.DOKPLOY_WEB_APPLICATION_ID`, `secrets.DOKPLOY_API_KEY`, `secrets.PREVIEW_BASIC_AUTH`
  (`utilisateur:motdepasse`). **Si l'un des quatre premiers manque, il pousse les images et ne
  déploie rien** : c'est l'état voulu jusqu'à D3.
- Seule branche servie en B4 : `preview`. `master` s'ajoute en F2.

- [ ] **Étape 1 : relever les majeures des actions Docker**

```bash
for a in setup-buildx-action login-action build-push-action; do
  echo "docker/$a $(gh api "repos/docker/$a/releases/latest" -q .tag_name)"
done
```

Écrire dans le workflow la **majeure** relevée (`@v3` si la sortie est `v3.x.y`). Le dépôt épingle
déjà `actions/checkout@v7` : même règle.

- [ ] **Étape 2 : écrire `.github/workflows/images.yml`**

Les majeures `@v4`/`@v4`/`@v7` ci-dessous sont celles relevées le 2026-09-13 par l’étape 1 (`v4.3.0`, `v4.6.0`, `v7.3.0`).

```yaml
# Construit les images, les pousse sur GHCR, déclenche Dokploy, puis PROUVE ce qui est servi
# (ADR-0028 §2, §3, §10). Le serveur ne construit rien : il tire ce que ce workflow pousse.
#
# Une image d'API par commit (elle sert tous les environnements) ; une image de front par
# environnement (NEXT_PUBLIC_* est inliné à la compilation).
#
# Le déploiement n'est vert que lorsque l'URL PUBLIQUE rend le commit poussé dans `X-Build-Sha`.
# Un appel à Dokploy qui répond 200 ne dit rien de ce qui tourne — c'est D-04 et ADR-0017.
name: Images et déploiement

on:
  push:
    branches: [preview]
  workflow_dispatch:

concurrency:
  group: images-${{ github.ref_name }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

jobs:
  cible:
    name: Environnement visé
    runs-on: ubuntu-latest
    outputs:
      environnement: ${{ steps.c.outputs.environnement }}
      api_url: ${{ steps.c.outputs.api_url }}
      site_url: ${{ steps.c.outputs.site_url }}
    steps:
      - id: c
        run: |
          case "$GITHUB_REF_NAME" in
            preview)
              { echo "environnement=preview"
                echo "api_url=https://preview.api.takussan.com"
                echo "site_url=https://preview.takussan.com"; } >> "$GITHUB_OUTPUT" ;;
            *)
              echo "::error::aucun environnement pour la branche $GITHUB_REF_NAME"; exit 1 ;;
          esac

  api:
    name: Image de l'API
    needs: cible
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: takussan-api
          target: runtime
          push: true
          build-args: |
            BUILD_SHA=${{ github.sha }}
          tags: |
            ghcr.io/thiambara/takussan-api:sha-${{ github.sha }}
            ghcr.io/thiambara/takussan-api:${{ needs.cible.outputs.environnement }}
          cache-from: type=gha,scope=api
          cache-to: type=gha,mode=max,scope=api
      - uses: docker/build-push-action@v7
        with:
          context: takussan-api
          target: seed
          push: true
          build-args: |
            BUILD_SHA=${{ github.sha }}
          tags: |
            ghcr.io/thiambara/takussan-api:sha-${{ github.sha }}-seed
            ghcr.io/thiambara/takussan-api:${{ needs.cible.outputs.environnement }}-seed
          cache-from: type=gha,scope=api

  web:
    name: Image du front
    needs: cible
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: takussan-web
          push: true
          # Chaque NEXT_PUBLIC_* lue par le front doit figurer ici ET en ARG du Dockerfile :
          # scripts/check-front-env-keys.mjs le vérifie.
          build-args: |
            NEXT_PUBLIC_API_URL=${{ needs.cible.outputs.api_url }}
            NEXT_PUBLIC_SITE_URL=${{ needs.cible.outputs.site_url }}
            BUILD_SHA=${{ github.sha }}
          tags: |
            ghcr.io/thiambara/takussan-web:${{ needs.cible.outputs.environnement }}-sha-${{ github.sha }}
            ghcr.io/thiambara/takussan-web:${{ needs.cible.outputs.environnement }}
          cache-from: type=gha,scope=web-${{ needs.cible.outputs.environnement }}
          cache-to: type=gha,mode=max,scope=web-${{ needs.cible.outputs.environnement }}

  deploy:
    name: Déploiement et preuve
    needs: [cible, api, web]
    runs-on: ubuntu-latest
    environment: ${{ needs.cible.outputs.environnement }}
    steps:
      - name: Déclencher Dokploy
        id: declencher
        env:
          DOKPLOY_URL: ${{ vars.DOKPLOY_URL }}
          COMPOSE_ID: ${{ vars.DOKPLOY_API_COMPOSE_ID }}
          WEB_ID: ${{ vars.DOKPLOY_WEB_APPLICATION_ID }}
          DOKPLOY_API_KEY: ${{ secrets.DOKPLOY_API_KEY }}
        run: |
          if [ -z "$DOKPLOY_URL" ] || [ -z "$COMPOSE_ID" ] || [ -z "$WEB_ID" ] || [ -z "$DOKPLOY_API_KEY" ]; then
            echo "::notice::Dokploy n'est pas raccordé à « ${{ needs.cible.outputs.environnement }} » : images poussées, rien déployé."
            echo "raccorde=non" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          appeler() {
            curl -fsS -X POST "$DOKPLOY_URL/api/$1" -H "x-api-key: $DOKPLOY_API_KEY" \
              -H 'Content-Type: application/json' -d "$2" >/dev/null
          }
          appeler compose.deploy "{\"composeId\":\"$COMPOSE_ID\"}"
          appeler application.deploy "{\"applicationId\":\"$WEB_ID\"}"
          echo "raccorde=oui" >> "$GITHUB_OUTPUT"

      - name: Prouver ce qui est servi
        if: steps.declencher.outputs.raccorde == 'oui'
        env:
          API_URL: ${{ needs.cible.outputs.api_url }}
          SITE_URL: ${{ needs.cible.outputs.site_url }}
          BASIC_AUTH: ${{ secrets.PREVIEW_BASIC_AUTH }}
        run: |
          attendre() {
            local url=$1 sha=""
            shift
            for _ in $(seq "${ESSAIS:-60}"); do
              sha=$(curl -sS -o /dev/null -D - "$@" "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-build-sha"{print $2}')
              if [ "$sha" = "$GITHUB_SHA" ]; then echo "✓ $url sert $GITHUB_SHA"; return 0; fi
              sleep 10
            done
            echo "::error::$url sert « ${sha:-rien} » au lieu de $GITHUB_SHA"
            return 1
          }
          attendre "$API_URL/up"
          if [ -n "$BASIC_AUTH" ]; then
            attendre "$SITE_URL/robots.txt" -u "$BASIC_AUTH"
          else
            attendre "$SITE_URL/robots.txt"
          fi
```

- [ ] **Étape 3 : valider le YAML, et jouer la preuve en local**

```bash
actionlint .github/workflows/images.yml      # brew install actionlint
yq '.jobs.deploy.steps[1].run' .github/workflows/images.yml > /tmp/preuve.sh   # brew install yq
docker run -d --rm --name preuve -p 3999:3000 ghcr.io/thiambara/takussan-web:local && sleep 8
GITHUB_SHA=smoke ESSAIS=2 API_URL=http://127.0.0.1:3999 SITE_URL=http://127.0.0.1:3999 BASIC_AUTH= bash /tmp/preuve.sh; echo "code : $?"
GITHUB_SHA=autre ESSAIS=2 API_URL=http://127.0.0.1:3999 SITE_URL=http://127.0.0.1:3999 BASIC_AUTH= bash /tmp/preuve.sh; echo "code : $?"
docker rm -f preuve
```

`API_URL` vise le front : `/up` y rend 404, mais l'en-tête `X-Build-Sha` est posé sur toutes les
réponses — c'est l'en-tête qu'on éprouve, pas la route.

Expected : aucune sortie d'`actionlint` ; le premier passage rend deux `✓` et le code `0` ; le second
`::error::… sert « smoke » au lieu de autre`, code `1`. Le script éprouvé est celui **extrait du YAML
livré**, pas une copie : c'est la leçon d'ADR-0017, conséquence 5. Le premier déclenchement par
GitHub, lui, s'observe en D3.

- [ ] **Étape 4 : retirer les workflows de la chaîne bash**

```bash
git rm .github/workflows/deploy.yml .github/workflows/deploy-preview.yml
for g in scripts/check-*.mjs; do node "$g" >/dev/null || echo "✗ $g"; done
```

Expected : aucune ligne `✗`. Une garde qui cite ces deux fichiers rougit ici, pas plus tard. (Les
secrets `CONTABO_*` et `ENV_FILE*` du dépôt ne se suppriment qu'en D8, une fois la nouvelle chaîne
prouvée.)

- [ ] **Étape 5 : commit**

```bash
git add .github/workflows/images.yml
git commit -m "ci: images sur GHCR, déploiement Dokploy prouvé par X-Build-Sha ; retrait de deploy.yml (ADR-0028)"
```

### Tâche B5 : porter les gardes, retirer la chaîne bash

**Files:**
- Create: `scripts/test-release-reindex.sh`
- Modify: `scripts/check-queues.mjs`
- Modify: `scripts/check-front-env-keys.mjs`
- Modify: `scripts/check-heredocs.mjs`
- Modify: `.github/workflows/repo-ci.yml`
- Delete: `scripts/deploy.sh`, `scripts/server-setup.sh`, `scripts/seed-environnement.sh`,
  `scripts/seed-remote.sh`, `scripts/deploy-preview-vps.sh`, `scripts/deploy-prod-vps.sh`,
  `scripts/test-deploy-search-reindex.sh`

**Interfaces:**
- Consumes : `deploy/takussan/compose.api.yml` (B2), `takussan-web/Dockerfile` (B3),
  `.github/workflows/images.yml` (B4), `takussan-api/docker/release.sh` et `lib.sh` (B1, avec
  `APP_ROOT`).
- Produces : les mêmes garanties qu'avant, sur les fichiers qui déploient désormais. Aucune garde
  ne cite plus un fichier supprimé.

- [ ] **Étape 1 : le successeur du test de réindexation — `scripts/test-release-reindex.sh`**

`repo-ci.yml` exécute `scripts/test-deploy-search-reindex.sh`, le seul vrai test de la décision de
réindexation de `deploy.sh`. Supprimer `deploy.sh` sans le remplacer retirerait cette couverture en
silence.

```bash
#!/usr/bin/env bash
#
# test-release-reindex.sh — exerce la décision de réindexation de takussan-api/docker/release.sh.
#
# Successeur de test-deploy-search-reindex.sh, retiré avec deploy.sh (ADR-0028). Même raison
# d'être : ni PHPUnit ni vitest ne lisent du shell, et se tromper ici est muet des deux côtés —
# trop réindexer noie Meilisearch à chaque déploiement (3308 tâches pour une exécution, D-44), trop
# peu laisse la recherche répondre sur un index périmé, application en parfaite santé.
#
# Il joue le VRAI release.sh, jamais une copie, dans un APP_ROOT jetable, avec un `php` talon qui
# journalise les appels artisan. Aucun conteneur, aucune base, aucun Meilisearch : le harnais teste
# la DÉCISION, pas l'indexation. `sh` et non `bash` : l'image exécute release.sh sous dash.
#
# Le dernier scénario est une ABLATION : il attend un résultat faux. S'il passe, le harnais ne
# teste rien et le script sort en rouge.
set -uo pipefail
cd "$(dirname "$0")/.."

RELEASE=takussan-api/docker/release.sh
LIB=takussan-api/docker/lib.sh
[ -f "$RELEASE" ] && [ -f "$LIB" ] || { echo "✗ $RELEASE ou $LIB introuvable" >&2; exit 2; }

echecs=0
racine=$(mktemp -d)
trap 'rm -rf "$racine"' EXIT
MARQUEUR="$racine/app/storage/app/private/.search-shape-importee"

# Un APP_ROOT minimal : deux modèles indexés, un qui ne l'est pas, l'empreinte, le volume.
fabrique() {
  rm -rf "$racine/app" "$racine/bin"
  mkdir -p "$racine/app/app/Models" "$racine/app/docker" "$racine/app/storage/app/private" "$racine/bin"
  cp "$LIB" "$racine/app/docker/lib.sh"
  echo 'public function toSearchableArray() {}' > "$racine/app/app/Models/Property.php"
  echo 'public function toSearchableArray() {}' > "$racine/app/app/Models/Agency.php"
  echo 'class Invoice {}' > "$racine/app/app/Models/Invoice.php"
  echo forme-1 > "$racine/app/.search-shape"
  cat > "$racine/bin/php" <<'EOF'
#!/bin/sh
echo "$*" >> "$JOURNAL"
case "$*" in *"${ECHEC_SUR:-@@jamais@@}"*) exit 1 ;; esac
exit 0
EOF
  chmod +x "$racine/bin/php"
}

# jouer [VAR=valeur…] — un passage de $script ; le journal des appels dans $racine/journal.
script=$RELEASE
jouer() {
  : > "$racine/journal"
  env SCOUT_DRIVER=meilisearch "$@" APP_ROOT="$racine/app" JOURNAL="$racine/journal" \
    PATH="$racine/bin:$PATH" sh "$script" >/dev/null 2>&1
}
imports() { grep -c '^artisan scout:import' "$racine/journal" || true; }
marqueur() { cat "$MARQUEUR" 2>/dev/null || echo absent; }
verifier() {
  if [ "$2" = "$3" ]; then echo "✓ $1"
  else echo "✗ $1 — attendu « $2 », obtenu « $3 »"; echecs=$((echecs + 1)); fi
}

fabrique; jouer
verifier "premier déploiement : importe les deux modèles indexés, et eux seuls" 2 "$(imports)"
verifier "premier déploiement : écrit le marqueur" forme-1 "$(marqueur)"

jouer
verifier "forme inchangée : aucune importation" 0 "$(imports)"

echo forme-2 > "$racine/app/.search-shape"; jouer
verifier "forme changée : réimporte tout" 2 "$(imports)"
verifier "forme changée : marqueur à jour" forme-2 "$(marqueur)"

echo forme-3 > "$racine/app/.search-shape"; jouer ECHEC_SUR=Agency
verifier "une importation échoue : le marqueur ne bouge pas" forme-2 "$(marqueur)"
jouer
verifier "après un échec : le déploiement suivant réimporte" 2 "$(imports)"

fabrique; jouer SCOUT_DRIVER=collection
verifier "SCOUT_DRIVER=collection : aucun appel scout" 0 "$(grep -c scout "$racine/journal" || true)"

fabrique; jouer ECHEC_SUR=migrate
verifier "migration en échec : release échoue, les services ne démarrent pas" 1 "$?"

fabrique; jouer ECHEC_SUR=membership:reconcile
verifier "réconciliation en échec : release continue (comme deploy.sh)" 0 "$?"

# ── ABLATION : sans l'écriture du marqueur, le second passage DOIT réimporter ──
sed '/> "\$marqueur"/d' "$RELEASE" > "$racine/release-ablation.sh"
script="$racine/release-ablation.sh"
fabrique; jouer; jouer
if [ "$(imports)" = 0 ]; then
  echo "✗ ablation : sans l'écriture du marqueur, le second passage n'importe toujours rien — le harnais ne teste rien"
  echecs=$((echecs + 1))
else
  echo "✓ ablation : sans le marqueur, le second passage réimporte — le harnais voit la différence"
fi

[ "$echecs" = 0 ] || { echo "✗ $echecs échec(s)"; exit 1; }
echo "✓ décision de réindexation de release.sh : 10 vérifications et une ablation"
```

- [ ] **Étape 2 : le lancer**

Run: `chmod +x scripts/test-release-reindex.sh && scripts/test-release-reindex.sh && shellcheck scripts/test-release-reindex.sh`
Expected : onze `✓` (dix vérifications, puis l'ablation), puis la ligne de synthèse ; aucune
remarque de shellcheck. Si un scénario
échoue, **c'est `release.sh` (B1) qu'on corrige**, pas l'attendu.

- [ ] **Étape 3 : `check-queues.mjs` lit le Compose**

Dans le docblock d'en-tête, remplacer
« les `onQueue('…')` du code, et la liste `--queue=` de `scripts/server-setup.sh`. » par :

```js
 * les `onQueue('…')` du code, et les `--queue=` de ceux qui les consomment :
 * `deploy/takussan/compose.api.yml` (préproduction ET production, ADR-0028) et `dev.sh`.
```

Remplacer tout le tableau `CONSOMMATEURS` (et les commentaires qui le précèdent, depuis
`/**\n * TOUS les consommateurs`) par :

```js
/**
 * TOUS les consommateurs, pas seulement celui du serveur.
 *
 * Une première version ne lisait que la production. Le `--queue` y a été corrigé… et `dev.sh` a
 * continué de lancer `queue:work` sans lui, réintroduisant en local le défaut exact que la garde
 * venait de fermer — au vert, puisqu'elle ne regardait pas là. *Une garde qui ne couvre qu'un
 * côté déplace le défaut au lieu de le supprimer.*
 *
 * Depuis ADR-0028, le serveur n'a plus qu'UNE source : le fichier Compose EST le déploiement, et
 * le même fichier sert la préproduction et la production. Les trois copies qu'on gardait ici —
 * l'unité systemd de production, celle de préproduction, et `FILES_ATTENDUES` de `deploy.sh` —
 * n'existent plus. *Le fichier gardé est celui qu'on exécute.*
 */
const CONSOMMATEURS = [
  { fichier: join(ROOT, 'deploy', 'takussan', 'compose.api.yml'), ou: 'serveur — préproduction et production (Compose Dokploy)' },
  { fichier: join(ROOT, 'dev.sh'), ou: 'développement local' },
];
```

Dans la boucle `for (const { fichier, ou, cible, liste } of CONSOMMATEURS)` :
- la déstructuration devient `for (const { fichier, ou } of CONSOMMATEURS)` ;
- supprimer le bloc `if (liste) { … continue; }` et son commentaire (« Un consommateur peut
  déclarer ses files par une LISTE nommée ») ;
- supprimer le bloc `if (!m) { const varMatch = … }` et son commentaire (« `--queue=${var}` : on
  RÉSOUT la variable »), et le remplacer par ce commentaire seul :

```js
    // Une valeur littérale, toujours. `--queue=${VAR}` est refusé plus bas comme un worker sans
    // `--queue=` : Compose interpole la variable depuis un .env que le dépôt ne contient pas, et
    // une garde qui ne peut pas lire la valeur ne doit pas rendre « couvert ».
```

Run: `node scripts/check-queues.mjs --report`
Expected : vert, deux consommateurs listés, quatre files exigées (`default`, `media`,
`notifications-urgent`, `reconciliation`), chacune servie par les deux.

- [ ] **Étape 4 : ablations de `check-queues`**

```bash
sed -i '' 's/--queue=media,reconciliation/--queue=reconciliation/' deploy/takussan/compose.api.yml
node scripts/check-queues.mjs; echo "code : $?"; git checkout -- deploy/takussan/compose.api.yml
sed -i '' 's#command: php artisan queue:work --queue=media,reconciliation.*#command: ["php", "artisan", "queue:work", "--queue=media,reconciliation"]#' deploy/takussan/compose.api.yml
node scripts/check-queues.mjs; echo "code : $?"; git checkout -- deploy/takussan/compose.api.yml
```

Expected : le premier passage échoue en nommant `media` et `serveur — préproduction et
production` (code `1`) ; le second échoue aussi (code `1`) — la forme en tableau ne contient plus
`artisan queue:work` sur une ligne, et la garde doit le **dire**, jamais conclure sur les workers
restants. Si le second passe au vert, la garde lit un seul worker et conclut sur l'ensemble : la
corriger avant de continuer.

- [ ] **Étape 5 : `check-front-env-keys.mjs` exige l'`ARG` et le `build-arg`**

Après `const RELEVE = …`, ajouter :

```js
/**
 * ADR-0028 — les deux sommets qui DÉPLOIENT. Hors de Vercel, une `NEXT_PUBLIC_*` n'arrive au
 * build que si le Dockerfile la déclare en `ARG` ET si images.yml la passe en `build-args`. Il
 * manque l'un des deux, et la valeur inlinée est `undefined` — sans que rien ne casse au build.
 */
const DOCKERFILE = join(WEB, 'Dockerfile');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'images.yml');
```

Remplacer `for (const chemin of [ENV_EXEMPLE, RELEVE]) {` par
`for (const chemin of [ENV_EXEMPLE, RELEVE, DOCKERFILE, WORKFLOW]) {`.

Après le calcul de `relevees` (et son contrôle `relevees.size === 0`), ajouter :

```js
const argsDockerfile = new Set(
  [...readFileSync(DOCKERFILE, 'utf8').matchAll(/^\s*ARG\s+(NEXT_PUBLIC_[A-Za-z0-9_]+)/gm)].map((m) => m[1]),
);
const argsWorkflow = new Set(
  [...readFileSync(WORKFLOW, 'utf8').matchAll(/^\s*(NEXT_PUBLIC_[A-Za-z0-9_]+)=/gm)].map((m) => m[1]),
);
```

Dans la boucle `for (const [cle, sites] of lues)`, après les deux contrôles existants :

```js
  const ou = `lue par ${sites[0]}${sites.length > 1 ? ` (+${sites.length - 1})` : ''}`;
  if (!argsDockerfile.has(cle)) erreurs.push(`${cle} : ${ou}, absente des ARG de ${relative(ROOT, DOCKERFILE)}`);
  if (!argsWorkflow.has(cle)) erreurs.push(`${cle} : ${ou}, absente des build-args de ${relative(ROOT, WORKFLOW)}`);
```

Dans le bloc `--report`, l'en-tête devient `clé  lectures  .env.example  relevé  Dockerfile  images.yml`
et chaque ligne ajoute `argsDockerfile.has(cle) ? '✓' : '✗'` puis `argsWorkflow.has(cle) ? '✓' : '✗'`.
Le message de succès devient « …déclarées dans .env.example, relevées, en ARG du Dockerfile et
passées par images.yml ».

Run: `node scripts/check-front-env-keys.mjs --report`
Expected : vert, deux clés, quatre `✓` chacune.

- [ ] **Étape 6 : ablation de `check-front-env-keys`**

```bash
sed -i '' '/NEXT_PUBLIC_SITE_URL=\${{/d' .github/workflows/images.yml
node scripts/check-front-env-keys.mjs; echo "code : $?"; git checkout -- .github/workflows/images.yml
```

Expected : `NEXT_PUBLIC_SITE_URL : lue par takussan-web/src/lib/alternates.ts:…, absente des
build-args de .github/workflows/images.yml`, code `1`.

- [ ] **Étape 7 : `check-heredocs.mjs` balaie tout le shell du dépôt**

La garde ne lisait que `scripts/*.sh` et `dev.sh` : `deploy/server/bootstrap.sh`, qui écrit en root
sous `/etc`, lui échapperait. C'est la classe « garde plus étroite que son déclencheur » que son
propre en-tête documente. Remplacer la constante `FICHIERS` par un balayage :

```js
/**
 * TOUT le shell du dépôt, par un balayage et non une liste — la leçon que ce même en-tête tire
 * d'une liste écrite à la main. ADR-0028 a déplacé le shell qui écrit en root sous `/etc` de
 * `scripts/server-setup.sh` vers `deploy/server/bootstrap.sh` : une liste l'aurait perdu en route.
 * Les répertoires cachés (`.git`, `.windsurf`…) et les dépendances sont exclus.
 */
function shDuDepot(dir = ROOT, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') continue;
    const chemin = join(dir, e.name);
    if (e.isDirectory()) shDuDepot(chemin, acc);
    else if (e.name.endsWith('.sh') || e.name === 'dev.sh') acc.push(chemin.slice(ROOT.length + 1));
  }
  return acc;
}
const FICHIERS = shDuDepot().sort();
```

Run: `node scripts/check-heredocs.mjs --report`
Expected : vert ; la liste des fichiers balayés contient `dev.sh`, `deploy/server/bootstrap.sh`,
`deploy/takussan/smoke-api.sh`, `deploy/takussan/smoke-web.sh`, `takussan-api/docker/*.sh`,
`scripts/test-release-reindex.sh`.

- [ ] **Étape 8 : `repo-ci.yml`**

1. Dans **les deux** listes `paths:` (`pull_request` et `push`), après `- 'takussan-web/next.config.ts'` :

```yaml
      # ADR-0028 : `check-queues` lit `deploy/takussan/compose.api.yml`, `check-heredocs` tout le
      # shell (dont `deploy/**` et `takussan-api/docker/**`), `check-front-env-keys` le Dockerfile
      # du front, et `test-release-reindex` lit `takussan-api/docker/`. Les deux côtés de chaque
      # garde doivent la déclencher.
      - 'deploy/**'
      - 'takussan-api/docker/**'
      - 'takussan-web/Dockerfile'
```

2. Dans le commentaire du haut du bloc `paths:`, la ligne
   `check-queues → les onQueue() de takussan-api/app, scripts/server-setup.sh ET dev.sh` devient
   `check-queues → les onQueue() de takussan-api/app, deploy/takussan/compose.api.yml ET dev.sh`.
3. Le step « La décision de réindexation de `deploy.sh` fait ce qu'elle annonce » devient :

```yaml
      - name: La décision de réindexation de `release.sh` fait ce qu'elle annonce
        # Successeur du test de la décision de `deploy.sh`, retiré avec lui (ADR-0028). Même
        # raison d'être : ni PHPUnit ni vitest ne lisent du shell, et se tromper est muet des deux
        # côtés — trop réindexer noie Meilisearch (3308 tâches pour une exécution, D-44), trop peu
        # laisse la recherche répondre sur un index périmé. Le harnais joue le VRAI release.sh
        # dans un APP_ROOT jetable, talonne `php`, et finit par une ablation qui échoue exprès.
        run: ./scripts/test-release-reindex.sh
```

4. Le commentaire du step « Aucune substitution involontaire dans un heredoc non quoté » se met au
   passé pour `server-setup.sh` (« écrivait… a réellement invoqué la fonction, EN ROOT »), et
   nomme le présent : `deploy/server/bootstrap.sh` écrit sous `/etc` par heredoc, quoté.
5. L'en-tête du fichier (lignes 14-15) cite `test-deploy-search-reindex.sh` comme l'exception
   assumée : le remplacer par `test-release-reindex.sh`, et `deploy.sh` par `release.sh`.

- [ ] **Étape 9 : relire ce qu'on supprime, puis supprimer**

```bash
for f in scripts/deploy.sh scripts/server-setup.sh scripts/seed-environnement.sh scripts/seed-remote.sh \
         scripts/deploy-preview-vps.sh scripts/deploy-prod-vps.sh scripts/test-deploy-search-reindex.sh; do
  echo "=== $f"; sed -n '1,12p' "$f"
done
```

Expected : chacun est un morceau de la chaîne bash (déploiement, provisionnement, seed distant,
enveloppes VPS, test de `deploy.sh`). Un fichier qui fait **autre chose** sort de la liste et se
signale au porteur avant d'aller plus loin.

```bash
git rm scripts/deploy.sh scripts/server-setup.sh scripts/seed-environnement.sh scripts/seed-remote.sh \
       scripts/deploy-preview-vps.sh scripts/deploy-prod-vps.sh scripts/test-deploy-search-reindex.sh
for g in scripts/check-*.mjs; do node "$g" >/dev/null || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check && node docs/gen-features-by-actor.mjs --check
```

Expected : aucune ligne `✗`, les deux générateurs à jour. `check-doc-links` peut rougir ici sur des
liens vers les fichiers supprimés : c'est B6 qui les répare, et B5 ne se commite pas tant qu'il rougit
— on enchaîne B6 **avant** le commit de B5, ou on commite les deux ensemble.

- [ ] **Étape 10 : commit**

```bash
git add scripts .github/workflows/repo-ci.yml
git commit -m "ci: les gardes lisent la chaîne conteneurisée ; retrait de deploy.sh et server-setup.sh (ADR-0028)"
```

### Tâche B6 : la documentation

**Files:**
- Create: `docs/infra/hebergement.md`
- Delete: `docs/infra/premier-deploiement.md`, `docs/infra/deploy-preview.html`
- Modify: `CLAUDE.md`, `docs/ardoise.md`, `docs/configuration.md`, `docs/infra/versions.json`,
  `docs/infra/versions.md`, et les commentaires listés à l'étape 3

- [ ] **Étape 1 : écrire `docs/infra/hebergement.md`**

Même patron que `frontend-deploiement.md` (ADR-0017) : le dépôt ne contrôle pas l'état de Dokploy,
il le **relève** et dit comment le re-mesurer. Chaque valeur porte sa date ; une valeur pas encore
relevée s'écrit *non mesuré*, jamais devinée.

````markdown
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

La production s'ajoute à ce tableau en phase F du plan.

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
a été jouée à blanc en D5 ; ses comptes de lignes sont dans le ticket D.

**Reconstruire le serveur** : plan, tâches A2 → A5, puis D1 (déclarer les services depuis ce relevé),
puis restaurer les bases depuis R2.

**Mettre Dokploy à jour** : Settings → *Update*, après avoir lu les notes de version. Relever la
nouvelle version ici.

## Ce que Caddy reprend de l'ancien vhost nginx

| nginx (`scripts/server-setup.sh`, retiré) | `takussan-api/docker/Caddyfile` |
|---|---|
| `client_max_body_size 25M` | `request_body { max_size 25MiB }` |
| `gzip on; gzip_min_length 1024` (JSON compris) | `encode zstd gzip { minimum_length 1024 }` |
| `location /storage/ { … max-age=604800, stale-while-revalidate=86400 }` | `@storage` + `header` — **sans** `immutable` |
| `location ~ /\.(?!well-known) { deny all; }` | `@cache_hidden` → `respond 404` |
| `fastcgi_read_timeout 60` | `max_execution_time = 60` (`docker/php.ini`) |

## Ce qui n'est pas mesurable depuis le dépôt

L'état réel de Dokploy (services, domaines, variables) ; le mode SSL et les règles de la zone
Cloudflare ; le contenu du seau R2. Ce relevé les date ; il ne les garantit pas.
````

- [ ] **Étape 2 : supprimer les guides de la chaîne bash, puis réparer les liens**

```bash
git rm docs/infra/premier-deploiement.md docs/infra/deploy-preview.html
node scripts/check-doc-links.mjs
```

Pour chaque lien cassé signalé : dans un **document vivant** (`docs/configuration.md`,
`docs/infra/*`, `CLAUDE.md`), pointer vers `docs/infra/hebergement.md` ; dans un **ADR ou un
document daté** (`docs/adr/`, `docs/qa/`, `docs/superpowers/`, un ticket), remplacer le lien par le
nom du fichier en texte simple suivi de « (retiré par ADR-0028) » — un ADR ne se réécrit pas, il
garde ce qu'on a cru.

- [ ] **Étape 3 : les commentaires qui citent la chaîne comme un état présent**

Inventaire mesuré le 2026-09-13 (`grep -rnE 'server-setup\.sh|deploy\.sh|deploy-preview\.html'`, hors
tickets, plans, ADR et documents datés) :

| Fichier:ligne | Ce qu'il cite | Ce qu'il doit citer |
|---|---|---|
| `dev.sh:791`, `dev.sh:808` | le `--queue` et les deux workers de `server-setup.sh` | `deploy/takussan/compose.api.yml` |
| `takussan-api/.env.docker:131,138` | `deploy-preview.html` | garder au passé (« ce que ce relevé a remplacé ») — c'est un récit |
| `takussan-api/config/cors.php:15` | `docs/infra/deploy-preview.html` | `docs/infra/hebergement.md` |
| `takussan-api/app/Services/Payments/PaymentReceiptPdf.php:15` | `deploy.sh` installe en `--no-dev` | `takussan-api/Dockerfile` (cible `vendor`) installe en `--no-dev` |
| `takussan-api/app/Jobs/RefreshNewBuildSearchLabel.php:19` | `scripts/deploy.sh` importe sur un diff de fichiers | `docker/release.sh` réimporte sur un changement de l'empreinte `.search-shape` |
| `takussan-api/app/Models/Property.php:384` | `scripts/deploy.sh` le sait | l'empreinte `.search-shape` du Dockerfile le couvre |
| `takussan-api/app/Console/Commands/SearchWolofReviewSheet.php:342` | `scripts/deploy.sh` (texte **affiché** en console) | `takussan-api/Dockerfile` (empreinte `.search-shape`) |
| `takussan-api/app/Console/Commands/MediaRegeneratePropertyConversions.php:30` | `scripts/server-setup.sh` pour `Cache-Control` | `takussan-api/docker/Caddyfile` |
| `scripts/check-deps-dev-atteignables.mjs:9` | `deploy.sh` en `--no-dev` | la cible `vendor` du Dockerfile de l'API |
| `scripts/check-cache-headers-auth.mjs:62` | `server-setup.sh`, que la garde ne lit pas | `takussan-api/docker/Caddyfile`, que la garde ne lit pas |
| `scripts/check-heredocs.mjs:7` | `server-setup.sh` écrit `/etc/sudoers.d` | au passé ; le présent est `deploy/server/bootstrap.sh` |
| `scripts/check-infra-versions.mjs:10-12` | `server-setup.sh` n'installe rien ; `deploy-preview.html` §6.4 | la production s'épingle dans les images (ADR-0028) et se **mesure** dans les conteneurs |
| `.github/dependabot.yml:91` | `deploy.sh` lance `npm ci` puis `npm run build` | l'étape `assets` du Dockerfile de l'API |
| `.github/workflows/repo-ci.yml:~822, ~904` | `server-setup.sh`, `deploy.sh` | idem `check-infra-versions` et `check-deps-dev-atteignables` |
| `docs/configuration.md:260-264, 444` | `deploy.sh` Step 6b ; `server-setup.sh` et Redis | `docker/release.sh` ; Redis dans `deploy/server/compose.data.yml` |
| `docs/infra/versions.md:17-20, 63` | `server-setup.sh`, `deploy-preview.html`, `/etc/takussan/php-version` | voir l'étape 4 |

Puis, pour les fichiers PHP : `cd takussan-api && ./vendor/bin/pint && cd ..`.

- [ ] **Étape 4 : `docs/infra/versions.json` et `versions.md`**

Pour chaque service (`meilisearch`, `redis`, `mailpit`, `php`, `node`, `postgres`), le champ `prod`
garde `"etat": "non_mesure"` et `"valeur": null`, et ses deux textes changent :

- `commande` : la mesure **dans le conteneur** — `docker exec <conteneur> meilisearch --version`,
  `redis-server --version`, `php -v`, `node -v`, `postgres --version`. Pour `mailpit` :
  `"sans objet en production : aucun conteneur mailpit sur le serveur (ADR-0028)"`.
- `pourquoi` : « Épinglée dans une image depuis ADR-0028, mais une image déclarée n'est pas une
  image servie : la valeur se relève dans le conteneur en marche, datée — plan d'ADR-0028, tâche
  F5. »

Dans `versions.md`, réécrire le paragraphe des lignes 17-20 dans ce sens, et remplacer la commande
de la ligne 63 par `docker exec <conteneur de l'API> php -v`.

Run: `node scripts/check-infra-versions.mjs --report`
Expected : vert.

- [ ] **Étape 5 : `docs/ardoise.md` et `CLAUDE.md`**

- **D-04** : ajouter sous le titre une ligne d'état — « En voie de résorption par ADR-0028 : la
  chaîne qui échouait est retirée (plan, B5). Se solde à la phase F, quand `https://api.takussan.com/up`
  rend 200 et le commit attendu dans `X-Build-Sha`. »
- **D-10** : « L'extériorité assumée par ADR-0017 est révoquée par ADR-0028 ; se solde à la phase F. »
- **`CLAUDE.md`**, section « Workflow git » : ajouter, sous le paragraphe sur `master`, « **ADR-0028
  est accepté et en cours** : les préproductions passent sur Dokploy (plan, phase D). Jusqu'à la
  phase F, `master` sert toujours le front de production par Vercel, et tout ce qui précède reste
  vrai. » Section « Les commandes réelles », bloc Racine : ajouter
  `deploy/takussan/smoke-api.sh image|pile` et `deploy/takussan/smoke-web.sh` avec une ligne chacun.

- [ ] **Étape 6 : vérifier que plus rien ne cite la chaîne comme un présent**

D'abord, ADR-0028 cite `docs/infra/hebergement.md` avant qu'il n'existe, sous un marqueur
`<!-- lien-mort-assumé : créé par la tâche B6 … -->` : le document existe désormais, **retirer le
marqueur** de sa ligne. Sinon, la garde des liens accepterait en silence que ce relevé disparaisse.

```bash
grep -n 'lien-mort-assumé' docs/adr/0028-auto-hebergement-conteneurise-sur-le-vps.md   # doit ne rien rendre
node scripts/check-doc-links.mjs                                                        # vert : le fichier existe
grep -rnE 'server-setup\.sh|scripts/deploy\.sh|seed-(environnement|remote)\.sh|deploy-(preview|prod)-vps\.sh|test-deploy-search-reindex|premier-deploiement|deploy-preview\.html' \
  --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git --exclude-dir=.windsurf --exclude-dir=.next . \
  | grep -vE 'docs/(backlog|plans|qa|superpowers)/|journal-des-corrections|docs/adr/'
for g in scripts/check-*.mjs; do node "$g" >/dev/null || echo "✗ $g"; done
```

Expected : les seules lignes restantes sont au passé ou en récit (`.env.docker`, commentaires
d'histoire) ; aucune garde `✗`.

- [ ] **Étape 7 : commit (avec B5 s'il attendait)**

```bash
git add docs CLAUDE.md dev.sh takussan-api .github scripts
git commit -m "docs(infra): relevé de l'hébergement Dokploy ; la chaîne bash quitte la documentation (ADR-0028)"
```

---

## Piste C — dépôt check-print-plus

Dépôt `thiambara/check-print-plus` (**privé**, branche par défaut `master`, intégration `dev`,
préproduction `preview`). Mêmes règles que la piste B : tout s'éprouve en local. Les commits suivent
les conventions de **ce** dépôt ; l'ADR et ce plan vivent dans `thiambara/takussan`, public, vers
lequel `docs/hebergement.md` renvoie (C4).

Faits mesurés le 2026-09-13 dont dépend la piste :

| Fait | Source |
|---|---|
| Laravel 12, `php ^8.2`, CI en 8.4 ; `ext-intl` ; `laravel/tinker` et `laravel/telescope` en `require` | `laravel_api/composer.json` |
| MySQL, `QUEUE_CONNECTION=redis` (file `default`, aucun `onQueue`), `CACHE_STORE=redis`, `SESSION_DRIVER=database` | `laravel_api/.env.example` |
| trois tâches planifiées | `laravel_api/routes/console.php` |
| `@vite` dans `welcome` et les vues admin ; le CSS balaie `vendor/` (`@source`) | `resources/css/app.css`, `admin.css` |
| nginx : `client_max_body_size 25M`, `location /storage/ { expires 7d; }`, fichiers cachés refusés | `scripts/server-setup.sh:205-227` |
| **`php artisan db:seed-production` n'existe pas** ; seul le docblock de `ProductionSeeder` la cite | `grep -rn seed-production app routes …` → une ligne, le docblock |
| `ProductionSeeder` (rôles, plans, banques et modèles) n'utilise pas Faker | `grep -nE 'fake\(\)\|Faker\|::factory\(' …` → aucune occurrence |
| `laravel_api/.env` et `web/.env.local` existent sur le poste ; `.gitignore` racine n'exclut que `.env`, `.env.backup`, `.env.production` | `ls -A`, `.gitignore` |
| Le front lit `NEXT_PUBLIC_BACKEND_API_URL`, `NEXT_PUBLIC_BACKEND_API_HOST`, `BACKEND_API_HOST`, `NEXT_PUBLIC_SITE_URL` (repli sur `https://checkprintplus.com` par `??`, `src/lib/seo.ts:5` — qui ne joue pas dans l'image, cf. § Écarts), `NEXT_PUBLIC_MAINTENANCE_MODE`, `NEXT_PUBLIC_DOWNLOAD_URL_MAC`/`_WIN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | `grep -rhoE 'process\.env\.[A-Z_]+' web/src web/next.config.ts` |

### Tâche C1 : l'image et la pile de l'API

**Files:**
- Create: `laravel_api/Dockerfile`, `laravel_api/.dockerignore`
- Create: `laravel_api/docker/Caddyfile`, `laravel_api/docker/php.ini`, `laravel_api/docker/entrypoint.sh`, `laravel_api/docker/release.sh`
- Create: `deploy/compose.api.yml`, `deploy/.env.smoke.example`, `deploy/smoke-api.sh`
- Modify: `.gitignore`

**Interfaces:**
- Produces : image `ghcr.io/thiambara/check-print-plus-api:<tag>` (utilisateur `www-data`, port
  `8080`, `X-Build-Sha`) ; `deploy/compose.api.yml` avec `release` → `api`, `worker`, `scheduler`,
  volume `storage`, réseau externe `dokploy-network`, interpolation obligatoire `IMAGE_TAG`.

- [ ] **Étape 1 : écrire le test — `deploy/.env.smoke.example`**

```dotenv
# Environnement du test de fumée LOCAL (deploy/smoke-api.sh pile). Aucune valeur secrète : MySQL et
# Redis sont des conteneurs jetables que le script démarre sur le réseau dokploy-network local.
IMAGE_TAG=local
APP_NAME="CheckPrint Plus"
APP_ENV=production
APP_DEBUG=false
APP_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000
LOG_CHANNEL=stderr
DB_CONNECTION=mysql
DB_HOST=cpp-smoke-mysql
DB_PORT=3306
DB_DATABASE=checkprintplus_smoke
DB_USERNAME=cpp
DB_PASSWORD=smoke
CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=database
REDIS_CLIENT=phpredis
REDIS_HOST=cpp-smoke-redis
REDIS_PASSWORD=null
REDIS_PORT=6379
REDIS_DB=0
REDIS_CACHE_DB=1
MAIL_MAILER=log
TELESCOPE_ENABLED=false
TRUSTED_PROXIES=172.16.0.0/12
```

- [ ] **Étape 2 : écrire le test — `deploy/smoke-api.sh`**

```bash
#!/usr/bin/env bash
# Test de fumée de l'image d'API CheckPrint Plus et de sa pile, EN LOCAL.
# Décision : ADR-0028 de thiambara/takussan. Prérequis :
#   docker build --build-arg BUILD_SHA=smoke -t ghcr.io/thiambara/check-print-plus-api:local laravel_api
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=ghcr.io/thiambara/check-print-plus-api:local
PROJET=cpp-smoke
COMPOSE=(docker compose -p "$PROJET" -f deploy/compose.api.yml)
ENV_LOCAL=deploy/.env
MARQUE='# généré par smoke-api.sh — jetable'

echec() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }
dans() { docker run --rm --entrypoint "$1" "$IMAGE" "${@:2}"; }
sonde() { docker run --rm --network dokploy-network curlimages/curl -sS "$@"; }
tinker() { "${COMPOSE[@]}" exec -T api php artisan tinker --execute "$1"; }

verifier_image() {
  local exts
  exts=$(dans php -m)
  for e in pdo_mysql redis intl bcmath gd zip exif pcntl 'Zend OPcache'; do
    grep -qx "$e" <<<"$exts" || echec "extension PHP absente : $e"
  done
  ok "extensions PHP"
  [ "$(dans id -un)" = www-data ] || echec "l'image ne tourne pas sous www-data"
  [ "$(dans sh -c 'ls -A /app | grep -c "^\.env" || true')" = 0 ] || echec "un .env est entré dans l'image (laravel_api/.env existe sur le poste)"
  ok "www-data, aucun .env"
  dans php -r 'require "/app/vendor/autoload.php"; exit(class_exists("Faker\\Factory") ? 1 : 0);' || echec "des dépendances de dev sont dans l'image"
  dans test -f /app/public/build/manifest.json || echec "assets Vite absents"
  [ "$(dans readlink /app/public/storage)" = /app/storage/app/public ] || echec "lien public/storage absent"
  [ "$(dans printenv BUILD_SHA)" = smoke ] || echec "BUILD_SHA n'est pas transmis"
  ok "sans dépendance de dev, assets, lien storage, BUILD_SHA"
}

nettoyer_pile() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  docker rm -f cpp-smoke-mysql cpp-smoke-redis >/dev/null 2>&1 || true
  rm -f "$ENV_LOCAL"
}

verifier_pile() {
  local api="http://$PROJET-api-1:8080"
  if [ -f "$ENV_LOCAL" ] && ! head -1 "$ENV_LOCAL" | grep -qxF "$MARQUE"; then
    echec "$ENV_LOCAL existe et n'a pas été généré par ce script : refus de l'écraser"
  fi
  trap nettoyer_pile EXIT
  { echo "$MARQUE"; cat deploy/.env.smoke.example; echo "APP_KEY=base64:$(openssl rand -base64 32)"; } > "$ENV_LOCAL"
  docker network inspect dokploy-network >/dev/null 2>&1 || docker network create dokploy-network >/dev/null
  docker run -d --name cpp-smoke-mysql --network dokploy-network -e MYSQL_ROOT_PASSWORD=smoke \
    -e MYSQL_DATABASE=checkprintplus_smoke -e MYSQL_USER=cpp -e MYSQL_PASSWORD=smoke mysql:8.4 >/dev/null
  docker run -d --name cpp-smoke-redis --network dokploy-network redis:8-alpine >/dev/null
  for _ in $(seq 60); do docker exec cpp-smoke-mysql mysql -ucpp -psmoke -e 'SELECT 1' checkprintplus_smoke >/dev/null 2>&1 && break; sleep 2; done

  "${COMPOSE[@]}" up -d --pull never --wait || { "${COMPOSE[@]}" logs release; echec "la pile ne démarre pas"; }
  ok "la pile démarre, release d'abord"

  [ "$(sonde -o /dev/null -w '%{http_code}' "$api/up")" = 200 ] || echec "/up ne rend pas 200"
  sonde -D - -o /dev/null "$api/up" | tr -d '\r' | grep -qix 'x-build-sha: smoke' || echec "X-Build-Sha absent ou faux"
  ok "/up à 200, X-Build-Sha: smoke"

  "${COMPOSE[@]}" run --rm --entrypoint php release artisan db:seed --class=ProductionSeeder --force >/dev/null \
    || echec "ProductionSeeder échoue dans l'image de production"
  [ "$(tinker 'echo DB::table("plans")->count();' | tr -dc '0-9')" -gt 0 ] || echec "ProductionSeeder n'a créé aucun plan"
  ok "ProductionSeeder tourne sans les dépendances de dev"

  tinker "dispatch(fn () => logger('sonde'));" >/dev/null
  for _ in $(seq 20); do
    [ "$(tinker 'echo Queue::size("default");' | tr -dc '0-9')" = 0 ] && break; sleep 2
  done
  [ "$(tinker 'echo Queue::size("default");' | tr -dc '0-9')" = 0 ] || echec "la file default n'est pas consommée"
  ok "la file default est consommée"

  "${COMPOSE[@]}" exec -T api sh -c 'echo sonde > /app/storage/app/public/sonde.txt'
  sonde -D - -o /dev/null "$api/storage/sonde.txt" | tr -d '\r' | grep -qix 'cache-control: max-age=604800' \
    || echec "Cache-Control de /storage différent de nginx (expires 7d)"
  [ "$(sonde -o /dev/null -w '%{http_code}' "$api/.htaccess")" = 404 ] || echec "public/.htaccess est servi"
  head -c $((26 * 1024 * 1024)) /dev/zero > /tmp/cpp-26mo
  [ "$(docker run --rm --network dokploy-network -v /tmp:/t curlimages/curl -sS -o /dev/null -w '%{http_code}' --data-binary @/t/cpp-26mo "$api/up")" = 413 ] \
    || echec "un corps de 26 Mio n'est pas refusé en 413"
  rm -f /tmp/cpp-26mo
  ok "règles reprises de nginx : cache de /storage, fichiers cachés, 25 Mio"

  sleep 30
  for s in api worker scheduler; do
    [ "$(docker inspect -f '{{.RestartCount}}' "$PROJET-$s-1")" = 0 ] || echec "$s redémarre en boucle"
  done
  ok "aucun service ne redémarre"
  docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep "$PROJET"
}

case "${1:-}" in
  image) verifier_image ;;
  pile) verifier_pile ;;
  *) echo "usage : $0 image|pile" >&2; exit 2 ;;
esac
```

Run: `chmod +x deploy/smoke-api.sh && deploy/smoke-api.sh image`
Expected : échec, image `…:local` introuvable.

- [ ] **Étape 3 : épingler FrankenPHP**

Même relevé qu'en B1, étape 3, et **le même tag** : les deux API tournent sur le même PHP.

```bash
docker run --rm dunglas/frankenphp:1-php8.4-bookworm frankenphp version
```

- [ ] **Étape 4 : écrire `laravel_api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
#
# Image de l'API CheckPrint Plus — décision : ADR-0028 de thiambara/takussan (§3-4). UNE image par
# commit, qui sert la préproduction ET la production : aucune configuration n'y est cuite.
# Pas de HEALTHCHECK : worker et scheduler n'écoutent aucun port (sonde sur le service `api`).
ARG FRANKENPHP_TAG=1-php8.4-bookworm

FROM dunglas/frankenphp:${FRANKENPHP_TAG} AS base
RUN install-php-extensions pdo_mysql redis intl bcmath gd zip exif pcntl opcache \
 && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
COPY docker/php.ini "$PHP_INI_DIR/conf.d/zz-checkprintplus.ini"
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app

FROM base AS vendor
COPY composer.json composer.lock ./
RUN composer check-platform-reqs --lock --no-dev \
 && composer install --no-dev --no-scripts --no-autoloader --no-interaction --prefer-dist

# resources/css/app.css et admin.css balaient des vues de vendor/ (@source).
FROM node:24-bookworm-slim AS assets
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
COPY --from=vendor /app/vendor ./vendor
RUN npm run build

FROM base AS runtime
ARG BUILD_SHA=inconnu
ENV BUILD_SHA=${BUILD_SHA}
COPY . .
COPY --from=vendor /app/vendor ./vendor
COPY --from=assets /app/public/build ./public/build
COPY docker/Caddyfile /etc/frankenphp/Caddyfile
RUN mkdir -p storage/app/private storage/app/public storage/framework/cache/data \
      storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
 && composer dump-autoload --no-dev --optimize --no-scripts \
 && php artisan package:discover --ansi \
 && php artisan storage:link \
 && chmod 755 docker/*.sh \
 && chown -R www-data:www-data storage bootstrap/cache /data/caddy /config/caddy
USER www-data
EXPOSE 8080
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]
```

Remplacer `1-php8.4-bookworm` par le tag relevé à l'étape 3.

- [ ] **Étape 5 : écrire `laravel_api/.dockerignore`**

```gitignore
# ⚠ `.env*` EN TÊTE : laravel_api/.env existe sur le poste, et le .gitignore du dépôt n'exclut pas
# `.env.*` en général. Sans cette ligne, docker build le copie dans une image poussée sur un registre.
.env*
.git
.idea
.claude
.cursor
.gemini
.mcp.json
.DS_Store
.phpunit.result.cache
*.txt
node_modules
vendor
public/build
public/hot
public/storage
bootstrap/cache/*.php
storage
tests
docs
Dockerfile
.dockerignore
```

⚠ `*.txt` écarte le compte rendu de session daté qui traîne à la racine de `laravel_api/` ;
`public/robots.txt`, s'il existe, est sous `public/` et n'est pas concerné (le motif ne descend pas).

- [ ] **Étape 6 : écrire `laravel_api/docker/Caddyfile`**

```caddyfile
{
	frankenphp
	auto_https off
	admin off
	# PAS de `trusted_proxies` : Caddy retiendrait l'IP la plus à GAUCHE de X-Forwarded-For,
	# celle que le client écrit lui-même — la limite de débit par IP des licences se
	# contournerait en changeant d'en-tête. Laravel seul remonte la chaîne, par TRUSTED_PROXIES.
}

:8080 {
	root * /app/public
	encode zstd gzip {
		minimum_length 1024
	}
	# nginx : client_max_body_size 25M (25 × 1024 × 1024 octets).
	request_body {
		max_size 25MiB
	}
	# nginx : location /storage/ { expires 7d; }, qui émet Cache-Control: max-age=604800.
	@storage path /storage/*
	header @storage Cache-Control "max-age=604800"
	# nginx : location ~ /\.(?!well-known) { deny all; }
	@cache_hidden {
		path_regexp /\.
		not path /.well-known/*
	}
	respond @cache_hidden 404
	header X-Build-Sha {$BUILD_SHA}
	header -Server
	php_server
}
```

- [ ] **Étape 7 : écrire `laravel_api/docker/php.ini`, `entrypoint.sh`, `release.sh`**

`laravel_api/docker/php.ini` :

```ini
; Réglages de production de l'API CheckPrint Plus (ADR-0028 de thiambara/takussan, §4).
expose_php = Off
memory_limit = 256M
upload_max_filesize = 25M
post_max_size = 26M
max_execution_time = 60
opcache.enable = 1
opcache.validate_timestamps = 0
opcache.memory_consumption = 128
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
```

`laravel_api/docker/entrypoint.sh` :

```sh
#!/bin/sh
# Point d'entrée d'api, worker et scheduler. La configuration se met en cache AU DÉMARRAGE : elle
# vient de l'environnement du conteneur, que l'image ne connaît pas.
set -eu
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
exec "$@"
```

`laravel_api/docker/release.sh` :

```sh
#!/bin/sh
# Service `release` de deploy/compose.api.yml : joué une fois par déploiement, avant api, worker et
# scheduler, qui attendent son succès. Reprend scripts/deploy.sh.
#
# ProductionSeeder n'est PAS joué ici : il écrit les plans et les modèles, et le rejouer à chaque
# déploiement écraserait ce qu'un administrateur y a modifié. Il se lance une fois, à la main
# (plan d'ADR-0028, D7 et F4).
set -eu
php artisan migrate --force
```

- [ ] **Étape 8 : écrire `deploy/compose.api.yml`**

```yaml
# Pile d'API CheckPrint Plus d'UN environnement, déployée par Dokploy — décision : ADR-0028 de
# thiambara/takussan (§5). Le même fichier sert la préproduction et la production.
# Le domaine est posé par Dokploy (service `api`, port 8080). `container_name` est interdit.

x-api: &api
  image: ghcr.io/thiambara/check-print-plus-api:${IMAGE_TAG:?IMAGE_TAG manquant}
  pull_policy: always
  env_file: .env
  restart: unless-stopped
  volumes:
    - storage:/app/storage/app
  networks:
    - dokploy-network

x-apres-release: &apres-release
  depends_on:
    release:
      condition: service_completed_successfully

services:
  release:
    <<: *api
    restart: "no"
    entrypoint: ["/app/docker/release.sh"]
    mem_limit: 384m

  api:
    <<: [*api, *apres-release]
    mem_limit: 256m
    healthcheck:
      test: ["CMD", "php", "-r", "exit(@file_get_contents('http://127.0.0.1:8080/up') === false ? 1 : 0);"]
      interval: 15s
      timeout: 5s
      start_period: 30s
      retries: 3

  # Aucun onQueue() dans le code : tout part sur `default`, dont les courriels mis en file.
  worker:
    <<: [*api, *apres-release]
    command: php artisan queue:work redis --queue=default --sleep=3 --tries=3 --max-time=3600
    stop_grace_period: 60s
    mem_limit: 192m

  scheduler:
    <<: [*api, *apres-release]
    command: php artisan schedule:work
    mem_limit: 128m

volumes:
  storage:

networks:
  dokploy-network:
    external: true
```

- [ ] **Étape 9 : ignorer le `.env` jetable, construire, faire passer le test**

Ajouter au `.gitignore` racine :

```gitignore
# Environnements des piles Compose : générés par les tests de fumée, portés par Dokploy sur le
# serveur. Jamais versionnés — seuls les *.example le sont.
deploy/**/.env
```

```bash
docker build --build-arg BUILD_SHA=smoke -t ghcr.io/thiambara/check-print-plus-api:local laravel_api
deploy/smoke-api.sh image && deploy/smoke-api.sh pile
```

Expected : trois `✓` pour l'image, six pour la pile, puis la mémoire par conteneur (à reporter
dans le budget).

- [ ] **Étape 10 : ablations**

| On casse | Le test doit échouer sur |
|---|---|
| retirer `.env*` de `.dockerignore`, dans un `git worktree` sans secret où l'on crée un `laravel_api/.env.sonde` | `un .env est entré dans l'image` |
| retirer `--queue=default` **et** remplacer `redis` par `database` dans la commande du worker | `la file default n'est pas consommée` |
| remplacer `max-age=604800` par `max-age=60` | `Cache-Control de /storage différent de nginx` |

Chacune se fait, se constate, s'annule. La première suit la procédure de B1, étape 13 (jamais dans
l'arbre de travail, qui porte un `.env` réel).

- [ ] **Étape 11 : commit**

```bash
git add laravel_api/Dockerfile laravel_api/.dockerignore laravel_api/docker deploy .gitignore
git commit -m "build(api): image FrankenPHP et pile Compose de l'API, test de fumée local"
```

### Tâche C2 : l'image du front

**Files:**
- Create: `web/Dockerfile`, `web/.dockerignore`, `deploy/smoke-web.sh`
- Modify: `web/next.config.ts`

**Interfaces:**
- Produces : image `ghcr.io/thiambara/check-print-plus-web:<environnement>`, utilisateur `node`,
  port `3000`. Arguments de build **obligatoires** `NEXT_PUBLIC_BACKEND_API_URL`,
  `BACKEND_API_HOST`, `NEXT_PUBLIC_SITE_URL` ; facultatifs `NEXT_PUBLIC_BACKEND_API_HOST`,
  `NEXT_PUBLIC_MAINTENANCE_MODE`, `NEXT_PUBLIC_DOWNLOAD_URL_MAC`, `NEXT_PUBLIC_DOWNLOAD_URL_WIN`,
  `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `BUILD_SHA`. Secret de build
  `sentry_auth_token` (facultatif : sans lui, `withSentryConfig` n'envoie pas les sources).

- [ ] **Étape 1 : relever les valeurs servies aujourd'hui**

Les `NEXT_PUBLIC_*` sont lisibles dans le bundle servi — la méthode d'ADR-0017, sans accès à Vercel :

```bash
curl -s https://www.checkprintplus.com/ | grep -oE '/_next/static/chunks/[^"]+\.js' | sort -u > /tmp/chunks
while read -r c; do curl -s "https://www.checkprintplus.com$c"; done < /tmp/chunks \
  | grep -oE 'https://[a-zA-Z0-9./_-]*(api\.checkprintplus|ingest[a-z.]*sentry\.io|releases|download)[a-zA-Z0-9./_?=-]*' | sort -u
```

Noter les URL de téléchargement et le DSN Sentry servis : ce sont les valeurs de production. Pour la
préproduction, les URL d'API et de site sont celles du tableau de C3 ; les autres reprennent les
valeurs relevées ici, sauf décision contraire du porteur.

- [ ] **Étape 2 : écrire le test — `deploy/smoke-web.sh`**

```bash
#!/usr/bin/env bash
# Test de fumée de l'image du front CheckPrint Plus, EN LOCAL (ADR-0028 de thiambara/takussan).
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=ghcr.io/thiambara/check-print-plus-web:local
NOM=cpp-web-smoke
PORT=3997
HOTE=https://preview.api.checkprintplus.com
SITE=https://preview.checkprintplus.com

echec() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

for manque in BACKEND_API_HOST NEXT_PUBLIC_SITE_URL; do
  args=(--build-arg "NEXT_PUBLIC_BACKEND_API_URL=$HOTE/api/v1")
  [ "$manque" = BACKEND_API_HOST ] || args+=(--build-arg "BACKEND_API_HOST=$HOTE")
  [ "$manque" = NEXT_PUBLIC_SITE_URL ] || args+=(--build-arg "NEXT_PUBLIC_SITE_URL=$SITE")
  if docker build -q "${args[@]}" -t "$IMAGE-refus" web >/dev/null 2>&1; then
    docker image rm -f "$IMAGE-refus" >/dev/null; echec "l'image se construit sans $manque"
  fi
done
ok "build refusé sans BACKEND_API_HOST, et sans NEXT_PUBLIC_SITE_URL"

docker build -q --build-arg "NEXT_PUBLIC_BACKEND_API_URL=$HOTE/api/v1" --build-arg "BACKEND_API_HOST=$HOTE" \
  --build-arg "NEXT_PUBLIC_BACKEND_API_HOST=$HOTE" --build-arg "NEXT_PUBLIC_SITE_URL=$SITE" \
  --build-arg BUILD_SHA=smoke -t "$IMAGE" web >/dev/null
docker rm -f "$NOM" >/dev/null 2>&1 || true
trap 'docker rm -f "$NOM" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NOM" -p "$PORT:3000" "$IMAGE" >/dev/null
for _ in $(seq 30); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] && break; sleep 2; done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$NOM")" = healthy ] || { docker logs "$NOM"; echec "conteneur non sain"; }
ok "conteneur sain"

[ "$(docker exec "$NOM" id -un)" = node ] || echec "l'image ne tourne pas sous node"
[ "$(docker exec "$NOM" sh -c 'ls -A /app | grep -c "^\.env" || true')" = 0 ] || echec "un .env est entré dans l'image (web/.env.local existe sur le poste)"
ok "utilisateur node, aucun .env"

entetes=$(curl -sS -o /dev/null -D - "http://127.0.0.1:$PORT/robots.txt" | tr -d '\r')
grep -qix 'x-build-sha: smoke' <<<"$entetes" || echec "X-Build-Sha absent ou faux"
grep -i '^content-security-policy:' <<<"$entetes" | grep -qF "$HOTE" || echec "la CSP n'autorise pas l'API : BACKEND_API_HOST n'a pas été lu au build"
docker exec "$NOM" grep -rqF "$SITE" /app/.next/server || echec "NEXT_PUBLIC_SITE_URL n'est pas inlinée"
ok "X-Build-Sha, CSP vers l'API, origine du site inlinée"
```

Run: `chmod +x deploy/smoke-web.sh && deploy/smoke-web.sh`
Expected : le premier `✓` tombe pour une mauvaise raison (Dockerfile absent), puis échec au build
réel. L'étape 6 prouve le refus pour la bonne raison.

- [ ] **Étape 3 : écrire `web/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
#
# Image du front CheckPrint Plus — ADR-0028 de thiambara/takussan (§3). UNE image PAR ENVIRONNEMENT :
# NEXT_PUBLIC_* est inliné à la compilation, et next.config.ts lit BACKEND_API_HOST au build (CSP,
# optimiseur d'images).

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_BACKEND_API_URL
ARG NEXT_PUBLIC_BACKEND_API_HOST
ARG BACKEND_API_HOST
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAINTENANCE_MODE=false
ARG NEXT_PUBLIC_DOWNLOAD_URL_MAC
ARG NEXT_PUBLIC_DOWNLOAD_URL_WIN
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG BUILD_SHA=inconnu
# Sans NEXT_PUBLIC_SITE_URL, l'ENV ci-dessous la pose VIDE, et le `??` de src/lib/seo.ts ne remplace
# pas une chaîne vide : l'image déclarerait une origine vide (sitemap relatif, aucune canonique
# absolue). Même refus que Takussan.
RUN test -n "$NEXT_PUBLIC_BACKEND_API_URL" || { echo "✗ NEXT_PUBLIC_BACKEND_API_URL manquant" >&2; exit 1; }
RUN test -n "$BACKEND_API_HOST" || { echo "✗ BACKEND_API_HOST manquant : la CSP bloquerait l'API" >&2; exit 1; }
RUN test -n "$NEXT_PUBLIC_SITE_URL" || { echo "✗ NEXT_PUBLIC_SITE_URL manquant" >&2; exit 1; }
ENV NEXT_PUBLIC_BACKEND_API_URL=${NEXT_PUBLIC_BACKEND_API_URL} \
    NEXT_PUBLIC_BACKEND_API_HOST=${NEXT_PUBLIC_BACKEND_API_HOST} \
    BACKEND_API_HOST=${BACKEND_API_HOST} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_MAINTENANCE_MODE=${NEXT_PUBLIC_MAINTENANCE_MODE} \
    NEXT_PUBLIC_DOWNLOAD_URL_MAC=${NEXT_PUBLIC_DOWNLOAD_URL_MAC} \
    NEXT_PUBLIC_DOWNLOAD_URL_WIN=${NEXT_PUBLIC_DOWNLOAD_URL_WIN} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    BUILD_SHA=${BUILD_SHA} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Le jeton Sentry est un SECRET de build : monté le temps d'une commande, jamais écrit dans une
# couche ni dans l'historique de l'image. Absent, withSentryConfig n'envoie rien et ne casse rien.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
```

- [ ] **Étape 4 : `web/.dockerignore`**

```gitignore
# ⚠ `.env*` EN TÊTE : web/.env.local existe sur le poste, et `next build` le lirait.
.env*
.next
node_modules
coverage
e2e
playwright-report
test-results
*.tsbuildinfo
*.md
.DS_Store
Dockerfile
.dockerignore
```

- [ ] **Étape 5 : `web/next.config.ts`**

Ajouter `output: 'standalone',` en tête de l'objet `nextConfig`, avec ce commentaire :

```ts
  // ADR-0028 de thiambara/takussan : `next build` produit `.next/standalone/server.js`, que
  // web/Dockerfile embarque seul. Sans effet sur `next dev`.
  output: 'standalone',
```

Dans `headers()`, ajouter en fin de la liste `headers` du motif `"/(.*)"` :

```ts
          // Le code servi se prouve : .github/workflows/images.yml n'est vert que lorsque l'URL
          // publique rend le commit poussé. Figé au build (argument BUILD_SHA de web/Dockerfile).
          { key: "X-Build-Sha", value: process.env.BUILD_SHA ?? "inconnu" },
```

Run: `cd web && npm run lint && npx tsc --noEmit && npm run test && cd .. && deploy/smoke-web.sh`
Expected : lint, types et Vitest verts, puis quatre `✓`.

- [ ] **Étape 6 : ablation du refus, et commit**

```bash
sed -i '' '/NEXT_PUBLIC_SITE_URL manquant/d' web/Dockerfile
deploy/smoke-web.sh; echo "code : $?"
git checkout -- web/Dockerfile
```

Expected : `l'image se construit sans NEXT_PUBLIC_SITE_URL`, code `1`.

```bash
git add web/Dockerfile web/.dockerignore web/next.config.ts deploy/smoke-web.sh
git commit -m "build(web): image autonome du front par environnement, secret de build Sentry"
```

### Tâche C3 : le workflow

**Files:**
- Create: `.github/workflows/images.yml`
- Delete: `.github/workflows/deploy.yml`, `.github/workflows/deploy-preview.yml`,
  `scripts/deploy.sh`, `scripts/deploy-prod-vps.sh`, `scripts/deploy-preview-vps.sh`,
  `scripts/server-setup.sh`, `netlify.toml`

**Interfaces:**
- Préproduction : `push` sur `preview`. Production : `workflow_dispatch` depuis `master`, avec
  l'entrée `confirmation` égale à `production` — le dépôt est privé sur le plan gratuit, les
  environnements n'y ont pas de réviseur obligatoire.
- Lit dans l'environnement GitHub du même nom : `vars.DOKPLOY_URL`, `vars.DOKPLOY_API_COMPOSE_ID`,
  `vars.DOKPLOY_WEB_APPLICATION_ID`, `vars.NEXT_PUBLIC_DOWNLOAD_URL_MAC`, `vars.NEXT_PUBLIC_DOWNLOAD_URL_WIN`,
  `vars.NEXT_PUBLIC_SENTRY_DSN`, `vars.SENTRY_ORG`, `vars.SENTRY_PROJECT` ; secrets
  `DOKPLOY_API_KEY`, `PREVIEW_BASIC_AUTH`, `SENTRY_AUTH_TOKEN`.

| Environnement | API | Site |
|---|---|---|
| `preview` | `https://preview.api.checkprintplus.com` | `https://preview.checkprintplus.com` |
| `prod` | `https://api.checkprintplus.com` | `https://checkprintplus.com` |

L'origine de production est l'**apex**, mesurée le 2026-09-13 : `https://checkprintplus.com/` et
`https://www.checkprintplus.com/` rendent tous deux `200`, et la page servie déclare
`<link rel="canonical" href="https://checkprintplus.com"/>`.

- [ ] **Étape 1 : écrire `.github/workflows/images.yml`**

Les majeures des actions Docker se relèvent comme en B4, étape 1.

```yaml
# Construit les images, les pousse sur GHCR, déclenche Dokploy, puis PROUVE ce qui est servi.
# Décision : ADR-0028 de thiambara/takussan (§2, §3, §10). Le serveur ne construit rien.
name: Images et déploiement

on:
  push:
    branches: [preview]
  workflow_dispatch:
    inputs:
      confirmation:
        description: "Pour la production (depuis master), écrire : production"
        required: false
        default: ""

concurrency:
  group: images-${{ github.ref_name }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

jobs:
  cible:
    runs-on: ubuntu-latest
    outputs:
      environnement: ${{ steps.c.outputs.environnement }}
      api_url: ${{ steps.c.outputs.api_url }}
      site_url: ${{ steps.c.outputs.site_url }}
    steps:
      - id: c
        env:
          CONFIRMATION: ${{ inputs.confirmation }}
        run: |
          case "$GITHUB_REF_NAME" in
            preview)
              { echo "environnement=preview"
                echo "api_url=https://preview.api.checkprintplus.com"
                echo "site_url=https://preview.checkprintplus.com"; } >> "$GITHUB_OUTPUT" ;;
            master)
              if [ "$GITHUB_EVENT_NAME" != workflow_dispatch ] || [ "$CONFIRMATION" != production ]; then
                echo "::error::la production ne se déploie que par workflow_dispatch avec confirmation=production"; exit 1
              fi
              { echo "environnement=prod"
                echo "api_url=https://api.checkprintplus.com"
                echo "site_url=https://checkprintplus.com"; } >> "$GITHUB_OUTPUT" ;;
            *)
              echo "::error::aucun environnement pour la branche $GITHUB_REF_NAME"; exit 1 ;;
          esac

  api:
    needs: cible
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: laravel_api
          push: true
          build-args: |
            BUILD_SHA=${{ github.sha }}
          tags: |
            ghcr.io/thiambara/check-print-plus-api:sha-${{ github.sha }}
            ghcr.io/thiambara/check-print-plus-api:${{ needs.cible.outputs.environnement }}
          cache-from: type=gha,scope=api
          cache-to: type=gha,mode=max,scope=api

  web:
    needs: cible
    runs-on: ubuntu-latest
    environment: ${{ needs.cible.outputs.environnement }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: web
          push: true
          build-args: |
            NEXT_PUBLIC_BACKEND_API_URL=${{ needs.cible.outputs.api_url }}/api/v1
            NEXT_PUBLIC_BACKEND_API_HOST=${{ needs.cible.outputs.api_url }}
            BACKEND_API_HOST=${{ needs.cible.outputs.api_url }}
            NEXT_PUBLIC_SITE_URL=${{ needs.cible.outputs.site_url }}
            NEXT_PUBLIC_DOWNLOAD_URL_MAC=${{ vars.NEXT_PUBLIC_DOWNLOAD_URL_MAC }}
            NEXT_PUBLIC_DOWNLOAD_URL_WIN=${{ vars.NEXT_PUBLIC_DOWNLOAD_URL_WIN }}
            NEXT_PUBLIC_SENTRY_DSN=${{ vars.NEXT_PUBLIC_SENTRY_DSN }}
            SENTRY_ORG=${{ vars.SENTRY_ORG }}
            SENTRY_PROJECT=${{ vars.SENTRY_PROJECT }}
            BUILD_SHA=${{ github.sha }}
          secrets: |
            sentry_auth_token=${{ secrets.SENTRY_AUTH_TOKEN }}
          tags: |
            ghcr.io/thiambara/check-print-plus-web:${{ needs.cible.outputs.environnement }}-sha-${{ github.sha }}
            ghcr.io/thiambara/check-print-plus-web:${{ needs.cible.outputs.environnement }}
          cache-from: type=gha,scope=web-${{ needs.cible.outputs.environnement }}
          cache-to: type=gha,mode=max,scope=web-${{ needs.cible.outputs.environnement }}

  deploy:
    needs: [cible, api, web]
    runs-on: ubuntu-latest
    environment: ${{ needs.cible.outputs.environnement }}
    steps:
      - name: Déclencher Dokploy
        id: declencher
        env:
          DOKPLOY_URL: ${{ vars.DOKPLOY_URL }}
          COMPOSE_ID: ${{ vars.DOKPLOY_API_COMPOSE_ID }}
          WEB_ID: ${{ vars.DOKPLOY_WEB_APPLICATION_ID }}
          DOKPLOY_API_KEY: ${{ secrets.DOKPLOY_API_KEY }}
        run: |
          if [ -z "$DOKPLOY_URL" ] || [ -z "$COMPOSE_ID" ] || [ -z "$WEB_ID" ] || [ -z "$DOKPLOY_API_KEY" ]; then
            echo "::notice::Dokploy n'est pas raccordé à « ${{ needs.cible.outputs.environnement }} » : images poussées, rien déployé."
            echo "raccorde=non" >> "$GITHUB_OUTPUT"; exit 0
          fi
          appeler() {
            curl -fsS -X POST "$DOKPLOY_URL/api/$1" -H "x-api-key: $DOKPLOY_API_KEY" \
              -H 'Content-Type: application/json' -d "$2" >/dev/null
          }
          appeler compose.deploy "{\"composeId\":\"$COMPOSE_ID\"}"
          appeler application.deploy "{\"applicationId\":\"$WEB_ID\"}"
          echo "raccorde=oui" >> "$GITHUB_OUTPUT"

      - name: Prouver ce qui est servi
        if: steps.declencher.outputs.raccorde == 'oui'
        env:
          API_URL: ${{ needs.cible.outputs.api_url }}
          SITE_URL: ${{ needs.cible.outputs.site_url }}
          BASIC_AUTH: ${{ secrets.PREVIEW_BASIC_AUTH }}
        run: |
          attendre() {
            local url=$1 sha=""
            shift
            for _ in $(seq "${ESSAIS:-60}"); do
              sha=$(curl -sS -o /dev/null -D - "$@" "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-build-sha"{print $2}')
              if [ "$sha" = "$GITHUB_SHA" ]; then echo "✓ $url sert $GITHUB_SHA"; return 0; fi
              sleep 10
            done
            echo "::error::$url sert « ${sha:-rien} » au lieu de $GITHUB_SHA"
            return 1
          }
          attendre "$API_URL/up"
          if [ -n "$BASIC_AUTH" ]; then attendre "$SITE_URL/robots.txt" -u "$BASIC_AUTH"; else attendre "$SITE_URL/robots.txt"; fi
```

`actions/checkout@v4` est la majeure de tous les workflows de ce dépôt, mesurée le 2026-09-13
(`grep -n 'uses: actions/' .github/workflows/*.yml`) : on s'y aligne.

- [ ] **Étape 2 : valider, jouer la preuve en local, retirer l'ancienne chaîne**

```bash
actionlint .github/workflows/images.yml
for f in .github/workflows/deploy.yml .github/workflows/deploy-preview.yml scripts/deploy.sh \
         scripts/deploy-prod-vps.sh scripts/deploy-preview-vps.sh scripts/server-setup.sh netlify.toml; do
  echo "=== $f"; sed -n '1,8p' "$f"
done
git rm .github/workflows/deploy.yml .github/workflows/deploy-preview.yml scripts/deploy.sh \
       scripts/deploy-prod-vps.sh scripts/deploy-preview-vps.sh scripts/server-setup.sh netlify.toml
grep -rnE 'deploy(-prod-vps|-preview-vps)?\.sh|server-setup\.sh|netlify' --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git .
```

La preuve se joue en local comme en B4, étape 3, contre `deploy/smoke-web.sh` démarré. Chaque ligne
restante du dernier `grep` est corrigée en C4 ou relevée comme historique.

- [ ] **Étape 3 : commit**

```bash
git add .github/workflows/images.yml
git commit -m "ci: images sur GHCR, déploiement Dokploy prouvé par X-Build-Sha ; retrait des scripts VPS"
```

### Tâche C4 : la documentation de CheckPrint Plus

**Files:**
- Create: `docs/hebergement.md`
- Modify: `laravel_api/database/seeders/ProductionSeeder.php` (docblock), `CLAUDE.md` et
  `README.md` s'ils décrivent l'ancienne chaîne (le `grep` de C3, étape 2, les nomme)

- [ ] **Étape 1 : `docs/hebergement.md`**

```markdown
# Hébergement de CheckPrint Plus

La décision et le plan vivent dans le dépôt public `thiambara/takussan`, parce que le serveur est
partagé :
- ADR-0028 : https://github.com/thiambara/takussan/blob/dev/docs/adr/0028-auto-hebergement-conteneurise-sur-le-vps.md
- Plan : https://github.com/thiambara/takussan/blob/dev/docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md
- Le relevé du serveur (Dokploy, bases, sauvegardes) : `docs/infra/hebergement.md` du même dépôt.

## Ce que ce dépôt porte

| Fichier | Rôle |
|---|---|
| `laravel_api/Dockerfile`, `laravel_api/docker/` | image de l'API, du worker et du planificateur |
| `deploy/compose.api.yml` | la pile d'API d'un environnement, déployée par Dokploy |
| `web/Dockerfile` | image du front, une par environnement |
| `.github/workflows/images.yml` | préproduction sur `preview` ; production par `workflow_dispatch` + `confirmation=production` |
| `deploy/smoke-api.sh`, `deploy/smoke-web.sh` | tests de fumée locaux |

## Première mise en service d'une base

`ProductionSeeder` (rôles, plans, banques, modèles) se joue **une fois**, à la main, jamais à chaque
déploiement — il écraserait ce qu'un administrateur a modifié :

    docker compose -p <projet> -f deploy/compose.api.yml run --rm --entrypoint php release artisan db:seed --class=ProductionSeeder --force

⚠ L'application de bureau a `https://api.checkprintplus.com` dans son code
(`flutter_app/lib/core/config/env_config.dart`) : ce nom d'hôte ne change jamais.
```

- [ ] **Étape 2 : le docblock de `ProductionSeeder`**

Remplacer `Prefer using: php artisan db:seed-production --admin-password=xxx` par :

```php
     * Run once per database: php artisan db:seed --class=ProductionSeeder --force
     * (there is no `db:seed-production` command — measured 2026-09-13).
```

- [ ] **Étape 3 : commit**

```bash
git add docs/hebergement.md laravel_api/database/seeders/ProductionSeeder.php CLAUDE.md README.md
git commit -m "docs: hébergement conteneurisé, renvoi vers l'ADR-0028 de takussan"
```

---

## Phase D — raccorder les préproductions

Prérequis : A5 terminé ; B1 à B6 fusionnés sur `dev` puis sur `preview` ; C1 à C4 de même dans
leur dépôt. Chaque tâche de D se termine par une **mesure** reportée dans le ticket D, avec sa date.

### Tâche D1 : déclarer la pile Takussan dans Dokploy

**Files:** aucun fichier du dépôt ; les clés vont au relevé (`docs/infra/hebergement.md`).

- [ ] **Étape 1 : le Compose de l'API**

Dokploy, projet **Takussan** → *Create Service → Compose* `takussan-api-preview` : fournisseur
*Git*, dépôt `https://github.com/thiambara/takussan.git`, branche `preview`, chemin
`deploy/takussan/compose.api.yml`, **Autodeploy désactivé** (c'est le workflow qui déclenche, une
fois les images poussées). Onglet *Domains* : service `api`, port `8080`, hôte
`preview.api.takussan.com`, HTTPS, Let's Encrypt.

- [ ] **Étape 2 : son environnement**

Onglet *Environment*. La colonne « valeur » donne la valeur à écrire, ou d'où la tirer ; aucun secret
ne s'écrit ailleurs que dans cet onglet et le gestionnaire de mots de passe.

| Clé | Valeur |
|---|---|
| `IMAGE_TAG` | `preview` |
| `APP_NAME`, `APP_ENV`, `APP_LOCALE`, `APP_FALLBACK_LOCALE`, `SESSION_DOMAIN`, `SCOUT_QUEUE`, `MAIL_*`, `SMS_*`, `WHATSAPP_*`, `GOOGLE_*`, `FACEBOOK_*`, `APPLE_*`, `CDN_*`, `BUNNY_*`, `CLOUDFLARE_*` | reprises du `.env` de préproduction exporté en A1 — c'est une valeur **relevée**, pas choisie |
| `APP_KEY` | neuve : `echo "base64:$(openssl rand -base64 32)"` (la base repart à blanc, rien n'est chiffré avec l'ancienne) |
| `APP_DEBUG` | `false` |
| `APP_URL` | `https://preview.api.takussan.com` |
| `FRONTEND_URL` | `https://preview.takussan.com` |
| `SANCTUM_STATEFUL_DOMAINS` | `preview.takussan.com` |
| `TRUSTED_PROXIES` | le sous-réseau de `dokploy-network` relevé en A3, puis les plages Cloudflare relevées en A3, séparés par des virgules |
| `DB_CONNECTION` / `DB_HOST` / `DB_PORT` | `pgsql` / hôte interne du service `postgres` (A4) / `5432` |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | `takussan_preview` / `takussan_preview` / le mot de passe d'A4, étape 8 |
| `SESSION_DRIVER` / `CACHE_STORE` / `QUEUE_CONNECTION` | les valeurs de `docs/infra/prod-drivers.json` pour la préproduction |
| `REDIS_CLIENT` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `phpredis` / `redis-takussan` / `6379` / `REDIS_TAKUSSAN_PASSWORD` d'A4 |
| `REDIS_DB` / `REDIS_CACHE_DB` | `0` / `1` (la production prendra `2` / `3`) |
| `SCOUT_DRIVER` / `SCOUT_PREFIX` | `meilisearch` / `preview_` |
| `MEILISEARCH_HOST` / `MEILISEARCH_KEY` | `http://meilisearch:7700` / la clé `preview_*` d'A4, étape 6 — **jamais la clé maîtresse** |
| `LOG_CHANNEL` / `LOG_LEVEL` | `stderr` / `info` — les journaux vont dans Dokploy, pas dans un volume |
| `FILESYSTEM_DISK` / `LARAVEL_PDF_DRIVER` | `local` / `dompdf` |

Toute clé de `takussan-api/.env.example` absente de ce tableau et de l'export garde le défaut de
`config/`. Les **clés** du tableau vont dans le relevé ; les valeurs, non.

- [ ] **Étape 3 : l'Application du front**

*Create Service → Application* `takussan-web-preview` : fournisseur *Docker*, image
`ghcr.io/thiambara/takussan-web:preview`, registre `ghcr.io` (A3). Port `3000`. *Domains* :
`preview.takussan.com`, HTTPS, Let's Encrypt. *Advanced → Security* : un utilisateur d'authentification
basique (le SSO de Vercel ne suit pas, ADR-0028) ; `utilisateur:motdepasse` au gestionnaire de mots
de passe, il devient le secret `PREVIEW_BASIC_AUTH` en D3.

Aucune variable d'environnement : tout ce que le front lit est inliné dans l'image.

### Tâche D2 : basculer le DNS des préproductions Takussan

- [ ] **Étape 1 : relever, puis changer**

```bash
dig +short preview.takussan.com; dig +short preview.api.takussan.com
```

Noter les réponses (CNAME Vercel ; `178.18.247.62`). Puis, chez Cloudflare :
- `preview.takussan.com` : le CNAME Vercel devient **A `178.18.247.62`, proxifié** ;
- `preview.api.takussan.com` : **A `178.18.247.62`, DNS seul** — il l'est déjà ; le laisser tel quel
  (ADR-0028 §8 : le certificat gratuit ne couvre pas un second niveau).

- [ ] **Étape 2 : mesurer**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://preview.takussan.com/fr
curl -sS -o /dev/null -w '%{http_code}\n' -u "$PREVIEW_BASIC_AUTH" https://preview.takussan.com/fr
curl -sS -o /dev/null -D - https://preview.takussan.com/fr | grep -iE '^(server|cf-ray|x-vercel-id)'
```

Expected : `401`, puis `200` (ou `502` si aucune image n'est encore déployée — D3 y remédie) ; un
`cf-ray` et **aucun** `x-vercel-id`. Un `526` signifie que Cloudflare refuse le certificat d'origine :
relire A3, étape 4.

### Tâche D3 : raccorder GitHub à Dokploy, et observer le premier déploiement

- [ ] **Étape 1 : l'environnement GitHub `preview`**

```bash
projets=$(curl -fsS -H "x-api-key: $DOKPLOY_API_KEY" https://deploy.takussan.com/api/project.all)
id_de() { jq -r --arg n "$1" --arg k "$2" '[.. | objects | select(.name? == $n) | .[$k] // empty][0] // empty' <<<"$projets"; }
COMPOSE_ID=$(id_de takussan-api-preview composeId)
WEB_ID=$(id_de takussan-web-preview applicationId)
[ -n "$COMPOSE_ID" ] && [ -n "$WEB_ID" ] || { echo "✗ service introuvable dans project.all : relire les noms de D1"; }
gh api -X PUT repos/thiambara/takussan/environments/preview >/dev/null
gh variable set DOKPLOY_URL --env preview --body https://deploy.takussan.com -R thiambara/takussan
gh variable set DOKPLOY_API_COMPOSE_ID --env preview --body "$COMPOSE_ID" -R thiambara/takussan
gh variable set DOKPLOY_WEB_APPLICATION_ID --env preview --body "$WEB_ID" -R thiambara/takussan
gh secret set DOKPLOY_API_KEY --env preview -R thiambara/takussan        # colle la clé d'A3, étape 10
gh secret set PREVIEW_BASIC_AUTH --env preview -R thiambara/takussan     # utilisateur:motdepasse de D1
```

Les identifiants sont **lus** dans la réponse de Dokploy, jamais recopiés d'un autre environnement :
`id_de` renvoie vide plutôt que le premier identifiant venu, et la ligne suivante le dit.

- [ ] **Étape 2 : déclencher, et lire le résultat**

```bash
gh workflow run images.yml --ref preview -R thiambara/takussan
gh run watch -R thiambara/takussan "$(gh run list --workflow=images.yml -L 1 --json databaseId -q '.[0].databaseId' -R thiambara/takussan)"
```

Expected : les quatre jobs verts, et dans le journal du job `deploy` :
`✓ https://preview.api.takussan.com/up sert <commit>` puis `✓ https://preview.takussan.com/robots.txt sert <commit>`.
**C'est le premier déclenchement réel du workflow, et c'est lui qui clôt B4** (ADR-0017,
conséquence 5 : on ne coche pas sur une lecture).

### Tâche D4 : remplir la préproduction Takussan

- [ ] **Étape 1 : relever où Dokploy range le Compose**

```bash
ssh root@178.18.247.62 'find /etc/dokploy/compose -name compose.api.yml -path "*takussan*"; docker compose ls'
```

Noter le répertoire et le nom de projet Compose : ils vont au relevé (runbook « seed »).

- [ ] **Étape 2 : le seed**

```bash
ssh root@178.18.247.62
cd <répertoire relevé>
docker compose -p <projet relevé> -f compose.api.yml --profile seed run --rm seed
```

Expected : ~260 s (CLAUDE.md), puis les importations Meilisearch ; sortie en `0`. Le seed refuse de
tourner si `DB_DATABASE` ne finit pas par `_preview` : c'est voulu.

### Tâche D5 : ce que la préproduction Takussan fait vraiment — mesuré

Chaque ligne se mesure, se date, et va dans le ticket D. Les conteneurs se nomment
`<projet relevé>-<service>-1`.

- [ ] **Étape 1 : servi, et prouvé**

```bash
curl -sS -D - -o /dev/null https://preview.api.takussan.com/up | tr -d '\r' | grep -iE '^(HTTP|x-build-sha)'
echo | openssl s_client -connect preview.api.takussan.com:443 -servername preview.api.takussan.com 2>/dev/null | openssl x509 -noout -issuer
```

Expected : `HTTP/2 200`, le commit de `preview` ; un émetteur Let's Encrypt.

- [ ] **Étape 2 : les quatre files sont consommées, le planificateur tourne**

```bash
API=<projet relevé>-api-1
for q in default notifications-urgent media reconciliation; do
  docker exec "$API" php artisan tinker --execute "Illuminate\Support\Facades\Artisan::queue('inspire')->onQueue('$q');"
done
sleep 20
docker exec "$API" php artisan tinker --execute 'echo DB::table("jobs")->count(), " ", DB::table("failed_jobs")->count();'
docker logs --since 1m <projet relevé>-worker-1 | grep inspire; docker logs --since 1m <projet relevé>-worker-media-1 | grep inspire
docker logs --since 6m <projet relevé>-scheduler-1 | grep -v 'No scheduled' | tail -5
```

Expected : `0 0` ; quatre `inspire … DONE` (deux par worker) ; des lignes `Running … DONE` du
planificateur de moins de six minutes (ses tâches les plus fréquentes sont à cinq). ⚠ Pas de
`dispatch(fn () => …)` : une closure née d'un `tinker --execute` ne se sérialise pas
(`Failed to serialize job … eval()'d code`), rien n'est poussé, et `jobs` → `0` fait croire à une
file consommée.

- [ ] **Étape 3 : la recherche, et l'isolation de sa clé**

```bash
docker exec "$API" php artisan tinker --execute 'echo App\Models\Property::search("maison")->take(5)->get()->count();'
docker exec "$API" php artisan tinker --execute 'echo str_starts_with(config("scout.prefix"), "preview_") ? "préfixe ok" : "PRÉFIXE FAUX";'
```

Expected : un entier non nul ; `préfixe ok`. L'isolation de la clé a été prouvée en A4, étape 6 ;
la relancer ici avec la clé **lue dans l'environnement du conteneur** :

```bash
K=$(docker exec "$API" printenv MEILISEARCH_KEY)
docker run --rm --network dokploy-network curlimages/curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $K" http://meilisearch:7700/indexes/prod_properties
```

Expected : `403`.

- [ ] **Étape 4 : l'IP du client arrive jusqu'à Laravel — par ablation**

Les webhooks SMS refusent toute IP hors de leur liste (`RestrictIpMiddleware`, `abort(403, 'Source IP
not allowed')`) : c'est la sonde. Dans l'environnement Dokploy, poser
`SMS_ORANGE_WEBHOOK_IPS=<IP publique du poste>` (`curl -s https://api.ipify.org`), redéployer, puis :

```bash
curl -sS -X POST https://preview.api.takussan.com/api/webhooks/sms/orange/status/sonde
```

Expected : une réponse **qui n'est pas** `Source IP not allowed` (le jeton `sonde` est faux : un
refus du contrôleur est attendu, pas celui du filtre d'IP). Puis poser
`SMS_ORANGE_WEBHOOK_IPS=203.0.113.7`, redéployer, et rejouer deux fois :

```bash
curl -sS -X POST https://preview.api.takussan.com/api/webhooks/sms/orange/status/sonde
curl -sS -X POST -H 'X-Forwarded-For: 203.0.113.7' https://preview.api.takussan.com/api/webhooks/sms/orange/status/sonde
```

Expected : **les deux** en `403` et `Source IP not allowed`. Le second est l'essentiel : le client
écrit lui-même l'IP autorisée dans `X-Forwarded-For`, et elle doit être ignorée. S'il passe, l'IP du
client se lit dans un en-tête qu'il contrôle, et toute liste d'IP est contournable — relire le
Caddyfile (aucun `trusted_proxies`) et `forwardedHeaders` de Traefik (A3, étape 8) avant d'aller plus
loin. Enfin remettre la valeur de l'export A1.

Ce passage prouve la chaîne Traefik → Caddy → Laravel sur un hôte **en DNS seul**. La chaîne par
Cloudflare se prouve de la même façon en F3, sur `api.takussan.com`, qui sera proxifié.

- [ ] **Étape 5 : les règles reprises de nginx, en vrai**

```bash
docker exec "$API" sh -c 'echo sonde > /app/storage/app/public/sonde.txt'
curl -sS -D - -o /dev/null https://preview.api.takussan.com/storage/sonde.txt | grep -i cache-control
curl -sS -o /dev/null -w '%{http_code}\n' https://preview.api.takussan.com/.htaccess
head -c $((26 * 1024 * 1024)) /dev/zero | curl -sS -o /dev/null -w '%{http_code}\n' --data-binary @- https://preview.api.takussan.com/up
docker exec "$API" rm /app/storage/app/public/sonde.txt
```

Expected : `public, max-age=604800, stale-while-revalidate=86400` ; `404` ; `413`.

### Tâche D6 : sauvegarder les volumes, restaurer à blanc, mesurer le budget

- [ ] **Étape 1 : les sauvegardes de volumes**

Compose `takussan-api-preview` → *Volume Backups* : le volume `<projet>_storage`, destination R2,
préfixe `volumes/takussan-preview/`, `0 4 * * *`, 7 exemplaires. Lancer une sauvegarde manuelle.

- [ ] **Étape 2 : restaurer PostgreSQL à blanc, et compter**

**Arrêter d'abord la préproduction** (hors base) : `api`, workers et planificateur écrivent
(`jobs`, `scheduled_task_runs`) entre la sauvegarde et le comptage — mesuré le 2026-09-14, voir les
écarts. Puis lancer une sauvegarde manuelle de `takussan_preview` (A5), attendre qu'elle apparaisse
dans R2, la télécharger sur le poste, puis :

```bash
docker run -d --name restauration -e POSTGRES_PASSWORD=x pgvector/pgvector:pg17 && sleep 5
docker cp <fichier téléchargé> restauration:/tmp/sauvegarde.gz
docker exec restauration createdb -U postgres --encoding=UTF8 --locale=C -T template0 r
# Le format se lit APRÈS décompression : Dokploy écrit `pg_dump -Fc | gzip`, un `.sql.gz` qui contient
# une archive custom (`PGDMP`). `gunzip | psql` n'en charge RIEN, sans ligne ERROR (mesuré : 0 table).
docker exec restauration sh -c 'gunzip -c /tmp/sauvegarde.gz > /tmp/s; if [ "$(head -c5 /tmp/s)" = PGDMP ]; then pg_restore -U postgres -d r --no-owner --no-acl /tmp/s; else psql -q -U postgres -d r < /tmp/s; fi'
COMPTE="SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')))[1]::text AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"
docker exec restauration psql -U postgres -d r -At -c "$COMPTE" > /tmp/copie.txt
ssh root@178.18.247.62 "docker exec \$(docker ps -q -f ancestor=pgvector/pgvector:pg17 | head -1) psql -U pgadmin -d takussan_preview -At -c \"$COMPTE\"" > /tmp/original.txt
diff /tmp/original.txt /tmp/copie.txt && echo "✓ restauration identique, $(wc -l < /tmp/copie.txt) tables"
docker rm -f restauration
```

Expected : `✓ restauration identique, N tables` — aucune écriture n'a lieu sur une préproduction au
repos entre la sauvegarde et le comptage ; si `diff` montre un écart, le noter et recommencer
préproduction arrêtée. **Ce diff vide est la condition de la mise en production** (ADR-0028 §7).

- [ ] **Étape 3 : restaurer le volume de médias à blanc**

Depuis Dokploy, restaurer la dernière sauvegarde du volume vers un volume **neuf**
`restauration_storage` — ou, comme le 2026-09-14 (l'API de la v0.30.6 n'a pas de route de
restauration), lire l'archive dans R2 **depuis le serveur** et l'extraire : `docker run --rm -v
restauration_storage:/v -v <archive>.tar:/b.tar:ro alpine tar -xf /b.tar -C /v` (entrées `./…`). Puis :

```bash
ssh root@178.18.247.62
docker run --rm -v <projet>_storage:/a -v restauration_storage:/b alpine sh -c 'cd /a && find . -type f | sort | xargs sha256sum > /tmp/a; cd /b && find . -type f | sort | xargs sha256sum > /tmp/b; diff /tmp/a /tmp/b && echo "✓ volume identique"'
docker volume rm restauration_storage
```

- [ ] **Étape 4 : le budget, mesuré**

```bash
ssh root@178.18.247.62 'docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"; awk "/MemAvailable/{print int(\$2/1024) \" Mo disponibles\"}" /proc/meminfo; vmstat 5 12 | tail -12; df -h /'
```

Remplacer la colonne « attendu » du budget, dans ce plan et dans le relevé, par les mesures datées.
Expected : mémoire disponible ≥ 1 500 Mo, `st` < 10 en moyenne, disque < 75 %. Un seuil franchi dès
les préproductions est une information pour F, à écrire dans le ticket F.

### Tâche D7 : CheckPrint Plus

Mêmes gestes que D1 à D6, pour le dépôt privé. Seules les différences sont écrites ici ; chaque étape
de D1 à D6 se rejoue avec elles.

- [ ] **Étape 1 : l'accès de Dokploy au dépôt privé**

Dokploy → *Settings → SSH Keys* : générer une clé. Sa **partie publique** devient une *deploy key* en
lecture seule du dépôt : `gh repo deploy-key add <fichier .pub> -R thiambara/check-print-plus -t dokploy`.
Le Compose se déclare avec le fournisseur *Git*, `git@github.com:thiambara/check-print-plus.git`, et
cette clé.

- [ ] **Étape 2 : les services**

| | Valeur |
|---|---|
| Compose | `cpp-api-preview`, branche `preview`, chemin `deploy/compose.api.yml`, domaine `preview.api.checkprintplus.com` → `api:8080` |
| Application | `cpp-web-preview`, image `ghcr.io/thiambara/check-print-plus-web:preview`, domaine `preview.checkprintplus.com`, authentification basique |
| `IMAGE_TAG` | `preview` |
| `DB_CONNECTION` / `DB_HOST` / `DB_PORT` | `mysql` / hôte interne du service `mysql` (A4) / `3306` |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | `checkprintplus_preview` / `checkprintplus_preview` / le mot de passe d'A4, étape 10 |
| `REDIS_HOST` / `REDIS_PASSWORD` / `REDIS_DB` / `REDIS_CACHE_DB` | `redis-cpp` / `REDIS_CPP_PASSWORD` d'A4 / `0` / `1` |
| `QUEUE_CONNECTION` / `CACHE_STORE` / `SESSION_DRIVER` | `redis` / `redis` / `database` |
| `APP_URL` / `FRONTEND_URL` | `https://preview.api.checkprintplus.com` / `https://preview.checkprintplus.com` |
| `TRUSTED_PROXIES` | comme Takussan (D1) — **jamais `*`**, que `bootstrap/app.php` accepte pourtant |
| `TELESCOPE_ENABLED` | `false` |
| `LOG_CHANNEL` | `stderr` |
| `APP_KEY`, `LEMON_SQUEEZY_*`, `RESEND_API_KEY`, `GOOGLE_*`, `LICENSE_*`, `MAIL_*`, `SESSION_SECURE_COOKIE` | reprises de l'export A1 (`APP_KEY` : neuve, la base repart à blanc) |

- [ ] **Étape 3 : DNS, GitHub, premier déploiement**

DNS : `preview.checkprintplus.com` → A `178.18.247.62` **proxifié** ; `preview.api.checkprintplus.com`
→ A `178.18.247.62` **DNS seul**. Environnement GitHub `preview` du dépôt `thiambara/check-print-plus`,
avec les variables et secrets de C3 (identifiants lus par `project.all` comme en D3). Puis
`gh workflow run images.yml --ref preview -R thiambara/check-print-plus` et `gh run watch`.

Expected : les deux lignes `✓ … sert <commit>` du job `deploy`.

- [ ] **Étape 4 : les données essentielles, une fois**

```bash
ssh root@178.18.247.62
docker compose ls   # relever le projet de cpp-api-preview
docker exec <projet>-api-1 php artisan db:seed --class=ProductionSeeder --force
docker exec <projet>-api-1 php artisan tinker --execute 'echo DB::table("plans")->count();'
```

Expected : **plus** de plans qu'avant le seeder, et des `roles`, `banks` et `templates` non vides.
⚠ « Un nombre de plans non nul » ne suffit pas : la migration `seed_free_plan` en insère déjà un, et
ce critère serait coché sans que le seeder ait tourné (relevé le 2026-09-14 : 1 → 4).

- [ ] **Étape 5 : les mesures de D5 et D6, pour CheckPrint Plus**

`/up` et `X-Build-Sha` ; la file `default` consommée (`Queue::size("default")` à `0` après une
sonde) ; `Cache-Control: max-age=604800` sur `/storage/…`.

**L'IP du client, par les compteurs de débit.** CheckPrint Plus n'a pas de liste d'IP à basculer,
mais `GET /api/v1/public/countries` est sous `throttle:60,1`, indexé sur `Request::ip()` pour un
client anonyme. Deux clients d'IP différentes doivent voir **deux** compteurs ; un client qui usurpe
`X-Forwarded-For` doit rester sur **le sien**. Les routes de licence ne servent pas de sonde :
`desktop.signed` refuse une requête non signée avant que `throttle:license-ip` ne la compte.

```bash
U=https://preview.api.checkprintplus.com/api/v1/public/countries
reste() { curl -sS -o /dev/null -D - "$@" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-ratelimit-remaining"{print $2}'; }
sleep 61                                              # fenêtre vierge
a=$(reste "$U")                                       # le poste
s=$(ssh root@178.18.247.62 "curl -sS -o /dev/null -D - '$U' | tr -d '\r' | awk -F': ' 'tolower(\$1)==\"x-ratelimit-remaining\"{print \$2}'")
b=$(reste -H 'X-Forwarded-For: 198.51.100.9' "$U")    # le poste, qui se prétend un autre
echo "poste=$a serveur=$s poste-usurpant=$b"
```

Expected : `poste=59 serveur=59 poste-usurpant=58`. Un `serveur=58` signifie que tous les clients
partagent un compteur (Laravel voit l'IP de Traefik) ; un `poste-usurpant=59`, que l'en-tête du client
est cru. Les deux sont bloquants.

Restauration à blanc de `checkprintplus_preview`, comptes exacts :

```bash
docker exec -e MYSQL_PWD="$ROOT" <conteneur mysql> mysql -uroot -N -e \
  "SELECT CONCAT('SELECT ''', table_name, ''', COUNT(*) FROM \`', table_name, '\`;') FROM information_schema.tables WHERE table_schema = 'checkprintplus_preview' ORDER BY table_name" \
  | docker exec -i -e MYSQL_PWD="$ROOT" <conteneur mysql> mysql -uroot -N checkprintplus_preview > /tmp/original.txt
```

La même commande contre un `mysql:8.4` jetable où la sauvegarde R2 a été rechargée produit
`/tmp/copie.txt` ; `diff` doit être vide. (`information_schema.TABLES.TABLE_ROWS` est une estimation
sous InnoDB : on ne compte pas avec.)

### Tâche D8 : surveiller, puis couper les ponts avec l'ancienne chaîne

- [ ] **Étape 1 : une surveillance qui ne vit pas sur le serveur**

Un service externe gratuit (UptimeRobot ou Better Stack) sonde toutes les 5 minutes :
`https://preview.api.takussan.com/up`, `https://preview.api.checkprintplus.com/up`,
`https://deploy.takussan.com/`. Alerte par courriel. *Une surveillance hébergée sur la machine
qu'elle surveille se tait exactement quand on a besoin d'elle.*

- [ ] **Étape 2 : supprimer les secrets de l'ancienne chaîne**

```bash
for depot in thiambara/takussan thiambara/check-print-plus; do
  gh secret list -R "$depot"
  for s in CONTABO_HOST CONTABO_SSH_KEY CONTABO_USER ENV_FILE ENV_FILE_PREVIEW REPO_URL; do
    gh secret delete "$s" -R "$depot"
  done
  gh secret list -R "$depot"
done
```

Expected : les six noms disparaissent de la seconde liste, dans les deux dépôts. Aucun workflow ne les
lit plus depuis B4 et C3.

- [ ] **Étape 3 : refermer les tickets**

TCK-288 passe `done`, avec une note qui renvoie à ADR-0028 et aux mesures de D5 (TCK-333 attend
E1) ; le ticket D passe `done` quand D1 à D8 sont cochés. `node docs/backlog/gen-index.mjs && node docs/backlog/check-backlog.mjs`.

---

## Phase E — Vercel quitte les préproductions

### Tâche E1 : plus aucun build Vercel hors de la production

**Files:**
- Create: `takussan-web/vercel.json` ; dans `thiambara/check-print-plus` : `web/vercel.json`
- Modify: `docs/infra/frontend-deploiement.json`, `docs/infra/frontend-deploiement.md`

ADR-0017 refusait un `vercel.json` « sans besoin » : le besoin existe désormais, et il est mesuré —
l'intégration reconstruit le front à chaque commit de chaque branche (TCK-333), alors que les
préproductions ne sont plus servies par Vercel. Ce fichier vit jusqu'à F5, où il part avec les
projets Vercel.

- [ ] **Étape 1 : `takussan-web/vercel.json` et `web/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"master\" ]"
}
```

La commande sort en `0` — build **ignoré** — sur toute branche autre que `master`, et en `1` —
build lancé — sur `master`. C'est le sens inverse de l'intuition, et c'est celui de Vercel.

- [ ] **Étape 2 : retirer les domaines de préproduction des projets Vercel**

Tableau de bord Vercel, projet de chaque front → *Settings → Domains* : retirer
`preview.takussan.com` et `preview.checkprintplus.com`. Ils ne résolvent plus vers Vercel depuis D2
et D7.

- [ ] **Étape 3 : mesurer**

Après la fusion de l'étape 1 sur `dev` (sur demande du porteur), pousser un commit de documentation
seule sur `dev`, puis :

```bash
gh api "repos/thiambara/takussan/deployments?per_page=3" -q '.[] | [.id, .environment, .ref, .created_at] | @tsv'
gh api "repos/thiambara/takussan/deployments/<id le plus récent>/statuses" -q '.[0].state'
```

Expected : le déploiement de ce commit n'aboutit pas à un build (état relevé tel que Vercel le
publie : `inactive`, `failure` ou absence de déploiement — **on écrit ce qu'on lit**).

- [ ] **Étape 4 : le relevé suit la mesure**

Dans `frontend-deploiement.json`, les branches `dev` et `preview` passent à « builds ignorés par
`ignoreCommand` (ADR-0028, E1) », avec la mesure de l'étape 3 et sa date, et `preview.takussan.com`
quitte `domaines`. Lancer la garde : `gh workflow run front-deploy-map.yml` puis `gh run watch`.
Expected : verte sur le relevé mis à jour. TCK-333 passe `done`.

- [ ] **Étape 5 : commit**

```bash
git add takussan-web/vercel.json docs/infra/frontend-deploiement.json docs/infra/frontend-deploiement.md
git commit -m "build(web): Vercel ne construit plus que master ; les préproductions sont sur Dokploy (TCK-333, ADR-0028)"
```

---

## Phase F — la production

**Ne s'ouvre que sur la décision du porteur** (pas avant trois mois selon lui, au 2026-09-13). Chaque
fusion vers `master` et chaque bascule DNS de cette phase est une **action sortante** : elle se fait
sur sa demande explicite, au moment où il la donne.

### Tâche F1 : re-mesurer, puis préparer les données de production

- [ ] **Étape 1 : les prémisses ont-elles bougé ?**

```bash
curl -sS -o /dev/null -D - https://www.takussan.com/ | grep -iE '^(x-vercel-id|server)'
curl -sS -o /dev/null -w '%{http_code}\n' https://api.takussan.com/up
dig +short www.takussan.com; dig +short takussan.com; dig +short www.checkprintplus.com; dig +short checkprintplus.com
curl -sS -L https://www.checkprintplus.com/ | grep -oE '<link rel="canonical"[^>]*>'
ssh root@178.18.247.62 'awk "/MemAvailable/{print int(\$2/1024)}" /proc/meminfo; df -h / | tail -1'
```

Noter chaque réponse **dans le ticket F**, avec la date : les enregistrements DNS actuels sont le
chemin de retour arrière de F3 et F4. Si le `canonical` de CheckPrint Plus a changé, l'origine de C3
change avec lui. Si la mémoire disponible est déjà sous 1 500 Mo avec les seules préproductions,
**s'arrêter** : le premier geste de montée en charge (ADR-0028) passe avant la production. La
restauration à blanc de D6 doit être cochée ; sinon, s'arrêter aussi.

- [ ] **Étape 2 : la base PostgreSQL de production, et son étanchéité**

```bash
PG=$(docker ps -q -f ancestor=pgvector/pgvector:pg17 | head -1)
read -rs MDP
docker exec -i "$PG" psql -U pgadmin -d postgres -v ON_ERROR_STOP=1 -v mdp="$MDP" <<'SQL'
CREATE ROLE takussan_prod LOGIN PASSWORD :'mdp';
CREATE DATABASE takussan_prod OWNER takussan_prod ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0;
REVOKE CONNECT ON DATABASE takussan_prod FROM PUBLIC;
GRANT CONNECT ON DATABASE takussan_prod TO takussan_prod;
SQL
read -rs MDP_PREVIEW
docker exec -e PGPASSWORD="$MDP_PREVIEW" "$PG" psql -h 127.0.0.1 -U takussan_preview -d takussan_prod -c 'SELECT 1'
docker exec -i "$PG" psql -U pgadmin -d postgres -At -c "SELECT datname, datcollate, datctype FROM pg_database WHERE datname = 'takussan_prod'"
```

Expected : `permission denied for database "takussan_prod"` pour le rôle de préproduction — c'est la
preuve que la préproduction ne peut pas écrire en production —, puis `takussan_prod|C|C`.

- [ ] **Étape 3 : la base MySQL de production**

Même geste qu'A4, étape 10, avec `checkprintplus_prod`. Expected : `LENGTH(user)` = `19`, et
`mysql -ucheckprintplus_preview -p… checkprintplus_prod` refusé (`Access denied`).

- [ ] **Étape 4 : la clé Meilisearch de production**

Même commande qu'A4, étape 6, avec `"description":"takussan prod","indexes":["prod_*"]`. Puis la
preuve inverse : la clé de production reçoit `403` sur `preview_sonde`, `202` sur `prod_sonde`
(supprimé ensuite avec la clé maîtresse).

- [ ] **Étape 5 : sauvegardes de production**

`takussan_prod` à `0 2 * * *` et `checkprintplus_prod` à `30 2 * * *`, préfixes `postgres/takussan_prod/`
et `mysql/checkprintplus_prod/`, **30** exemplaires. Une sauvegarde manuelle chacune, lue dans R2.

### Tâche F2 : le code de la production Takussan

**Files:**
- Modify: `.github/workflows/images.yml`
- Modify: `takussan-web/src/app/layout.tsx`, `takussan-web/package.json`, `takussan-web/package-lock.json`

- [ ] **Étape 1 : `images.yml` sert aussi `master`**

`on.push.branches` devient `[preview, master]`, et le `case` du job `cible` gagne, avant `*)` :

```yaml
            master)
              { echo "environnement=prod"
                echo "api_url=https://api.takussan.com"
                echo "site_url=https://www.takussan.com"; } >> "$GITHUB_OUTPUT" ;;
```

- [ ] **Étape 2 : l'environnement GitHub `prod`, avec réviseur**

Le dépôt est public : un réviseur obligatoire est disponible sur le plan gratuit. Le job `deploy`
attend donc une approbation humaine ; la construction, elle, ne l'attend pas.

```bash
jq -n --argjson id "$(gh api users/thiambara -q .id)" \
  '{reviewers: [{type: "User", id: $id}], deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}}' \
  | gh api -X PUT repos/thiambara/takussan/environments/prod --input -
gh api -X POST repos/thiambara/takussan/environments/prod/deployment-branch-policies -f name=master
gh api repos/thiambara/takussan/environments/prod -q '{reviewers: [.protection_rules[] | select(.type == "required_reviewers")] | length, branches: .deployment_branch_policy}'
```

Expected : un réviseur, et une politique de branches personnalisée (`master` seule).

- [ ] **Étape 3 : retirer `@vercel/analytics`**

```bash
cd takussan-web && npm uninstall @vercel/analytics
```

Dans `src/app/layout.tsx`, supprimer l'import de la ligne 19
(`import { Analytics } from '@vercel/analytics/next';`) et l'élément `<Analytics />` de la ligne 102.

Run: `npm run lint && npx tsc --noEmit && npm run test && npm run build && grep -rn vercel/analytics src package.json; cd ..`
Expected : tout vert, et le `grep` final ne rend rien.

- [ ] **Étape 4 : commit, puis fusion jusqu'à `master` sur demande du porteur**

```bash
git add .github/workflows/images.yml takussan-web/src/app/layout.tsx takussan-web/package.json takussan-web/package-lock.json
git commit -m "ci(web): images.yml sert la production sur master ; retrait de @vercel/analytics (ADR-0028)"
```

Au push sur `master` : les jobs `api` et `web` construisent les images `:prod`, et `deploy` **attend
l'approbation**. Ne pas approuver avant F3, étape 3. (Vercel construit aussi ce commit : il sert
encore `www.takussan.com` jusqu'à F3.)

### Tâche F3 : basculer la production Takussan

- [ ] **Étape 1 : les services de production dans Dokploy**

- Le Compose `donnees` passe à la branche `master` (A4 le déclarait sur `preview`), puis *Deploy*.
- Compose `takussan-api-prod` : comme D1, branche **`master`**, domaine `api.takussan.com`. Son
  environnement est celui de D1, à ces différences près :

| Clé | Valeur de production |
|---|---|
| `IMAGE_TAG` | `prod` |
| `APP_KEY` | neuve (`openssl rand -base64 32`) — jamais celle de la préproduction |
| `APP_URL` / `FRONTEND_URL` / `SANCTUM_STATEFUL_DOMAINS` | `https://api.takussan.com` / `https://www.takussan.com` / `www.takussan.com` |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | `takussan_prod` / `takussan_prod` / F1, étape 2 |
| `REDIS_DB` / `REDIS_CACHE_DB` | `2` / `3` |
| `SCOUT_PREFIX` / `MEILISEARCH_KEY` | `prod_` / la clé `prod_*` de F1, étape 4 |
| clés des fournisseurs (SMS, WhatsApp, Google…) | celles de **production** de l'export A1 (`/var/www/takussan/shared/.env`) |

- Application `takussan-web-prod` : image `ghcr.io/thiambara/takussan-web:prod`, domaine
  `www.takussan.com`, **sans** authentification basique.
- *Volume Backups* du volume `storage` de production : `volumes/takussan-prod/`, `0 4 * * *`, 14
  exemplaires.

- [ ] **Étape 2 : l'environnement GitHub `prod` reçoit ses identifiants**

Même bloc que D3, étape 1, avec `takussan-api-prod`, `takussan-web-prod` et `--env prod` ; **pas** de
`PREVIEW_BASIC_AUTH`.

- [ ] **Étape 3 : approuver, et basculer `www` pendant que la preuve attend**

`api.takussan.com` pointe déjà sur le serveur, en DNS seul : son certificat s'émet dès le premier
déploiement. `www.takussan.com`, lui, pointe sur Vercel : Let's Encrypt ne peut pas émettre son
certificat avant la bascule. La preuve du workflow attend dix minutes : **c'est la fenêtre de
bascule.**

1. Approuver le job `deploy` du dernier run de `master` (onglet *Actions*, ou
   `gh run view <id> -R thiambara/takussan` puis *Review deployments*).
2. Attendre la ligne `✓ https://api.takussan.com/up sert <commit>` dans le journal.
3. Chez Cloudflare, `www.takussan.com` : le CNAME Vercel devient **A `178.18.247.62`, proxifié**.
4. Attendre `✓ https://www.takussan.com/robots.txt sert <commit>`.

Expected : le job `deploy` vert. Pendant la minute où Traefik obtient le certificat, Cloudflare peut
rendre `526`. **Retour arrière** : si la seconde ligne `✓` ne vient pas, remettre le CNAME relevé en
F1, étape 1 — le projet Vercel sert toujours, et c'est la raison pour laquelle on ne le supprime
qu'en F5.

- [ ] **Étape 4 : `api.takussan.com` passe derrière Cloudflare, l'apex redirige**

- `api.takussan.com` : passer l'enregistrement en **proxifié** (son certificat d'origine existe
  depuis l'étape 3, Full (strict) l'accepte).
- `takussan.com` : l'enregistrement Vercel devient **A `192.0.2.1`, proxifié** (adresse de
  documentation : Cloudflare répond, aucune origine n'est jamais jointe), et une *Redirect Rule* :
  hôte égal à `takussan.com` → `https://www.takussan.com${http.request.uri.path}`, code `301`,
  chaîne de requête conservée.

```bash
curl -sS -o /dev/null -D - https://api.takussan.com/up | tr -d '\r' | grep -iE '^(HTTP|cf-ray|x-build-sha)'
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://takussan.com/fr/biens?page=2'
curl -sS -o /dev/null -D - https://www.takussan.com/fr | tr -d '\r' | grep -iE '^(HTTP|x-vercel-id|x-build-sha)'
```

Expected : `200`, un `cf-ray`, le commit ; `301 https://www.takussan.com/fr/biens?page=2` ; `200`, le
commit, **aucun** `x-vercel-id`.

- [ ] **Étape 5 : l'IP du client à travers Cloudflare — l'ablation de D5, sur l'hôte proxifié**

Rejouer D5, étape 4, contre `https://api.takussan.com`, dans l'environnement `takussan-api-prod` :
l'IP du poste autorisée → pas de `Source IP not allowed` ; `203.0.113.7` autorisée → `403`, **avec
et sans** `X-Forwarded-For: 203.0.113.7`. C'est ici que la règle d'ADR-0028 §8 se prouve pour de
bon : la requête traverse une bordure Cloudflare, et Laravel doit remonter jusqu'au poste sans croire
l'en-tête qu'il a forgé. Remettre ensuite la valeur de production.

- [ ] **Étape 6 : files, recherche, restauration, budget**

Rejouer D5, étapes 2 et 3, contre les conteneurs de `takussan-api-prod` (clé attendue : `403` sur
`preview_properties`). Rejouer D6, étape 2, contre `takussan_prod` après sa première sauvegarde
nocturne. Rejouer D6, étape 4 : c'est la première mesure du budget à **quatre** environnements — la
reporter dans le relevé et dans le tableau de ce plan.

### Tâche F4 : basculer la production CheckPrint Plus

Dépôt `thiambara/check-print-plus`, mêmes gestes que F2 et F3. Seules les différences sont écrites.

- [ ] **Étape 1 : le code**

```bash
cd web && npm uninstall @vercel/analytics @vercel/speed-insights
```

Dans `web/src/app/layout.tsx` : supprimer les imports des lignes 5 et 6 (`SpeedInsights`,
`Analytics`) et les éléments `<SpeedInsights />` et `<Analytics />`. Dans `web/next.config.ts`,
retirer `https://va.vercel-scripts.com` de `script-src` **et** de `connect-src`. Lint, types, tests,
build ; `grep -rn 'vercel-scripts\|@vercel/' src next.config.ts package.json` ne rend rien. Commit,
fusion vers `master` sur demande du porteur.

- [ ] **Étape 2 : l'environnement GitHub `prod`**

Le dépôt est privé sur le plan gratuit : pas de réviseur. La garde est l'entrée `confirmation` de C3
— un déploiement de production exige `workflow_dispatch`, depuis `master`, avec `production` écrit à
la main. Variables et secrets de C3 dans l'environnement `prod`, identifiants lus comme en D3.

- [ ] **Étape 3 : Dokploy**

Compose `cpp-api-prod` (branche `master`, domaine `api.checkprintplus.com`) : l'environnement de D7
avec `IMAGE_TAG=prod`, `checkprintplus_prod`, `REDIS_DB=2`, `REDIS_CACHE_DB=3`,
`APP_URL=https://api.checkprintplus.com`, `FRONTEND_URL=https://checkprintplus.com`, une `APP_KEY`
neuve, et les clés de **production** de l'export A1. ⚠ **`LICENSE_DESKTOP_SECRET` reprend la valeur
de l'export**, et c'est la seule clé qui ne se régénère pas : c'est un secret **partagé avec le
binaire de bureau déjà distribué**. `VerifyDesktopSignature` (alias `desktop.signed`) vérifie
`POST /licenses/activate` **toujours** contre lui, et les installations sans secret propre à
l'appareil y retombent aussi pour `validate` et `deactivate`. Une valeur neuve ne rejetterait donc
pas « quelques » requêtes : toute activation, toute réinstallation, et toute installation ancienne. Application `cpp-web-prod` : image `:prod`, domaines
`checkprintplus.com` **et** `www.checkprintplus.com` — les deux servent `200` aujourd'hui, on
reproduit ; une redirection de `www` vers l'apex serait une décision à part.

- [ ] **Étape 4 : déployer et basculer**

```bash
gh workflow run images.yml --ref master -f confirmation=production -R thiambara/check-print-plus
```

Pendant que la preuve attend `https://checkprintplus.com/robots.txt` : `checkprintplus.com` et
`www.checkprintplus.com` passent en **A `178.18.247.62`, proxifiés**. Puis `api.checkprintplus.com`
passe en proxifié. Même retour arrière qu'en F3 : les enregistrements relevés en F1.

- [ ] **Étape 5 : ce que seuls des tiers peuvent confirmer**

- `docker exec <projet>-api-1 php artisan db:seed --class=ProductionSeeder --force`, une fois.
- L'application de bureau : activer une licence de test depuis le poste — c'est `api.checkprintplus.com`,
  écrit dans son code, qui répond désormais.
- LemonSqueezy : *Settings → Webhooks → Send test* ; une ligne `200` dans les journaux de `cpp-api-prod`.
- Connexion Google sur `https://checkprintplus.com` : l'URL de retour n'a pas changé (ADR-0028 §9).
- Les compteurs de débit de D7, étape 5, contre `https://api.checkprintplus.com` — proxifié, cette fois.
- La restauration à blanc de `checkprintplus_prod` après sa première sauvegarde nocturne.

### Tâche F5 : retirer Vercel, clore

Au moins **7 jours** après F3 et F4, sans retour arrière entre-temps.

- [ ] **Étape 1 : supprimer les projets Vercel — sur confirmation du porteur, au moment de le faire**

C'est irréversible, et c'est le chemin de retour de F3 et F4 qui disparaît. Relever d'abord
`dig +short www.takussan.com www.checkprintplus.com checkprintplus.com` (adresses Cloudflare
attendues), puis supprimer les deux projets dans le tableau de bord Vercel, et retirer l'application
GitHub Vercel des deux dépôts (*Settings → GitHub Apps*).

- [ ] **Étape 2 : le dépôt Takussan oublie Vercel**

```bash
git rm .github/workflows/front-deploy-map.yml docs/infra/frontend-deploiement.md docs/infra/frontend-deploiement.json takussan-web/vercel.json
```

- `scripts/check-front-env-keys.mjs` : retirer `RELEVE`, son contrôle d'existence, la lecture de
  `relevees` et son contrôle `relevees.size === 0`, l'erreur « absente de … frontend-deploiement.json »,
  la colonne `relevé` du rapport, et les passages du docblock qui citent le relevé ou ADR-0017. La
  garde exige désormais : `.env.example`, `ARG` du Dockerfile, `build-args` d'`images.yml`. Ablation
  de B5, étape 6, rejouée : elle rougit toujours.
- `takussan-web/.env.example` : le commentaire de `NEXT_PUBLIC_SITE_URL` ne parle plus de Vercel ni
  de `VERCEL_URL` ; il dit « vide en local ; posée par `images.yml` pour chaque image ».
- Ouvrir un ticket (par `/write-spec`) pour retirer de `resoudreOrigineSite()` la branche
  `VERCEL_ENV` / `VERCEL_URL`, devenue du code mort, avec ses tests — c'est du code applicatif, pas
  de l'hébergement.
- `node scripts/check-doc-links.mjs` : réparer chaque lien vers les fichiers supprimés, selon la
  règle de B6, étape 2.

Dans `thiambara/check-print-plus` : `git rm web/vercel.json`.

- [ ] **Étape 3 : les décisions et les dettes rattrapent la mesure**

- **ADR-0017** : statut « Remplacé par ADR-0028 — effectif le `<date de F3>` » ; la ligne d'index du
  `README` suit.
- **`CLAUDE.md`**, « Workflow git » : `master` déploie la production **par `images.yml`**, derrière le
  réviseur de l'environnement `prod`, prouvée par `X-Build-Sha`. Le tableau des chiffres faux et le
  paragraphe « la production n'a jamais été déployée » cèdent la place à la mesure de F3, étape 4,
  datée — et leur histoire part dans `docs/journal-des-corrections.md`, où vit le récit.
- **`docs/ardoise.md`** : D-04 et D-10 soldées, avec les commandes et les sorties de F3.
- **Tickets** : TCK-332 et le ticket F passent `done`.

- [ ] **Étape 4 : la colonne « production » de `versions.json` se mesure enfin**

```bash
ssh root@178.18.247.62 '
  docker exec $(docker ps -q -f name=meilisearch | head -1) meilisearch --version
  docker exec $(docker ps -q -f name=redis-takussan | head -1) redis-server --version
  docker exec $(docker ps -q -f name=takussan-api-prod -f name=api | head -1) php -v | head -1
  docker exec $(docker ps -q -f name=takussan-web-prod | head -1) node -v
  docker exec $(docker ps -q -f ancestor=pgvector/pgvector:pg17 | head -1) postgres --version'
```

Chaque service passe à `"etat": "mesure"`, avec `valeur`, `date` et la commande exacte. `mailpit`
reste « sans objet en production ». Run: `node scripts/check-infra-versions.mjs --report` → vert.

- [ ] **Étape 5 : toutes les gardes, et commit**

```bash
for g in scripts/check-*.mjs; do node "$g" >/dev/null || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check && node docs/gen-features-by-actor.mjs --check
git add -A docs scripts .github CLAUDE.md takussan-web
git commit -m "docs: la production est auto-hébergée ; Vercel, ADR-0017 et le relevé du front sont retirés (TCK-332, ADR-0028)"
```

Expected : aucune ligne `✗`.
