# Hébergement — le relevé du serveur et le runbook

> Décision : [ADR-0028](../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Plan :
> [2026-09-13-auto-hebergement-vps-dokploy](../plans/2026-09-13-auto-hebergement-vps-dokploy.md).
> Ce document RELÈVE ce qui vit dans Dokploy et que le dépôt ne contrôle pas. Il ne porte **aucune
> valeur secrète** : les valeurs sont dans Dokploy et dans le gestionnaire de mots de passe.

## Ce qui sert quoi

| Hôte | Service Dokploy | Image | Relevé le |
|---|---|---|---|
| `preview.api.takussan.com` | Compose `takussan-api-preview`, service `api:8080` — A en DNS seul | `ghcr.io/thiambara/takussan-api:preview` | 2026-09-14 : `/up` → `200`, `X-Build-Sha` = `preview`, Let's Encrypt |
| `preview.takussan.com` | Application `takussan-web-preview` — A proxifié (était un CNAME Vercel) | `ghcr.io/thiambara/takussan-web:preview` | 2026-09-14 : `401` sans authentification, `200` avec (la racine rend `307` vers `/fr`) ; `cf-ray`, aucun `x-vercel-id` ; plafond **512 Mio** depuis le 2026-09-14 (TCK-520 : pic 327 Mio mesuré sous charge d'images sur l'ancien plafond de 384) |
| `preview.api.checkprintplus.com` | Compose `cpp-api-preview`, service `api:8080` — A en DNS seul | `ghcr.io/thiambara/check-print-plus-api:preview` (privée) | 2026-09-14 : `/up` → `200`, `X-Build-Sha` = `c1744692…` (promotion #28 de check-print-plus), Let's Encrypt |
| `preview.checkprintplus.com` | Application `cpp-web-preview` — A proxifié (était un CNAME Vercel) | `ghcr.io/thiambara/check-print-plus-web:preview` (privée) | 2026-09-14 : `401` sans authentification et avec un mauvais mot de passe, `200` avec ; `server: cloudflare`, `cf-ray` ; plafond 256 Mio (TCK-520 : pic 140 Mio sous 200 pages à 4 clients, le plafond tient) |
| `deploy.takussan.com` | l'interface de Dokploy — A proxifié, certificat d'origine Let's Encrypt | — | 2026-09-14 : `200`, `http` → `301` |
| `api.takussan.com` — **le nom que le front public appelle** | **aucun service** jusqu'à la phase F (TCK-517) : A `178.18.247.62` en DNS seul, hérité de l'ancien serveur ; Traefik y présente `CN=TRAEFIK DEFAULT CERT` (auto-signé, réémis à chaque redémarrage de Traefik — `notAfter` 2027-09-14 20:46 Z, celui du redémarrage de TCK-518) et rend `404` derrière. Depuis `www.takussan.com`, l'appel **échoue sur la poignée de main TLS**, plus sur un 404 : même effet pour l'utilisateur (TCK-332, D-04). ⚠ Pas dans `certificats.sh` : il rougirait chaque jour ; le nom y entre en F3, étape 3. Décision de ne pas servir de `503` avant F : TCK-523 | — | 2026-09-14, 22:42 Z (TCK-523) : `curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}' https://api.takussan.com/up` → `000 20` ; avec `-k` → `404` ; `openssl s_client -connect 178.18.247.62:443 -servername api.takussan.com </dev/null \| openssl x509 -noout -subject -enddate` |

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
| `deploy/takussan/compose.api.yml` | la pile d'API d'un environnement, déclarée dans Dokploy — déployée par la commande en deux temps du relevé (`run --rm release && up -d --build`, TCK-522), jamais par un simple `up` |
| `deploy/server/compose.data.yml` | Meilisearch et les deux Redis, partagés par les deux projets |
| `deploy/server/bootstrap.sh` | la préparation d'un Ubuntu 24.04 vierge |
| `.github/workflows/images.yml` | construit, pousse sur GHCR, déclenche Dokploy, **prouve** par `X-Build-Sha` |
| `deploy/server/journaux-traefik.sh` | ajoute l'`accessLog` JSON à `traefik.yml` (hors dépôt, réécrit par l'installation de Dokploy) et redémarre Traefik ; idempotent, se rejoue après toute réinstallation (TCK-518) |
| `.github/workflows/certificats.yml`, `deploy/server/certificats.sh` | chaque jour, l'échéance des certificats d'**origine**, lus sur le serveur par SNI : rouge — et courriel de GitHub — sous 14 jours, sur un nom non couvert ou un certificat illisible |
| `deploy/takussan/smoke-api.sh`, `deploy/takussan/smoke-web.sh` | les tests de fumée locaux des images ; `pile` déploie avec la commande de Dokploy et joue un `release` en échec (TCK-522) |

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
| Courriel ACME (Let's Encrypt) | l'adresse du compte administrateur de Dokploy, posée le 2026-09-14, 23:14 Z dans `certificatesResolvers.letsencrypt.acme.email` de `/etc/dokploy/traefik/traefik.yml` (TCK-527 ; était `test@localhost.com`, écart A3 étape 5) ; Traefik redémarré, `acme.json` **intact** (même `sha256`, même date). ⚠ Le compte Let's Encrypt déjà enregistré garde son contact d'origine : Traefik ne le met pas à jour sans ré-enregistrer, ce qui demanderait d'effacer `acme.json` et de ré-émettre les cinq certificats — non fait, `certificats.yml` porte l'alerte d'échéance | 2026-09-14 | `grep -n email: /etc/dokploy/traefik/traefik.yml` (ne rend plus `localhost`) ; `sha256sum /etc/dokploy/traefik/dynamic/acme.json` avant et après |
| Compte et 2FA | un seul compte (le porteur, créé le 2026-09-14), **`two_factor_enabled = t`** ; l'interface est derrière Cloudflare et le port 3000 est fermé (ci-dessous) | 2026-09-14 | `docker exec $(docker ps -q -f name=dokploy-postgres) psql -U dokploy -d dokploy -tAc 'select two_factor_enabled, created_at::date from "user"'` |
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
| *Bot Fight Mode* | **désactivé** dans les deux zones ; *Browser Integrity Check* actif (il ne gêne ni la preuve `curl` d'`images.yml`, ni les API en DNS seul). Le jeton ne lit pas ce réglage (erreur `10000`) : vérifié au tableau de bord par le porteur | 2026-09-14 | Security → Settings → *Bot traffic* |
| Notifications de Dokploy | canal Telegram ; événements : échec de build, sauvegardes (bases, volumes, Dokploy), nettoyage Docker, redémarrage de Dokploy — pas les déploiements. ⚠ **Jamais reçues, mesuré le 2026-09-14 (TCK-519)** : le *Chat ID* enregistré est le `@username` du bot lui-même, et l'API répond `403 Forbidden: the bot can't send messages to the bot` ; `getUpdates` est vide, le bot n'a jamais reçu un message. Correction : ouvrir une conversation avec le bot (ou l'ajouter à un canal), relire l'identifiant par `getUpdates`, le poser dans Dokploy **et** dans `/etc/default/seuils`. ⚠ *Server Threshold* n'existe pas en auto-hébergé : le formulaire ne l'affiche que sous Dokploy Cloud (`isCloud`, relu dans le source de la v0.30.6). Aucune alerte ne signale donc un seuil du budget | 2026-09-14 | `notification.all` |
| Commande de déploiement des Compose | champ *Command* du service, posé le 2026-09-14, 22:36 Z par `compose.update` (TCK-522) — Takussan : `compose -p takussan-api-preview-4iza80 --env-file deploy/takussan/.env -f ./deploy/takussan/compose.api.yml run --rm release && docker compose -p takussan-api-preview-4iza80 --env-file deploy/takussan/.env -f ./deploy/takussan/compose.api.yml up -d --build --remove-orphans` ; CheckPrint Plus : la même avec `cpp-api-preview-tdb0ll`, `deploy/.env`, `./deploy/compose.api.yml`. Dokploy l'exécute en `docker ${command}` ; `&&` admis entre commandes `docker compose`, `;` `\|` `$` `(` `)` refusés (source v0.30.6, `builders/compose.ts`). `release` tourne deux fois par déploiement, le second ne migre ni ne réimporte rien (`Nothing to migrate`, `forme des index inchangée`, `done` en 10 s). ⚠ Hors dépôt : à reposer après toute recréation d'un service Compose (runbook, étape 9) | 2026-09-14 | `compose.one` → `command` ; journal de déploiement, encadré « Executing command » |
| Déploiement en échec | **Prouvé le 2026-09-14, 22:36 Z (TCK-522) : un `release` qui échoue laisse l'ancienne API servir — grâce à la commande ci-dessus, PAS à `depends_on`.** `DB_PASSWORD` altéré dans *Environment*, *Deploy* : déploiement `error` en moins de 15 s, journal `SQLSTATE[08006] … password authentication failed` puis `Error: ❌ Docker command failed`, aucune ligne `Recreate` ; pendant et après, conteneur `api` `16035eee79e6…` inchangé et `healthy`, `/up` → `200`, `X-Build-Sha` = `ad93e5e6…` inchangé, `worker`, `worker-media`, `scheduler` `Up`. Environnement restauré à l'identique, déploiement suivant `done`. ⚠ Avec le `up -d --build` par défaut, mesuré en local le même jour : Compose retire l'ancien `api` et crée le neuf **avant** de lancer `release` ; `release` en échec, tout reste `Created`, `/up` → `000`. **Notification** : Dokploy appelle `sendBuildErrorNotifications` (événement « échec de build », Compose compris), mais son envoi Telegram est un `fetch` dont la réponse n'est jamais lue : le `403` du *Chat ID* faux (ligne « Notifications ») ne laisse **aucune trace** dans `docker service logs dokploy`. Un échec ne se voit donc qu'à l'interface, et dans `images.yml` | 2026-09-14 | `deploy/takussan/smoke-api.sh pile` (étape « release en échec ») ; sur la préproduction : `compose.update` (`env`), `compose.deploy`, `docker ps -a --no-trunc --filter name=takussan-api-preview-4iza80-api-1`, `curl -sSD - -o /dev/null https://preview.api.takussan.com/up` |
| Protection des branches | `preview` et `master` (TCK-524, posée le 2026-09-14, 22:51 Z par `gh api -X PUT …/branches/<b>/protection`, corps dans le ticket) : PR obligatoire à zéro réviseur, **six checks requis** — `API / lint-and-test`, `API / Rollback des migrations sur PostgreSQL 17 (le code que rien d'autre n'exécute)`, `API / Image de l'API (construite, pas poussée)`, `Front / Web (ESLint + tsc + Vitest + build)`, `Front / Image du front (construite, pas poussée)`, `Dépôt / Gardes documentaires` — les jobs que `promotion-ci.yml` rejoue en entier sur toute PR vers ces branches ; `enforce_admins`, `strict: false`, ni force-push ni suppression. Ablation : `git push origin HEAD:preview` → `protected branch hook declined`, `preview` inchangée. ⚠ `dev` reste sans protection : le step de la carte d'impact (TCK-479) y pousse avec le `GITHUB_TOKEN`. Aucun *ruleset* (`rulesets` → `[]`) | 2026-09-14 | `gh api repos/thiambara/takussan/branches/preview/protection -q .required_status_checks.contexts` ; `…/master/protection` ; `gh api repos/thiambara/takussan/rulesets` |
| Surveillance externe | UptimeRobot (compte du porteur, version gratuite) : `https://preview.api.takussan.com/up`, `https://preview.api.checkprintplus.com/up`, `https://deploy.takussan.com/`, toutes les 5 minutes. Mesuré sur le serveur : deux adresses de la liste publique d'UptimeRobot, 6 connexions en 380 s sur les deux API en DNS seul ; `deploy.takussan.com` passe par Cloudflare et ne se voit qu'au tableau de bord. L'échéance des certificats n'est pas dans la version gratuite : `certificats.yml` la tient | 2026-09-14 | `tcpdump` des SYN sur `:443`, rapprochés de `https://uptimerobot.com/inc/files/ips/IPv4.txt` |
| Surveillance des seuils du budget | `seuils.timer` toutes les 5 minutes → `/usr/local/sbin/seuils` (`deploy/server/seuils.sh`, TCK-519) : mémoire disponible ≥ 1 500 Mo, disque < 75 %, `st` < 10, Dokploy < 1 536 Mo ; une alerte Telegram par **franchissement**, un message de retour, silence sinon. Ablation jouée le 2026-09-14 : `SEUIL_MEM_MO=100000 seuils` alerte, rejoué se tait, `seuils` annonce le retour ; les deux envois ont rendu le `403` ci-dessus tant que le *Chat ID* est faux. Secrets dans `/etc/default/seuils` (600), unités posées par `bootstrap.sh` § 7 | 2026-09-14 | `systemctl list-timers seuils.timer` ; `seuils --etat` ; `journalctl -u seuils.service` |
| Journaux d'accès | **Traefik, une ligne JSON par requête sur stdout de `dokploy-traefik`** (TCK-518) : adresse cliente reconstruite (`ClientHost` — mesuré : l'IP du poste à travers Cloudflare **et** sur un hôte en DNS seul avec un `X-Forwarded-For: 203.0.113.7` forgé), hôte, méthode, chemin, statut, durée, routeur, `User-Agent`. **Aucun autre en-tête** : `Authorization` et `Cookie` sont écartés (`headers.defaultMode: drop`, mesuré sur un 401). ⚠ `ClientUsername` porte le nom d'utilisateur de l'authentification basique, jamais le mot de passe. Borné par la rotation de `daemon.json` (`10m × 3`, relu sur le conteneur). Les conteneurs `api` n'écrivent toujours rien par requête, et c'est voulu. Avant ce jour : aucun journal, la présence d'un client se mesurait en direct (`tcpdump`) | 2026-09-14 | `docker logs --since 10m dokploy-traefik \| jq -c 'select(.RequestHost=="preview.api.takussan.com") \| {ClientHost,RequestPath,DownstreamStatus,Duration}'` ; posé par `deploy/server/journaux-traefik.sh` |
| Nettoyage Docker quotidien | actif | 2026-09-14 | `settings.getWebServerSettings` → `enableDockerCleanup` |
| Budget au repos | Takussan seule, après seed (02:04 Z) : 5 697 Mo disponibles sur 7 941, `st` 0, disque 24 %. Les deux préproductions servies (11:03 Z) : **5 349 Mo**, `st` 0, disque 25 %. Dokploy seul : 867 puis 1 013 Mo, **sans plafond** | 2026-09-14 | plan, tâche D6, étape 4 ; détail par conteneur au § Budget du plan |
| Médias de la préproduction Takussan | 948 Mo dans le volume `takussan-api-preview-4iza80_storage` | 2026-09-14 | `du -sh /var/lib/docker/volumes/<projet>_storage/_data` |
| Destination des sauvegardes | seau R2 `vps-sauvegardes` (Cloudflare, région `auto`), jeton limité au seau : liste `200`, liste des seaux `403` ; *Test Connection* réussi | 2026-09-14 | `destination.testConnection` |
| Sauvegardes planifiées | `takussan_preview` `0 3 * * *`, 14 exemplaires ; `checkprintplus_preview` `30 3 * * *`, 14 ; volume `takussan-api-preview-4iza80_storage` `0 4 * * *`, 7. Une manuelle de chaque, **lue dans R2** : 1 729 580 o, 27 683 o (après `ProductionSeeder`), 945 797 120 o | 2026-09-14 | liste du seau (ci-dessous), pas la liste de Dokploy |
| Sauvegarde de la configuration de Dokploy | `web-server`, `30 4 * * *`, 7 exemplaires ; une manuelle lue dans R2 : `…/dokploy/webserver-backup-<date>.zip`, 94 409 314 o | 2026-09-14 | `backup.manualBackupWebServer` |
| Clés des objets dans R2 | Dokploy fait **précéder** le préfixe déclaré du nom interne du service : `serveur-postgres-egr6ii/postgres/takussan_preview/<date>.sql.gz`, `serveur-mysql-vsqugl/mysql/checkprintplus_preview/…`, `takussan-api-preview-4iza80_api/volumes/takussan-preview/…tar`, `backup-parse-multi-byte-card-vlwhry/dokploy/…zip`. Une liste filtrée sur le seul préfixe déclaré ne trouve **rien** | 2026-09-14 | `GET …/vps-sauvegardes?list-type=2` (SigV4) |
| Restauration à blanc | PostgreSQL : diff des comptes **vide**, 92 tables, 86 927 lignes (préproduction arrêtée) ; volume de médias : 17 629 fichiers, **même** `sha256` | 2026-09-14 | plan, tâche D6, étapes 2 et 3 ; ticket TCK-515 |
| Registre `ghcr.io` | compte `thiambara`, jeton **classique** `read:packages` ; rattaché à `cpp-web-preview`. ⚠ `registry.create` ne fait **pas** de `docker login` sur le serveur, et un Compose n'a pas de champ de registre : `docker compose pull` de l'API privée restait `unauthorized`. `docker login ghcr.io` fait à la main sur le serveur (jeton par l'entrée standard, `/root/.docker/config.json` en `600`) — **à refaire à chaque rotation du jeton**, en plus de Dokploy | 2026-09-14 | `registry.testRegistry` ; `docker pull ghcr.io/thiambara/check-print-plus-api:preview` → code `0` |

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
  `resend/resend-laravel` et `resend/resend-php`. Le SDK est dans l'image de préproduction depuis
  `ad93e5e6` (relu dans le conteneur : `ResendTransport` se construit) ; la production le recevra
  en phase F ;
- **préproduction** : `MAIL_MAILER=log`, posé dans Dokploy et relu dans `api` et `worker`. Le seed
  écrit des adresses sous des domaines `.sn` qui peuvent exister : une préproduction qui envoie
  vraiment écrit à des inconnus. Les échecs accumulés ont été vidés (`queue:flush`, 36 → 0).

`docs/infra/prod-drivers.json` porte les **drivers** (`CACHE_STORE`, `SESSION_DRIVER`,
`QUEUE_CONNECTION`, `MAIL_MAILER`, …) tels que Dokploy les déclare, **régénéré depuis ce relevé le
2026-09-14** (TCK-527) — il décrivait jusque-là les `.env` de l'ancien serveur, `MAIL_MAILER=resend`
en préproduction compris. Les clés vivent ici, les drivers là-bas, les valeurs secrètes nulle part.

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
authentification basique, dont `utilisateur:motdepasse` est aussi le secret `PREVIEW_BASIC_AUTH` de
l'environnement GitHub `preview` de check-print-plus (posé le 2026-09-14, longueur vérifiée).

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
workflow n'est vert que lorsque `X-Build-Sha` rend le commit. Dokploy joue la commande en deux temps
du relevé : `release` par `run`, puis `up` seulement s'il a réussi — un `release` en échec laisse
l'ancienne pile servir et le déploiement passe `error` (relevé, ligne « Déploiement en échec »).

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

**Restaurer une base** : Dokploy → service Database → Backups → *Restore*, depuis R2. La restauration
à blanc (plan, tâche D6, étape 2) a été jouée **hors** Dokploy, sur le poste, le 2026-09-14 ; ses
comptes sont dans TCK-515. Deux pièges payés ce jour-là :

- la sauvegarde PostgreSQL s'appelle `.sql.gz` mais contient une archive **custom**
  (`pg_dump -Fc | gzip`) : `gunzip | psql` ne charge rien, et ne l'écrit pas. `gunzip`, puis
  `pg_restore --no-owner --no-acl`. Celle de MySQL est bien du SQL compressé ;
- une préproduction « au repos » écrit (`jobs`, `scheduled_task_runs`) : pour comparer, on l'arrête
  (hors base) avant la sauvegarde, et on la redémarre après le comptage.

**Restaurer le volume de médias** : l'archive (`tar` du contenu du volume, entrées `./…`) se lit dans
R2 depuis le serveur et s'extrait dans un volume **neuf**, jamais par-dessus le volume servi ; puis
`sha256sum` des deux côtés (plan, tâche D6, étape 3). L'API de Dokploy v0.30.6 n'expose aucune route
de restauration.

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

7. Le journal d'accès de Traefik (TCK-518) — l'installation ne le pose pas, et le fichier est hors
   dépôt : `scp deploy/server/journaux-traefik.sh root@178.18.247.62:` puis
   `ssh root@178.18.247.62 'bash journaux-traefik.sh'`. Le script prouve par une requête sonde.

8. Les seuils du budget (TCK-519) — `bootstrap.sh` a posé les unités, qui attendent le script et
   ses secrets : `scp deploy/server/seuils.sh root@178.18.247.62:/usr/local/sbin/seuils`, puis
   `/etc/default/seuils` (mode `600`) avec `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` — les mêmes que
   les notifications de Dokploy, l'identifiant lu par `getUpdates`, jamais le `@username` du bot.
   Preuve : `SEUIL_MEM_MO=100000 seuils` doit envoyer un message, sans ligne `✗`.

9. La commande de déploiement de chaque service Compose (TCK-522) — Dokploy la remplace par un
   simple `up -d --build` tant que le champ *Command* est vide, et un `release` en échec couperait
   alors l'API. Poser la commande du relevé (ligne « Commande de déploiement des Compose »), au
   nom du projet Compose que Dokploy vient d'attribuer :

   ```bash
   curl -sS -X POST "https://deploy.takussan.com/api/compose.update" -H "x-api-key: $DOKPLOY_API_KEY" \
     -H 'content-type: application/json' -A curl/8 \
     -d '{"composeId":"<id>","command":"compose -p <projet> --env-file deploy/takussan/.env -f ./deploy/takussan/compose.api.yml run --rm release && docker compose -p <projet> --env-file deploy/takussan/.env -f ./deploy/takussan/compose.api.yml up -d --build --remove-orphans"}'
   ```

   Preuve : un déploiement normal `done` dont le journal porte `run --rm release` dans l'encadré
   « Executing command », puis `smoke-api.sh pile` en local, qui joue la même commande. ⚠ Sans
   `-A curl/8`, le *Browser Integrity Check* de Cloudflare refuse l'appel (`403`, code `1010`) ;
   mesuré depuis `urllib` de Python.

⚠ Avant d'effacer : exporter et **relire** l'export (plan, tâche A1). Celui du 2026-09-13 est
`~/Sauvegardes/vps-2026-09-13.tar.gpg` sur le poste du porteur, phrase de passe dans le trousseau
macOS (`security find-generic-password -s vps-export-2026-09-13 -w`).

**Les jetons de la migration** (Cloudflare, R2, GHCR, clé d'API Dokploy) transitent par
`~/Sauvegardes/migration-secrets.env` sur le poste, en mode `600`, jamais par le chat ni le dépôt ;
leur place définitive est dans Dokploy, les environnements GitHub et le gestionnaire de mots de passe.
Le fichier se supprime à la fin de la migration.

**Mettre Dokploy à jour** : Settings → *Update*, après avoir lu les notes de version. Relever la
nouvelle version ici.

**L'échéance des certificats** : *Échéance des certificats* (`.github/workflows/certificats.yml`)
lance chaque jour `deploy/server/certificats.sh`, qui lit chaque certificat **sur le serveur**, par
son adresse et le nom en SNI — par le nom seul, un hôte proxifié rendrait celui de Cloudflare. Rouge
sous 14 jours, sur un nom que le certificat ne couvre pas (Traefik sert alors `TRAEFIK DEFAULT
CERT`), ou si rien ne répond ; GitHub envoie l'échec par courriel. Il remplace l'alerte d'échéance
d'UptimeRobot, payante. À la main : `deploy/server/certificats.sh [nom…]`. Relevé le 2026-09-14 : cinq
noms à 89 jours ; `SEUIL_JOURS=365` rougit les cinq, un nom non servi et une origine muette
rougissent aussi. ⚠ Un nom ajouté à Dokploy s'ajoute à la liste du script ; GitHub éteint un
workflow planifié après 60 jours sans activité sur le dépôt (un `workflow_dispatch` le rallume).

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
