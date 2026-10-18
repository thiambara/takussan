# Hébergement — le relevé du serveur et le runbook

> Décision : [ADR-0028](../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Plan :
> [2026-09-13-auto-hebergement-vps-dokploy](../plans/2026-09-13-auto-hebergement-vps-dokploy.md).
> Ce document RELÈVE ce qui vit dans Dokploy et que le dépôt ne contrôle pas. Il ne porte **aucune
> valeur secrète** : les valeurs sont dans Dokploy et dans le gestionnaire de mots de passe.
>
> ⚠ **CheckPrint Plus a quitté le serveur le 2026-10-04** (projet arrêté par le porteur) : projet
> Dokploy, service MySQL et son volume, `redis-cpp`, clé SSH, registre `ghcr.io` et `docker login`,
> images et sauvegardes dans R2 supprimés. Dans la zone `checkprintplus.com`, tous les enregistrements
> web sont supprimés (`api`, `preview`, `preview.api`, apex, `www`, `_vercel`) ; le mail est gardé
> délibérément (Email Routing, MX, SPF, DKIM, DMARC, Resend sur `support.`) : des comptes peuvent
> dépendre d'une adresse du domaine. Le serveur ne porte plus que Takussan ; les mentions de
> CheckPrint Plus qui restent dans l'ADR-0028 et le plan sont historiques.

## Ce qui sert quoi

| Hôte | Service Dokploy | Image | Relevé le |
|---|---|---|---|
| `preview.api.takussan.com` | Compose `takussan-api-preview`, service `api:8080` — A en DNS seul | `ghcr.io/thiambara/takussan-api:preview` | 2026-09-14 : `/up` → `200`, `X-Build-Sha` = `preview`, Let's Encrypt |
| `preview.takussan.com` | Application `takussan-web-preview` — A proxifié (était un CNAME Vercel) | `ghcr.io/thiambara/takussan-web:preview` | 2026-09-14 : `401` sans authentification, `200` avec (la racine rend `307` vers `/fr`) ; `cf-ray`, aucun `x-vercel-id` ; plafond **512 Mio** depuis le 2026-09-14 (TCK-520 : pic 327 Mio mesuré sous charge d'images sur l'ancien plafond de 384) |
| `deploy.takussan.com` | l'interface de Dokploy — A proxifié, certificat d'origine Let's Encrypt | — | 2026-09-14 : `200`, `http` → `301` |
| `api.takussan.com` — **le nom que le front public appelle** | **aucun service** jusqu'à la phase F (TCK-517) : A `178.18.247.62` en DNS seul, hérité de l'ancien serveur ; Traefik y présente `CN=TRAEFIK DEFAULT CERT` (auto-signé, réémis à chaque redémarrage de Traefik — `notAfter` 2027-09-14 20:46 Z, celui du redémarrage de TCK-518) et rend `404` derrière. Depuis `www.takussan.com`, l'appel **échoue sur la poignée de main TLS**, plus sur un 404 : même effet pour l'utilisateur (TCK-332, D-04). ⚠ Pas dans `certificats.sh` : il rougirait chaque jour ; le nom y entre en F3, étape 3. Décision de ne pas servir de `503` avant F : TCK-523 | — | 2026-09-14, 22:42 Z (TCK-523) : `curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}' https://api.takussan.com/up` → `000 20` ; avec `-k` → `404` ; `openssl s_client -connect 178.18.247.62:443 -servername api.takussan.com </dev/null \| openssl x509 -noout -subject -enddate` |

La production s'ajoute à ce tableau en phase F du plan. **D'ici là, il n'y a pas de site public** :
Vercel, qui servait `www.takussan.com` ([ADR-0017](../adr/0017-deploiement-du-front-pilote-par-vercel.md)),
a été supprimé avant la bascule.

| Constat | Relevé le 2026-10-18 |
|---|---|
| `www.takussan.com`, `takussan.com` | aucun enregistrement `A` ni `CNAME` (`dig +short A www.takussan.com`, puis `CNAME`) ; zone servie par Cloudflare |
| dernier déploiement de Vercel | `vercel[bot]`, `Preview`, 2026-10-15T13:32:26Z (`gh api 'repos/thiambara/takussan/deployments?per_page=3'`) |
| environnements GitHub de Vercel | `Production` et `Preview` supprimés le 2026-10-18 (le second par AC6 de TCK-832) ; leurs déploiements restent dans l'historique. `gh api repos/thiambara/takussan/environments -q .total_count` → `0` |
| application GitHub Vercel sur le dépôt | *non mesuré* : le jeton de `gh` ne liste pas les installations. À vérifier dans *Settings → GitHub Apps* |

Le code, les gardes et les textes légaux ne citent plus Vercel depuis TCK-860 : plus de repli
`NEXT_PUBLIC_*`, `output: 'standalone'` et le loader de Cloudflare inconditionnels au build, plus
de `@vercel/analytics`, plus d'origine `*.vercel.app` admise par le CORS de l'API.

## Ce que le dépôt porte

| Fichier | Rôle |
|---|---|
| `takussan-api/Dockerfile`, `takussan-api/docker/` | l'image de l'API — `api`, workers, planificateur, `release` et `seed` |
| `takussan-web/Dockerfile` | l'image du front, **une par commit** : `API_URL`, `SITE_URL` et `MEDIA_URL` se lisent à l'exécution, et `docker/demarrer.mjs` refuse de démarrer sans elles (ADR-0069 § 3) |
| `deploy/takussan/compose.api.yml` | la pile d'API d'un environnement, déclarée dans Dokploy — déployée par la commande en deux temps du relevé (`run --rm release && up -d --build`, TCK-522), jamais par un simple `up` |
| `deploy/server/compose.data.yml` | Meilisearch, partagé par les environnements ; chaque pile d'API porte son Redis depuis TCK-880 (ADR-0069 § 4) |
| `deploy/postgres/Dockerfile`, `deploy/postgres/epreuve.sh` | l'image de la base : `pgvector/pgvector:pg17` épinglée, plus WAL-G et l'archivage continu ; l'épreuve archive, sauvegarde et restaure à un instant choisi dans des conteneurs jetables (TCK-930) |
| `.github/workflows/image-postgres.yml` | construit, éprouve et pousse `ghcr.io/thiambara/takussan-postgres:sha-<commit>` ; **ne déploie jamais** : changer l'image redémarre toutes les bases |
| `deploy/server/wal-g.sh` | sauvegarde de base WAL-G le dimanche, élagage au-delà de 14 jours, veille de l'archivage toutes les 15 minutes (`bootstrap.sh` § 11) |
| `deploy/server/bootstrap.sh` | la préparation d'un Ubuntu 24.04 vierge |
| `.github/workflows/images.yml` | construit, pousse sur GHCR (`sha-<commit>`, `tree-<arbre>`, `<environnement>`), réétiquette au lieu de reconstruire un arbre déjà construit, déclenche Dokploy, **prouve** par `X-Build-Sha` (ADR-0069 § 3) |
| `deploy/server/journaux-traefik.sh` | ajoute l'`accessLog` JSON à `traefik.yml` (hors dépôt, réécrit par l'installation de Dokploy) et redémarre Traefik ; idempotent, se rejoue après toute réinstallation (TCK-518) |
| `.github/workflows/certificats.yml`, `deploy/server/certificats.sh` | chaque jour, l'échéance des certificats d'**origine**, lus sur le serveur par SNI : rouge — et courriel de GitHub — sous 14 jours, sur un nom non couvert ou un certificat illisible |
| `deploy/takussan/smoke-api.sh`, `deploy/takussan/smoke-web.sh` | les tests de fumée locaux des images ; `pile` déploie avec la commande de Dokploy et joue un `release` en échec (TCK-522) |

⚠ **Les images de Takussan sont publiques**, comme le dépôt : leur manifeste se lit avec un jeton
GHCR anonyme (`200` sur `api:preview`, `api:preview-seed` et `web:preview`, mesuré le 2026-09-14).
Rien de secret ne doit donc y entrer ; les valeurs vivent dans Dokploy. Aucun registre n'est déclaré
dans Dokploy depuis le 2026-10-04 : celui de `ghcr.io` ne servait qu'aux images privées de CheckPrint
Plus.

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
| Version de Dokploy | `dokploy/dokploy:v0.30.8` — v0.30.6 posée par `DOKPLOY_VERSION` à l'installation (runbook, étape 6, TCK-526), montée en v0.30.8 par Settings → Update le 2026-10-08 ; Traefik non redémarré, `traefik.yml` intact (accessLog et courriel ACME relus) ; relevée dans `versions.json` | 2026-10-08 | `docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` |
| Version de Docker | `29.8.0` (paquets `5:29.8.0-1~ubuntu.24.04~noble`, containerd.io `2.3.5-1`, compose `5.5.1-1`, buildx `0.37.1-1`), **tenus par `apt-mark hold`** et épinglés dans `bootstrap.sh` § 0 (TCK-526). Rejoué le 2026-09-14 : `DOCKER_VERSION=99.0.0 bash bootstrap.sh` refuse avant tout geste ; `bash bootstrap.sh` sort en 0, `docker --version` inchangé | 2026-09-14 | `docker version --format '{{.Server.Version}}'` ; `apt-mark showhold` ; `dpkg-query -W docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin` |
| Noyau et redémarrages | `6.8.0-147-generic` depuis le redémarrage du 2026-10-17, 22:26 Z, accordé par le porteur. Le serveur tournait en `-138` depuis 33 jours, alors que quatre noyaux plus récents et `libc6` étaient installés (`/var/run/reboot-required` daté du 2026-10-15). Les mises à jour automatiques installent, mais ne redémarrent jamais (`Automatic-Reboot` non posé) : le redémarrage se décide à la main. Retour en 40 s, les 11 mêmes conteneurs, port 3000 toujours fermé (règle reposée par `fermer-port-3000.service`). ⚠ Au démarrage, `worker` et `worker-media` échouent une vingtaine de secondes (`could not translate host name "serveur-postgres-egr6ii"`), le temps que le service PostgreSQL de Swarm démarre, puis repartent seuls (`restart: unless-stopped`). `cloud-init.service` échoue à chaque démarrage (commande `bootcmd` de Contabo, déjà en échec avant celui-ci), sans effet sur les services | 2026-10-17 | `uname -r` ; `ls /var/run/reboot-required` ; `cat /var/run/reboot-required.pkgs` ; `systemctl --failed` |
| Courriel ACME (Let's Encrypt) | l'adresse du compte administrateur de Dokploy, posée le 2026-09-14, 23:14 Z dans `certificatesResolvers.letsencrypt.acme.email` de `/etc/dokploy/traefik/traefik.yml` (TCK-527 ; était `test@localhost.com`, écart A3 étape 5) ; Traefik redémarré, `acme.json` **intact** (même `sha256`, même date). ⚠ Le compte Let's Encrypt déjà enregistré garde son contact d'origine : Traefik ne le met pas à jour sans ré-enregistrer, ce qui demanderait d'effacer `acme.json` et de ré-émettre les cinq certificats — non fait, `certificats.yml` porte l'alerte d'échéance | 2026-09-14 | `grep -n email: /etc/dokploy/traefik/traefik.yml` (ne rend plus `localhost`) ; `sha256sum /etc/dokploy/traefik/dynamic/acme.json` avant et après |
| Compte et 2FA | un seul compte (le porteur, créé le 2026-09-14), **`two_factor_enabled = t`** ; l'interface est derrière Cloudflare et le port 3000 est fermé (ci-dessous) | 2026-09-14 | `docker exec $(docker ps -q -f name=dokploy-postgres) psql -U dokploy -d dokploy -tAc 'select two_factor_enabled, created_at::date from "user"'` |
| Version de Traefik | `traefik:v3.6.7` — un conteneur hors Swarm, `dokploy-traefik` | 2026-09-14 | `docker ps --filter name=dokploy-traefik --format '{{.Image}}'` |
| Hôte interne PostgreSQL | `serveur-postgres-egr6ii` — PostgreSQL 17.11, limite 1 Gio. Image **`ghcr.io/thiambara/takussan-postgres:sha-60c0a5f1ef780108b0d12c769c2fc0e34713f665`** depuis le 2026-10-18 (TCK-930 : `pgvector/pgvector:pg17` épinglée, plus WAL-G 3.0.9 et les autorités de certification) ; `pgvector/pgvector:pg17` jusque-là | 2026-09-14, 2026-10-18 | `docker service ls` (Dokploy suffixe le nom donné) ; `docker service inspect serveur-postgres-egr6ii -f '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` |
| Archivage continu (WAL-G) | seau `takussan-wal`, préfixe `serveur-postgres`, verrou de 7 jours ; jeton propre au seau (`AccessDenied` sur `vps-sauvegardes` et sur la liste des seaux). 11 segments archivés, 0 échec ; première sauvegarde de base en 7 s ; restauration à un instant choisi depuis R2 seul, promue en 19 s, comptes identiques, `backup:verify-encryption` en 0 (1 avec `--cle-fausse`) ; timers `wal-g-base` (dimanche 03:30) et `wal-g-veille` (`*:0/15`) actifs | 2026-10-18 | `wal-g-takussan etat` ; épreuve de TCK-930, AC4 |
| Meilisearch, Redis | `meilisearch:7700` (v1.16) — Compose `donnees` du projet *Serveur*, sans port publié. **Redis : un par environnement depuis le 2026-10-18** (TCK-880, ADR-0069 § 4). Préproduction : service `redis` de la pile `takussan-api-preview-4iza80` (`redis:8-alpine`, 128 Mo, `volatile-lru`), sur le seul réseau `interne` de la pile ; 1,60 Mo au lendemain de la bascule. Mesuré après le déploiement de `b2804272` : une clé `Cache::put` de l'API se lit dans ce Redis et **pas** dans l'ancien `redis-takussan` ; depuis `dokploy-network`, ni `redis` ni `takussan-api-preview-4iza80-redis-1` ne répondent ; `api`, `worker`, `worker-media` et `scheduler` lisent `REDIS_HOST=redis`. `redis-takussan` a quitté le Compose `donnees` le 2026-10-18 (TCK-880, AC4). Il n'y tourne plus que Meilisearch, et son onglet ne porte plus que `MEILI_MASTER_KEY`. Le volume `serveur-donnees-qomjjz_redis-takussan` (30 Mo, aucun conteneur) a été supprimé le 2026-10-18 au soir, avec l'accord du porteur ; `docker volume ls` n'en compte plus aucun | 2026-10-18 | `docker ps --format '{{.Names}} {{.Image}}'` ; `docker exec takussan-api-preview-4iza80-redis-1 redis-cli info memory` |
| Bases de préproduction | `takussan_preview` (`LOCALE C`, `CONNECT` révoqué à `PUBLIC`) | 2026-09-14 | plan, tâche A4, étapes 9 et 10 |
| Plages Cloudflare dans `traefik.yml` | 15 plages v4 et 7 v6 du 2026-09-14, sous `web` **et** `websecure` ; la page de Cloudflare en publie autant le 2026-10-17. Comparées chaque jour, avec le `TRUSTED_PROXIES` de chaque conteneur `api`, par `plages-cloudflare.timer` (`deploy/server/plages-cloudflare.sh`, P37.05) : alerte Telegram par franchissement, rien n'est écrit. **Installé le 2026-10-17, 18:52 CEST** (runbook, étape 10 ; `sha256` du script identique au dépôt, `0cc3f196…`), premier passage du timer le lendemain à 07:00 : `--etat` → les 22 plages dans `traefik.yml` et dans le `TRUSTED_PROXIES` de `takussan-api-preview-4iza80-api-1`. **Ablation jouée, timer arrêté** : une source qui publie `198.51.100.0/24` en plus → une alerte par liste (deux messages), rejouée → silence, source réelle → deux retours à la normale, rejouée → silence, aucun marqueur restant ; aucune ligne `✗` d'envoi Telegram. `systemctl start plages-cloudflare.service` → `Result=success` | 2026-10-17 | `plages-cloudflare --etat` ; `systemctl list-timers plages-cloudflare.timer` ; `journalctl -u plages-cloudflare.service` |
| Sous-réseau de `dokploy-network` | `10.0.1.0/24` (overlay) — tête de `TRUSTED_PROXIES` | 2026-09-14 | `docker network inspect dokploy-network -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'` |
| IP du client jusqu'à Laravel | prouvée par ablation sur `preview.api.takussan.com` (DNS seul) : liste = `203.0.113.7` → `403 Source IP not allowed` avec **et** sans `X-Forwarded-For: 203.0.113.7` ; liste = IP du poste → le filtre laisse passer. La clé est ensuite retirée | 2026-09-14 | plan, tâche D5, étape 4 |
| IP du visiteur sur le chemin serveur Next → API | **mesurée, un réseau** : `API_INTERNAL_URL` (`http://takussan-api-preview:8080`) et `VISITOR_IP_TRUSTED_HOPS=2` posées sur `takussan-web-preview` et lues par le conteneur ; relevé d'ADR-0052 § 6 le 2026-10-18, depuis le poste du porteur (un réseau), 66 s entre deux expériences : avec `h = 1`, 3 rendus de `/fr/properties` → 0 pour l'IP du poste, l'IP forgée et celle du VPS (l'API comptait le nœud Cloudflare) ; avec `h = 2`, 3 rendus → 3 pour l'IP du poste, 2 rendus portant `X-Forwarded-For: 203.0.113.7` → 2 pour l'IP du poste et 0 pour l'IP forgée, 0 pour le VPS ; témoin, 2 appels directs de l'API → 2 dans les deux états. Reste un second réseau (TCK-720) | 2026-10-18 | ADR-0052 § 6 : rendus de `/fr/properties` avec l'authentification basique, puis le compteur `public-read` de chaque IP lu par `tinker` |
| Port 3000 | fermé à tous : `000` depuis le poste, `200` depuis le serveur ; `:8080` non publié | 2026-09-14 | plan, tâche A3, étape 6 |
| Zones Cloudflare | `takussan.com`, `checkprintplus.com` : SSL Full (strict), *Always Use HTTPS* désactivé | 2026-09-14 | `GET /zones/<id>/settings/ssl` |
| *Bot Fight Mode* | **désactivé** dans les deux zones ; *Browser Integrity Check* actif (il ne gêne ni la preuve `curl` d'`images.yml`, ni les API en DNS seul). Le jeton ne lit pas ce réglage (erreur `10000`) : vérifié au tableau de bord par le porteur | 2026-09-14 | Security → Settings → *Bot traffic* |
| Notifications de Dokploy | canal Telegram ; événements : échec de build, sauvegardes (bases, volumes, Dokploy), nettoyage Docker, redémarrage de Dokploy — pas les déploiements. ⚠ **Jamais reçues, mesuré le 2026-09-14 (TCK-519)** : le *Chat ID* enregistré est le `@username` du bot lui-même, et l'API répond `403 Forbidden: the bot can't send messages to the bot` ; `getUpdates` est vide, le bot n'a jamais reçu un message. **Corrigé le 2026-09-15, 00:08 Z** : le porteur a écrit au bot, `getUpdates` a rendu la conversation privée (identifiant numérique à 10 chiffres), posé sur le serveur dans `/etc/default/seuils` **et** dans la table `telegram` de Dokploy (colonne `chatId`, relue à chaque envoi, sans redémarrage) — sans transiter par le poste ; `sendMessage` → `"ok":true`. ⚠ *Server Threshold* n'existe pas en auto-hébergé : le formulaire ne l'affiche que sous Dokploy Cloud (`isCloud`, relu dans le source de la v0.30.6). Les seuils du budget sont donc surveillés par `seuils.timer` (ligne ci-dessous), pas par Dokploy | 2026-09-15 | `notification.all` ; sur le serveur, `. /etc/default/seuils; curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"` |
| Commande de déploiement des Compose | champ *Command* du service, posé le 2026-09-14, 22:36 Z par `compose.update` (TCK-522) — Takussan : `compose -p takussan-api-preview-4iza80 --env-file deploy/takussan/.env -f ./deploy/takussan/compose.api.yml run --rm release && docker compose -p takussan-api-preview-4iza80 --env-file deploy/takussan/.env -f ./deploy/takussan/compose.api.yml up -d --build --remove-orphans`. Dokploy l'exécute en `docker ${command}` ; `&&` admis entre commandes `docker compose`, `;` `\|` `$` `(` `)` refusés (source v0.30.6, `builders/compose.ts`). `release` tourne deux fois par déploiement, le second ne migre ni ne réimporte rien (`Nothing to migrate`, `forme des index inchangée`, `done` en 10 s). ⚠ Hors dépôt : à reposer après toute recréation d'un service Compose (runbook, étape 9) | 2026-09-14 | `compose.one` → `command` ; journal de déploiement, encadré « Executing command » |
| Déploiement en échec | **Prouvé le 2026-09-14, 22:36 Z (TCK-522) : un `release` qui échoue laisse l'ancienne API servir — grâce à la commande ci-dessus, PAS à `depends_on`.** `DB_PASSWORD` altéré dans *Environment*, *Deploy* : déploiement `error` en moins de 15 s, journal `SQLSTATE[08006] … password authentication failed` puis `Error: ❌ Docker command failed`, aucune ligne `Recreate` ; pendant et après, conteneur `api` `16035eee79e6…` inchangé et `healthy`, `/up` → `200`, `X-Build-Sha` = `ad93e5e6…` inchangé, `worker`, `worker-media`, `scheduler` `Up`. Environnement restauré à l'identique, déploiement suivant `done`. ⚠ Avec le `up -d --build` par défaut, mesuré en local le même jour : Compose retire l'ancien `api` et crée le neuf **avant** de lancer `release` ; `release` en échec, tout reste `Created`, `/up` → `000`. **Notification** : Dokploy appelle `sendBuildErrorNotifications` (événement « échec de build », Compose compris), mais son envoi Telegram est un `fetch` dont la réponse n'est jamais lue : le `403` du *Chat ID* faux (ligne « Notifications », corrigé le 2026-09-15) n'a laissé **aucune trace** dans `docker service logs dokploy`. Un échec ne se voit donc qu'à l'interface, et dans `images.yml` | 2026-09-14 | `deploy/takussan/smoke-api.sh pile` (étape « release en échec ») ; sur la préproduction : `compose.update` (`env`), `compose.deploy`, `docker ps -a --no-trunc --filter name=takussan-api-preview-4iza80-api-1`, `curl -sSD - -o /dev/null https://preview.api.takussan.com/up` |
| Protection des branches | `preview` et `master` (TCK-524, posée le 2026-09-14, 22:51 Z par `gh api -X PUT …/branches/<b>/protection`, corps dans le ticket) : PR obligatoire à zéro réviseur, **six checks requis** — `API / lint-and-test`, `API / Rollback des migrations sur PostgreSQL 17 (le code que rien d'autre n'exécute)`, `API / Image de l'API (construite, pas poussée)`, `Front / Web (ESLint + tsc + Vitest + build)`, `Front / Image du front (construite, pas poussée)`, `Dépôt / Gardes documentaires` — les jobs que `promotion-ci.yml` rejoue en entier sur toute PR vers ces branches ; `enforce_admins`, `strict: false`, ni force-push ni suppression. Ablation : `git push origin HEAD:preview` → `protected branch hook declined`, `preview` inchangée. ⚠ `dev` reste sans protection : le step de la carte d'impact (TCK-479) y pousse avec le `GITHUB_TOKEN`. Aucun *ruleset* (`rulesets` → `[]`) | 2026-09-14 | `gh api repos/thiambara/takussan/branches/preview/protection -q .required_status_checks.contexts` ; `…/master/protection` ; `gh api repos/thiambara/takussan/rulesets` |
| Surveillance externe | UptimeRobot (compte du porteur, version gratuite) : `https://preview.api.takussan.com/up`, `https://deploy.takussan.com/` (la sonde de `preview.api.checkprintplus.com` est à retirer au tableau de bord : l'hôte n'existe plus depuis le 2026-10-04), toutes les 5 minutes. Mesuré sur le serveur : deux adresses de la liste publique d'UptimeRobot, 6 connexions en 380 s sur les deux API en DNS seul ; `deploy.takussan.com` passe par Cloudflare et ne se voit qu'au tableau de bord. L'échéance des certificats n'est pas dans la version gratuite : `certificats.yml` la tient | 2026-09-14 | `tcpdump` des SYN sur `:443`, rapprochés de `https://uptimerobot.com/inc/files/ips/IPv4.txt` |
| Surveillance des seuils du budget | `seuils.timer` toutes les 5 minutes → `/usr/local/sbin/seuils` (`deploy/server/seuils.sh`, TCK-519) : mémoire disponible ≥ 1 500 Mo, disque < 75 %, `st` < 10, Dokploy < 1 536 Mo ; une alerte Telegram par **franchissement**, un message de retour, silence sinon. **Ablation jouée le 2026-09-15, 00:09 Z, reçue sur Telegram** : `SEUIL_MEM_MO=100000 seuils` alerte, rejoué se tait, `seuils` annonce le retour, rejoué au repos se tait — exactement deux messages. ⚠ **Arrêter `seuils.timer` pendant l'ablation** (`systemctl stop seuils.timer`, puis `start`) : à 00:08 Z il est passé entre deux commandes, a annoncé le retour à la normale et retiré le marqueur, et la seconde commande a alerté de nouveau — quatre messages, qui décrivent le timer, pas le script. Secrets dans `/etc/default/seuils` (600), unités posées par `bootstrap.sh` § 7 | 2026-09-15 | `systemctl list-timers seuils.timer` ; `seuils --etat` ; `journalctl -u seuils.service` |
| Journaux d'accès | **Traefik, une ligne JSON par requête sur stdout de `dokploy-traefik`** (TCK-518) : adresse cliente reconstruite (`ClientHost` — mesuré : l'IP du poste à travers Cloudflare **et** sur un hôte en DNS seul avec un `X-Forwarded-For: 203.0.113.7` forgé), hôte, méthode, chemin, statut, durée, routeur, `User-Agent`. **Aucun autre en-tête** : `Authorization` et `Cookie` sont écartés (`headers.defaultMode: drop`, mesuré sur un 401). ⚠ `ClientUsername` porte le nom d'utilisateur de l'authentification basique, jamais le mot de passe. Borné par la rotation de `daemon.json` (`10m × 3`, relu sur le conteneur). Les conteneurs `api` n'écrivent toujours rien par requête, et c'est voulu. Avant ce jour : aucun journal, la présence d'un client se mesurait en direct (`tcpdump`) | 2026-09-14 | `docker logs --since 10m dokploy-traefik \| jq -c 'select(.RequestHost=="preview.api.takussan.com") \| {ClientHost,RequestPath,DownstreamStatus,Duration}'` ; posé par `deploy/server/journaux-traefik.sh` |
| Nettoyage Docker quotidien | actif | 2026-09-14 | `settings.getWebServerSettings` → `enableDockerCleanup` |
| Budget au repos | Takussan seule, après seed (02:04 Z) : 5 697 Mo disponibles sur 7 941, `st` 0, disque 24 %. Les deux préproductions servies (11:03 Z) : **5 349 Mo**, `st` 0, disque 25 %. Dokploy seul : 867 puis 1 013 Mo, **sans plafond** | 2026-09-14 | plan, tâche D6, étape 4 ; détail par conteneur au § Budget du plan |
| Médias de la préproduction Takussan | **Sur R2 depuis le 2026-09-22 (TCK-541, ADR-0029)** : `takussan-preview-private` 3 444 objets, 201,4 Mo (originaux des photos) ; `takussan-preview-media` 10 660 objets, 483,1 Mo (conversions, 81 avatars, 4 logos). `media:move-disk public --to-declared` : 3 529 médias, 14 104 fichiers, 0 échec ; `local --to-declared` : 0. Les 3 529 répertoires de `storage/app/public` supprimés ensuite (une ancienne URL d'original → `403`). Reste au volume : `seed-media-cache` (209 Mo, le cache de téléchargement du seed, régénérable). Avant : 948 Mo dans le volume (2026-09-14) | 2026-09-22 | liste des deux seaux (SigV4, jeton `takussan-preview-app`) ; `media:move-disk public --to-declared --dry-run` → `would move 0` |
| Destination des sauvegardes | seau R2 `vps-sauvegardes` (Cloudflare, région `auto`), jeton limité au seau : liste `200`, liste des seaux `403` ; *Test Connection* réussi. **Verrou de rétention de 7 jours sur tout le seau depuis le 2026-10-18** (TCK-548, ADR-0069 § 5) : avec chacun des deux jetons qui y écrivent depuis le VPS (destination Dokploy, `takussan-preview-backup`), effacer ou écraser un objet de moins de 7 jours — une sonde comme le dump le plus récent — rend `ObjectLockedByBucketPolicy`. Même verrou sur `takussan-wal`. Le lever : tableau de bord R2 → seau → *Settings* → *Bucket lock rules*, ou `PUT /accounts/<compte>/r2/buckets/vps-sauvegardes/lock` avec `{"rules":[]}` | 2026-10-18 | `GET /accounts/<compte>/r2/buckets/<seau>/lock` (API Cloudflare) ; épreuve de TCK-548 |
| Sauvegardes planifiées | `takussan_preview` `0 3 * * *`, 14 exemplaires ; volume `takussan-api-preview-4iza80_storage` `0 4 * * *`, 7 — ramené à 1 le 2026-09-21, **désactivé le 2026-09-22** (TCK-541) : les médias n'y sont plus ; sa dernière archive (2026-09-22, 04:00, 902 Mo) reste dans `vps-sauvegardes` comme point de retour d'avant la bascule. Une manuelle de chaque, **lue dans R2** : 1 729 580 o, 27 683 o (après `ProductionSeeder`), 945 797 120 o. **Sous le verrou** (2026-10-18) : une manuelle de `takussan_preview` à 18:59 laisse 14 exemplaires, celui du 2026-10-05 supprimé par la rotation ; ⚠ réactiver la sauvegarde du volume demande **au moins 8 exemplaires**, sinon sa rotation vise un objet de moins de 7 jours, refusé | 2026-09-14, 2026-10-18 | liste du seau (ci-dessous), pas la liste de Dokploy |
| Fraîcheur des sauvegardes de base | `fraicheur-sauvegardes.timer`, à 06:00 et 18:00 (heure du serveur, CEST) → `/usr/local/sbin/fraicheur-sauvegardes` (`deploy/server/fraicheur-sauvegardes.sh`, TCK-884, P42.04) : relit dans R2 la dernière sauvegarde de `takussan_preview` (lecture seule, jeton des sauvegardes) ; alerte Telegram par franchissement si elle a plus de 26 h, pèse moins de 1 Mo ou moins de la moitié de la précédente. **Installé le 2026-10-18, 06:42 UTC** (`sha256` identique au dépôt, `1984b61e…`). `--etat` → `2026-10-18 03:00:06 UTC (3 h), 3086349 o` ; un préfixe inexistant → « aucune sauvegarde lisible ». **Ablation jouée, timer arrêté, `ENVOI=0`** (rien n'est parti sur Telegram) : `AGE_MAX_H=1` → une alerte, marqueur posé ; rejouée → silence ; sans la variable → un retour, marqueur retiré ; rejouée → silence ; `TAILLE_MIN_O=999999999` → alerte, puis retour ; aucun marqueur restant. Les sauvegardes du 2026-10-05 au 2026-10-18 pèsent de 2,0 à 3,1 Mo, une par nuit à 03:00 UTC | 2026-10-18 | `fraicheur-sauvegardes --etat` ; `systemctl list-timers fraicheur-sauvegardes.timer` ; `journalctl -u fraicheur-sauvegardes.service` |
| Copie du seau privé des médias | `sauvegarde-seau-prive.timer`, chaque nuit à 02:30 → `/usr/local/sbin/sauvegarde-seau-prive` (`deploy/server/sauvegarde-seau-prive.sh`, TCK-541) : `rclone copy` (jamais `sync` : un objet supprimé du seau reste dans la sauvegarde) de `takussan-preview-private` vers `vps-sauvegardes/takussan-preview-private/`, côté serveur. Premier passage : 3 444 objets, 201,4 Mo ; second : `There was nothing to transfer`, 3 444 vérifiés en 1 min 16 s. **Restauration à blanc** : `1082/f4e7dd7a….jpg` relu des deux côtés, même md5 (`6a36948f…`, 42 694 o). **Échec forcé** (`SOURCE=takussan-seau-inexistant`) : code 1, erreur au journal, **alerte reçue sur Telegram** (confirmé par le porteur). Jeton `takussan-preview-backup` (lecture du seau privé, écriture dans `vps-sauvegardes`), limité à l'IP du VPS (`178.18.247.62`, *Client IP Address Filtering*) le 2026-09-22 : refusé (`AccessDenied`) depuis le poste, accepté depuis le serveur. Il garde l'écriture sur le seau privé — un jeton de compte R2 n'a qu'UN type de permission pour tous ses seaux, « lecture ici, écriture là » est impossible (relevé par le porteur) — et c'est sans effet : le jeton de l'application, sur le même VPS, a déjà cette écriture, et `rclone copy` ne l'utilise pas. Le risque qui reste est l'inverse : un VPS compromis peut effacer `vps-sauvegardes` ; la parade est une règle de rétention (*Bucket Lock*) sur ce seau, non posée. Secrets dans `/etc/default/sauvegarde-seau-prive` (600), unités posées par `bootstrap.sh` § 8. Le seau public n'est pas copié : conversions régénérables depuis le privé, avatars et logos seulement | 2026-09-22 | `systemctl list-timers sauvegarde-seau-prive.timer` ; `journalctl -u sauvegarde-seau-prive -o cat` ; `sauvegarde-seau-prive --essai` |
| File de la préproduction et délai de reprise | `QUEUE_CONNECTION=database` ; `DB_QUEUE_RETRY_AFTER` **non posée** dans Dokploy, donc `retry_after` = 90 s (défaut de `config/queue.php`), relu dans le conteneur. **Strictement au-dessus du `$timeout` de 75 s** de `RegenerateAgencyWatermarksJob` et `RegeneratePhotoConversionsJob` (TCK-539, V5-1) : à reposer au-dessus de 75 s si on pose un jour la clé | 2026-09-22 | `php artisan tinker` : `config('queue.default')`, `config('queue.connections.database.retry_after')` |
| Sauvegarde de la configuration de Dokploy | `web-server`, `30 4 * * *`, **10 exemplaires depuis le 2026-10-18** (7 avant) : avec 7, la rotation quotidienne vise l'exemplaire de 6 j 23 h 59, que le verrou de 7 jours refuse (TCK-548). Une manuelle lue dans R2 : `…/dokploy/webserver-backup-<date>.zip`, 94 409 314 o ; une autre le 2026-10-18 à 18:59, 8 exemplaires ensuite, statut `done` | 2026-09-14, 2026-10-18 | `backup.manualBackupWebServer` |
| Clés des objets dans R2 | Dokploy fait **précéder** le préfixe déclaré du nom interne du service : `serveur-postgres-egr6ii/postgres/takussan_preview/<date>.sql.gz`, `takussan-api-preview-4iza80_api/volumes/takussan-preview/…tar`, `backup-parse-multi-byte-card-vlwhry/dokploy/…zip`. Une liste filtrée sur le seul préfixe déclaré ne trouve **rien** | 2026-09-14 | `GET …/vps-sauvegardes?list-type=2` (SigV4) |
| Restauration à blanc | PostgreSQL : diff des comptes **vide**, 92 tables, 86 927 lignes (préproduction arrêtée) ; volume de médias : 17 629 fichiers, **même** `sha256` | 2026-09-14 | plan, tâche D6, étapes 2 et 3 ; ticket TCK-515 |
| Restauration à blanc, **lue** | Sur le serveur, la dernière sauvegarde (2026-10-18, 03:00 Z, 3 086 349 o) est restaurée dans un conteneur jetable `pgvector/pgvector:pg17`, joint à `dokploy-network` avec un mot de passe tiré au hasard. Restauration en 11 s, sans erreur, 116 tables sur 116. Les comptes sont égaux, sauf `jobs`, `scheduled_task_runs` et `property_boost_daily_stats` : la préproduction n'était pas arrêtée et a eu de l'activité depuis 03:00. `backup:verify-encryption --connexion=restau`, lancé dans `takussan-api-preview-4iza80-api-1` (image `b2804272`), **sort en 0** : 39 valeurs chiffrées relues dans 20 colonnes, toutes déchiffrées. Avec `--cle-fausse`, **il sort en 1** : 39 sur 39 illisibles. Le conteneur et le dossier ont été retirés après | 2026-10-18 | TCK-882, AC2 |
| `APP_KEY` hors du serveur | préproduction : empreinte **`e3227fc80eb0`** (12 premiers caractères du `sha256`). Une copie hors du VPS existe, avec la **même** empreinte : le fichier de secrets du poste du porteur. À ranger dans son gestionnaire de mots de passe (décision du 2026-10-18, ADR-0044 amendement C, P42.02). Production : clé créée et rangée en F3, avant le premier déploiement | 2026-10-18 | `docker exec takussan-api-preview-4iza80-api-1 sh -c 'printf %s "$APP_KEY" \| sha256sum \| cut -c1-12'` — n'imprime qu'une empreinte |

Projets Dokploy :

- **Serveur** : l'infrastructure partagée (Compose `donnees`, `postgres`), dans son environnement
  par défaut ;
- **Takussan** : deux environnements depuis le 2026-10-17 (ADR-0069 § 1, TCK-830).
  - **`preview`** porte le Compose `takussan-api-preview` et l'Application `takussan-web-preview`.
    Ils ont été **déplacés** depuis `production`, où l'installation les avait rangés, sans être
    recréés : mêmes identifiants, même nom interne, même volume.
  - **`production`**, l'environnement par défaut, est vide jusqu'à la phase F. La production s'y
    crée sur la table de F3, jamais par `environment.duplicate`, qui recopierait les secrets de la
    préproduction.

**Ce que GitHub garde pour déployer, depuis ADR-0069 § 2 (TCK-832)** : aucun environnement GitHub
(le dernier, `Preview`, est supprimé le 2026-10-18),
seulement des secrets et variables de **dépôt**, préfixés par l'environnement Dokploy, de quoi
déclencher et prouver, rien de la configuration des services :

| Nom | Genre | Rôle |
|---|---|---|
| `DOKPLOY_URL` | variable | l'URL de Dokploy |
| `DOKPLOY_API_KEY` | secret | déclenche le Compose de l'API (`compose.deploy`) : son webhook exige une charge utile de push GitHub (« Branch Not Match » sans elle, mesuré le 2026-10-18) |
| `PREVIEW_DOKPLOY_API_COMPOSE_ID` | variable | le Compose à déployer |
| `PREVIEW_DOKPLOY_WEB_WEBHOOK` | secret | le webhook Dokploy de `takussan-web-preview` (`/api/deploy/<refreshToken>`) : il ne déploie que ce service, et se déclenche sans charge utile (200, mesuré le 2026-10-18) |
| `PREVIEW_API_URL`, `PREVIEW_SITE_URL` | variables | où `images.yml` prouve ce qui est servi |
| `PREVIEW_BASIC_AUTH` | secret | le compte `ci` de l'authentification basique |

Les identifiants se relisent par `project.all` ou `environment.byProjectId`, jamais recopiés ailleurs
que là.

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
  les douze `SEED_*` (dont `SEED_DOWNLOAD_MEDIA=true` : le seed télécharge des médias) ;
- ajoutées le 2026-09-22 par TCK-541 (ADR-0029), **80 clés** au total : `MEDIA_PUBLIC_DISK`
  (`r2-media`), `MEDIA_PRIVATE_DISK` (`r2-private`), `MEDIA_QUEUE`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY` (le jeton `takussan-preview-app`, *Object Read & Write* limité aux deux
  seaux de préproduction ; refusé sur `vps-sauvegardes`, mesuré), `R2_ENDPOINT`, `R2_MEDIA_BUCKET`,
  `R2_MEDIA_URL` (`https://media-preview.takussan.com`), `R2_PRIVATE_BUCKET`.
- ajoutées le 2026-10-10 par TCK-620 (ADR-0060), **82 clés** au total : `PHONE_LOGIN_ENABLED`
  (`true` : connexion et inscription par téléphone) et `OTP_PREVIEW_ENABLED` (`true` : le code SMS
  revient dans la réponse, `otp_preview`, et le front l'affiche — sans effet hors `APP_ENV`
  `local`/`staging`). ⚠ **À éteindre avant que la préproduction reçoive des données réelles** :
  qui joint l'API y entre dans tout compte dont il connaît le numéro vérifié.

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

**À poser par le porteur — TCK-598, ADR-0052** (ni Dokploy ni Vercel ne les portaient au 2026-10-08 ; re-mesuré le 2026-10-18 : seule `API_INTERNAL_URL` est posée, sur `takussan-web-preview`) :

- `takussan-api-preview` : `PUBLIC_CACHE_REVALIDATE_URL`
  (`https://preview.takussan.com/api/revalidation/fiche`) et `PUBLIC_CACHE_REVALIDATE_SECRET`. Vides,
  aucune révocation ne part : une fiche dépubliée reste servie jusqu'à 300 s ;
- `takussan-web-preview` (variables d'**exécution**, lues par le serveur Next, jamais inlinées) :
  `PUBLIC_CACHE_REVALIDATE_SECRET` (le même que l'API ; vide, le handler refuse tout en 401),
  `API_INTERNAL_URL` (`http://takussan-api-preview:8080`, l'alias de l'API de préproduction sur
  `dokploy-network` : jamais l'hôte `api`, que chaque pile y déclare — ADR-0069 § 4, TCK-880 ;
  **posée le 2026-10-18**) et
  `VISITOR_IP_TRUSTED_HOPS` (`2` : Cloudflare puis Traefik — **posée et mesurée le 2026-10-18**,
  depuis un réseau, voir le relevé ci-dessus). Sur Vercel (`www`, jusqu'au 2026-10-15), `VISITOR_IP_TRUSTED_HOPS=1` et pas
  d'`API_INTERNAL_URL`.

**`takussan-web-preview`** (Application) : depuis ADR-0069 § 3, l'image ne porte plus rien de
l'environnement, et le conteneur **refuse de démarrer** sans trois variables d'exécution, origines
seules : `API_URL` (`https://preview.api.takussan.com`), `SITE_URL` (`https://preview.takussan.com`)
et `MEDIA_URL` (`https://media-preview.takussan.com`). **Posées le 2026-10-18** au niveau du
service (`application.saveEnvironment`, relues) ; elles s'appliquent au déploiement suivant. ⚠ Sur
un nouvel environnement, les poser AVANT le premier déploiement : sinon le nouveau conteneur sort en
erreur, Swarm garde l'ancien, et la preuve d'`images.yml` rougit sur l'ancien commit. Une
authentification basique (Traefik, onglet *Security* de l'Application) à **trois comptes** depuis le
2026-09-14 (TCK-525) : ceux du porteur, et le compte **`ci`**, dont `ci:motdepasse` est le secret
de dépôt `PREVIEW_BASIC_AUTH` — la preuve d'`images.yml` ne dépend plus
d'un mot de passe humain. Le mot de passe de `ci` vit dans le secret GitHub et dans le trousseau
macOS du poste (`security find-generic-password -s takussan-preview-ci -w`), nulle part ailleurs.

## Runbook

**Tester une image en local, avant de pousser** :

```bash
docker build --build-arg BUILD_SHA=smoke --target runtime -t ghcr.io/thiambara/takussan-api:local takussan-api
docker build --build-arg BUILD_SHA=smoke --target seed -t ghcr.io/thiambara/takussan-api:local-seed takussan-api
deploy/takussan/smoke-api.sh image      # l'image seule
deploy/takussan/smoke-api.sh pile       # la pile Compose, contre les services de docker-compose.yml
deploy/takussan/smoke-web.sh            # l'image du front (exige ./dev.sh api)
```

**Donner l'accès à une préproduction à un testeur, puis le retirer** (TCK-525) : Dokploy →
Application `takussan-web-preview` → *Security* → *Add Security* : un nom, un
mot de passe généré (`openssl rand -base64 24`), jamais le compte `ci` ni celui du porteur. Le
middleware Traefik est réécrit à l'instant (`createSecurityMiddleware`, mesuré : `200` six secondes
après l'appel, sans redéploiement). Retirer : la corbeille sur la ligne du compte. Par l'API, le même
geste : `security.create` `{applicationId, username, password}`, `security.delete` `{securityId}` ;
les comptes se relisent par `application.one` → `security[].username`. Preuve, code seul et jamais
l'URL effective : `curl -sS -o /dev/null -w '%{http_code}' -u testeur:… https://preview.takussan.com/robots.txt`
→ `200`, puis `401` une fois retiré. Changer le mot de passe du porteur ne touche plus la CI ; changer
celui de `ci` demande de reposer le secret de dépôt, par un script qui ne l'affiche pas : `gh secret set PREVIEW_BASIC_AUTH` lit sa valeur sur l'entrée standard.
Option non décidée : Cloudflare Access à la place de l'authentification basique (le compte `ci`
deviendrait un *service token*) — à peser avant la production, pas avant.

**Redéployer** : pousser sur `preview` (ou `workflow_dispatch` de *Images et déploiement*). Une image
dont l'arbre (`git rev-parse HEAD^{tree}`) a déjà son étiquette `tree-<arbre>` est réétiquetée sur le
registre, pas reconstruite (ADR-0069 § 3). Le workflow n'est vert que lorsque `X-Build-Sha` rend le
commit, ou un commit de même arbre : celui qui a construit l'image réétiquetée. Dokploy joue la commande en deux temps
du relevé : `release` par `run`, puis `up` seulement s'il a réussi — un `release` en échec laisse
l'ancienne pile servir et le déploiement passe `error` (relevé, ligne « Déploiement en échec »).

⚠ **Sauf tant que l'environnement n'est pas raccordé à Dokploy** : si une des variables
`DOKPLOY_URL`, `<PREFIXE>_DOKPLOY_API_COMPOSE_ID` ou un des secrets `DOKPLOY_API_KEY`,
`<PREFIXE>_DOKPLOY_WEB_WEBHOOK` manque, le job *Déploiement et preuve* s'arrête tôt, **en
vert**, sur la notice « Dokploy n'est pas raccordé à « preview » : images poussées, rien déployé. »
(premier passage réel le 2026-09-14, run `34792488601`). Un vert de ce workflow ne prouve un
déploiement que si son journal porte la preuve `X-Build-Sha`, pas cette notice.

**Revenir en arrière** : Dokploy → Compose de l'API → Environment → `IMAGE_TAG=sha-<commit>` →
*Deploy*. Front : Application → image `…:sha-<commit>` → *Deploy* (jusqu'au 2026-10-18 :
`…:preview-sha-<commit>`). Ou, sans toucher Dokploy, réétiqueter :
`docker buildx imagetools create -t ghcr.io/thiambara/takussan-web:preview ghcr.io/thiambara/takussan-web:sha-<commit>`,
puis *Deploy*. ⚠ Une migration déjà
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

**Avant une migration irréversible** (piste P42.01, TCK-883). Une migration dont le `down()` ne
rend pas les données (colonne ou table supprimée, valeurs réécrites, `down()` qui lève) ne part sur
`preview` — et demain sur `master` — qu'après une sauvegarde **manuelle** de la base : Dokploy →
service Database → Backups → *Run manual backup*, puis l'objet **relu dans R2**, sous le préfixe
réel (`serveur-postgres-…/postgres/<base>/`, voir le relevé), de taille non nulle. `release.sh`
migre sans sauvegarde préalable, et la sauvegarde nocturne peut avoir 24 h. **Depuis le
2026-10-18, WAL-G archive les journaux** (TCK-930) : noter aussi l'heure UTC de la fusion de la PR
de promotion ; la marche arrière la plus fine est la restauration à cet instant (runbook « WAL-G »
ci-dessous), la sauvegarde manuelle restant la copie lisible sans WAL-G.
Les migrations d'une promotion se lisent dans son diff : `git diff --stat origin/preview...origin/dev -- takussan-api/database/migrations`.

**Restaurer une base** : Dokploy → service Database → Backups → *Restore*, depuis R2. La restauration
à blanc (plan, tâche D6, étape 2) a été jouée **hors** Dokploy, sur le poste, le 2026-09-14 ; ses
comptes sont dans TCK-515. **Depuis le 2026-10-18, la copie doit aussi se lire** (ADR-0028 § 7
amendé, TCK-882) : `php artisan backup:verify-encryption --connexion=<copie>`, lancé avec l'`APP_KEY`
de l'environnement, sort en `0` ; avec `--cle-fausse`, en `1`. Des comptes justes sous une clé
fausse sont une restauration ratée : chaque colonne chiffrée est perdue. Deux pièges payés le
2026-09-14 :

- la sauvegarde PostgreSQL s'appelle `.sql.gz` mais contient une archive **custom**
  (`pg_dump -Fc | gzip`) : `gunzip | psql` ne charge rien, et ne l'écrit pas. `gunzip`, puis
  `pg_restore --no-owner --no-acl`. Celle de MySQL est bien du SQL compressé ;
- une préproduction « au repos » écrit (`jobs`, `scheduled_task_runs`) : pour comparer, on l'arrête
  (hors base) avant la sauvegarde, et on la redémarre après le comptage.

**WAL-G : l'archivage continu et la restauration à un instant choisi** (ADR-0069 § 5, TCK-930).
La base tourne sur `ghcr.io/thiambara/takussan-postgres:sha-<commit>` (`deploy/postgres/`), qui
archive chaque segment de journal dans `takussan-wal` ; une sauvegarde de base part le dimanche à
03:30, l'élagage garde 14 jours, et `wal-g-takussan veille` alerte sur Telegram. Le `pg_dump` de
03:00 reste.

- **Configuration** : dans l'environnement du service Database de Dokploy (clés seules ici) —
  `WALG_S3_PREFIX` (`s3://takussan-wal/serveur-postgres`), `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY` (le jeton `takussan-wal`, qui n'écrit que là), `AWS_ENDPOINT`
  (`https://<compte>.r2.cloudflarestorage.com`), `AWS_REGION=auto`, `AWS_S3_FORCE_PATH_STYLE=true`,
  `WALG_COMPRESSION_METHOD=zstd`, `WALG_PREVENT_WAL_OVERWRITE=true` — ce dernier n'est pas
  facultatif : sous le verrou de rétention, un segment renvoyé serait refusé à l'écrasement et
  bloquerait l'archivage, alors qu'avec lui WAL-G constate l'identité et rend 0.
- **Changer l'image** (une version de WAL-G, de PostgreSQL ou de pgvector) : PR qui touche
  `deploy/postgres/`, fusion, puis l'étiquette `sha-` poussée par `image-postgres.yml` se déclare
  dans Dokploy (service Database → Advanced → Docker image) et se redéploie. **Toutes les bases
  du serveur redémarrent** (quelques secondes) : hors heure de passage.
- **Installer les unités** : `scp deploy/server/wal-g.sh root@178.18.247.62:/usr/local/sbin/wal-g-takussan`,
  puis `bootstrap.sh` (§ 11) ou les unités de ce paragraphe à la main. `wal-g-takussan etat`
  imprime l'archivage et les sauvegardes de base sans alerter.
- **Restaurer à un instant** (UTC), sur une instance vierge — jamais sur la base en service :
  ```bash
  # dans un conteneur jetable de la même image, avec le même environnement WAL-G
  wal-g backup-fetch "$PGDATA" LATEST     # la dernière sauvegarde de base AVANT l'instant
  printf '%s\n' "restore_command = 'wal-g wal-fetch %f %p'" \
    "recovery_target_time = '<AAAA-MM-JJ HH:MM:SS+00>'" "recovery_target_action = 'promote'" \
    >> "$PGDATA/postgresql.auto.conf"
  touch "$PGDATA/recovery.signal"
  postgres -c archive_mode=off           # off : la copie n'écrit pas sa chronologie dans l'archive
  ```
  Puis le critère d'ADR-0028 § 7 : les comptes, la dernière ligne écrite avant l'instant, et
  `backup:verify-encryption` sur la copie. Si `LATEST` est postérieure à l'instant visé,
  `backup-fetch` prend la sauvegarde nommée par `wal-g backup-list` qui le précède.

**Après une restauration** (piste P42.05, TCK-883). Une restauration rend la base, pas ce qui vit
autour d'elle. Dans l'ordre, sur la pile de l'environnement (`<pile>` = `takussan-api-preview-4iza80`) :

1. **Avant** de restaurer : arrêter `worker`, `worker-media` et `scheduler`
   (`docker stop <pile>-worker-1 <pile>-worker-media-1 <pile>-scheduler-1`), et noter
   l'**instant restauré** en UTC (l'heure de la sauvegarde, par exemple `2026-10-18T03:00:00Z`).
   Les effacements n'ont plus à se relever dans la base courante : depuis TCK-885, chacun écrit un
   objet hors de la base (point 5), et la base courante peut être perdue.
2. **La file** : les jobs en attente à l'instant restauré sont dans la copie, et seraient rejoués
   (SMS, courriels déjà partis). `SELECT queue, count(*) FROM jobs GROUP BY 1`, puis
   `DELETE FROM jobs` sauf décision contraire : les tâches planifiées se reposent d'elles-mêmes, et
   une conversion de média perdue se régénère (`media:regenerate-property-conversions`).
3. **Les jetons et les sessions** : un jeton révoqué après l'instant restauré redevient valide.
   `DELETE FROM personal_access_tokens`, puis vider le Redis **de la pile**
   (`docker exec <pile>-redis-1 redis-cli FLUSHALL`) : sessions, cache et verrous. Tout le monde se
   reconnecte. Depuis TCK-880, ce Redis n'appartient qu'à cet environnement.
4. **La recherche** : le marqueur `storage/app/private/.search-shape-importee` vit dans le volume,
   que la restauration ne touche pas ; `release` ne réimporterait rien. Le supprimer
   (`docker exec <pile>-api-1 rm storage/app/private/.search-shape-importee`), puis rejouer
   `release` (commande du runbook) : il réimporte tous les index.
5. **Les effacements** (TCK-885, ADR-0044 amendé, § B) : la liste vit **hors de la base**, un
   objet par effacement exécuté sur le seau privé des médias
   (`effacements/AAAA-MM-JJ/<user_id>-<instant>.json`, l'identifiant et l'instant, rien d'autre),
   que la restauration ne touche pas. La lire, puis ré-effacer :

   ```bash
   docker exec <pile>-api-1 php artisan account:list-erasures --since='<instant>'
   docker exec <pile>-api-1 php artisan account:list-erasures --since='<instant>' --execute
   ```

   La première dit, pour chaque effacement à partir de l'instant (inclus), ce qu'en garde la base
   restaurée : `effacé`, `absent` (compte créé après l'instant) ou `à ré-effacer`. La seconde
   ré-efface ces derniers, par le même chemin que l'effacement d'origine, en recréant la demande
   que la restauration a emportée, sans renvoyer le courriel de confirmation ; un second passage
   rend `a_reeffacer=0`. En cas de doute sur l'instant, le prendre plus tôt : le rejeu est
   idempotent. La commande sort en `1` sur un objet illisible ou un rejeu en échec — ne pas
   rouvrir tant qu'elle ne sort pas en `0`. Puis `php artisan account:execute-deletions` pour les
   demandes de la copie devenues échues depuis l'instant.
   **Si le seau privé est perdu lui aussi**, remettre d'abord le préfixe `effacements/` depuis
   `vps-sauvegardes/takussan-preview-private/effacements/` (copie nocturne, ci-dessous
   « Restaurer un média ») : un effacement de moins de 24 h n'y est pas encore.
6. Redémarrer `worker`, `worker-media` et `scheduler`.

**Restaurer un média** (depuis le 2026-09-22) : un original ou une pièce privée se relit dans
`vps-sauvegardes/takussan-preview-private/<id>/<fichier>` et se remet à la même clé dans
`takussan-preview-private` ; les conversions se régénèrent ensuite par
`media:regenerate-property-conversions` — le seau public n'a pas de copie, c'est voulu.

**Basculer les photos en WebP** (TCK-585, une fois par environnement, après le déploiement qui
l'apporte) : les photos téléversées depuis ce déploiement le sont déjà ; les plus anciennes gardent
leurs `.jpg`, servis par Transformations, jusqu'à leur bascule. Dans le répertoire de la pile, comme
pour le seed :

```bash
docker compose -p <projet> -f compose.api.yml exec worker-media php artisan media:convert-photos-to-webp --dry-run
docker compose -p <projet> -f compose.api.yml exec worker-media php artisan media:convert-photos-to-webp
```

La commande met un job par photo en file `media`, que `worker-media` dépile. Une photo n'est
cachée que pendant son propre job, qui produit et filigrane ses trois conversions : jamais un 404,
et rien n'attend la file. ⚠ Avant le correctif du 2026-10-04, la bascule laissait le filigrane à
la file et cachait tout le catalogue de la préproduction (ADR-0029, amendement, point 5). Le `--dry-run` qui rend `0` est la preuve de fin. Le `.jpg` d'une
conversion ancienne est supprimé du seau public au passage.

**Restaurer le volume de médias** (avant le 2026-09-22 seulement) : l'archive (`tar` du contenu du volume, entrées `./…`) se lit dans
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
   ssh root@178.18.247.62 'nohup sh -c "export DOKPLOY_VERSION=v0.30.8 && curl -sSL https://dokploy.com/install.sh | sh" > /root/dokploy-install.log 2>&1 < /dev/null &'
   ssh root@178.18.247.62 'tail -3 /root/dokploy-install.log'   # jusqu'à « Dokploy is installed! »
   ssh root@178.18.247.62 "docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'"   # → dokploy/dokploy:v0.30.8@sha256:…
   ```

   ⚠ **La version se pose, elle ne se déduit pas** (TCK-526) : `install.sh` lit `DOKPLOY_VERSION`
   (relu dans le script le 2026-09-14 : sans elle, il prend la dernière *release* GitHub) et
   **installerait son propre Docker (28.5.0, sa constante `DOCKER_VERSION`) s'il n'en trouvait pas** —
   d'où l'ordre : `bootstrap.sh` d'abord, qui épingle Docker 29.8.0 et le tient par `apt-mark hold`.
   La version à poser est celle de `docs/infra/versions.json` (`dokploy.prod`), que la garde
   `check-infra-versions.mjs` compare à cette ligne-ci (R6).

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

10. Les plages Cloudflare (P37.05) — `bootstrap.sh` § 9 pose les unités, qui attendent le script :
    `scp deploy/server/plages-cloudflare.sh root@178.18.247.62:/usr/local/sbin/plages-cloudflare`.
    Sur un serveur préparé avant ce § 9 (le serveur actuel), le § 9 seul se rejoue :
    `awk '/^# ── 9\./,/^echo "✓ serveur préparé/' deploy/server/bootstrap.sh | sed '$d' | ssh root@178.18.247.62 bash`.
    Il lit les secrets Telegram de `/etc/default/seuils` (étape 8). Preuve : `plages-cloudflare
    --etat` nomme chaque conteneur `api` et rend « les 22 plages Cloudflare y sont » pour
    `traefik.yml` comme pour chaque `TRUSTED_PROXIES` ; puis l'ablation, timer arrêté comme pour
    les seuils : une source qui publie une plage de plus (`SOURCE_CF=file:///root/faux`, avec
    `ips-v4` et `ips-v6` copiés et une ligne ajoutée) doit alerter une fois, se taire au second
    passage, et `plages-cloudflare` sans la variable doit annoncer le retour. Éprouvé en local le
    2026-10-17 sur des listes et un conteneur factices.

11. La fraîcheur des sauvegardes (P42.04, TCK-884) — `bootstrap.sh` § 10 pose les unités, qui
    attendent le script :
    `scp deploy/server/fraicheur-sauvegardes.sh root@178.18.247.62:/usr/local/sbin/fraicheur-sauvegardes`.
    Sur un serveur préparé avant ce § 10, le § 10 seul se rejoue :
    `awk '/^# ── 10\./,/^echo "✓ serveur préparé/' deploy/server/bootstrap.sh | sed '$d' | ssh root@178.18.247.62 bash`.
    Il lit le jeton des sauvegardes de `/etc/default/sauvegarde-seau-prive` et Telegram de
    `/etc/default/seuils`. Preuve : `fraicheur-sauvegardes --etat` rend la dernière sauvegarde de
    chaque base, son âge et sa taille ; puis l'ablation, timer arrêté : `AGE_MAX_H=1
    fraicheur-sauvegardes` alerte une fois, se tait au second passage, et `fraicheur-sauvegardes`
    sans la variable annonce le retour, puis se tait.

⚠ Avant d'effacer : exporter et **relire** l'export (plan, tâche A1). Celui du 2026-09-13 est
`~/Sauvegardes/vps-2026-09-13.tar.gpg` sur le poste du porteur, phrase de passe dans le trousseau
macOS (`security find-generic-password -s vps-export-2026-09-13 -w`).

**Les jetons de la migration** (Cloudflare, R2, GHCR, clé d'API Dokploy) transitent par
`~/Sauvegardes/migration-secrets.env` sur le poste, en mode `600`, jamais par le chat ni le dépôt ;
leur place définitive est dans Dokploy, les environnements GitHub et le gestionnaire de mots de passe.
Le fichier se supprime à la fin de la migration.

**Mettre Dokploy à jour** : Settings → *Update*, après avoir lu les notes de version — ou
`docker service update --image dokploy/dokploy:<version> dokploy` sur le serveur. Puis, **dans le
même geste** : relire la version (commande du relevé), la porter dans `docs/infra/versions.json`
(`dokploy.prod`, date) et dans la ligne `DOKPLOY_VERSION=` du runbook ci-dessus ; la garde
`check-infra-versions.mjs` rougit tant que les deux ne disent pas la même chose (TCK-526).

**Mettre Docker à jour** : jamais par `apt-get upgrade` — les cinq paquets sont tenus. Sur le
serveur : `apt-mark unhold docker-ce docker-ce-cli containerd.io docker-compose-plugin
docker-buildx-plugin`, `apt-get install docker-ce=5:<version>-1~ubuntu.24.04~noble …` (les cinq,
versions lues dans `apt-cache madison`), `apt-mark hold` de nouveau, puis relire
`docker version --format '{{.Server.Version}}'` et porter la version dans `versions.json`
(`docker.prod`) **et** en tête de `bootstrap.sh` (`DOCKER_VERSION`, et les trois autres). Le
redémarrage du démon coupe tous les conteneurs quelques secondes : à faire hors des heures servies.

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
