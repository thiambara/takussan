---
id: TCK-515
title: "Préproductions — Takussan et CheckPrint Plus servis par Dokploy, mesurés, restaurés à blanc"
status: doing
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-14
depends_on: [TCK-510, TCK-513, TCK-514]
blocks: [TCK-516]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dokploy, preproduction, adr-0028]
---

## Objectif utilisateur

Que `preview.takussan.com`, `preview.api.takussan.com` et leurs équivalents CheckPrint Plus servent
le dernier commit de `preview`, et qu'on sache le prouver, le restaurer et le mesurer.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Déroulé :
[plan, phase D](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#phase-d--raccorder-les-préproductions),
tâches D1 à D8.

## Contraintes strictes (métier)

- `TRUSTED_PROXIES` ne vaut jamais `*` : une adresse usurpée par `X-Forwarded-For` reste refusée.
- La restauration à blanc (diff vide des comptes par table) est la condition de la production.

## Delta à produire

- [ ] D1 à D6 — Takussan : services Dokploy, DNS, environnement GitHub, seed, mesures, restauration, budget
- [ ] D7 — CheckPrint Plus
- [ ] D8 — surveillance externe, secrets de l'ancienne chaîne retirés

## Critères d'acceptation

- [ ] AC1 — le job `deploy` d'`images.yml` rend `✓ … sert <commit>` pour l'API et le front
- [x] AC2 — une IP autorisée passe la liste des webhooks ; `X-Forwarded-For: 203.0.113.7` reste en 403
- [ ] AC3 — restauration PostgreSQL à blanc : `diff` des comptes vide ; volume de médias identique (`sha256sum`)
- [ ] AC4 — budget mesuré : mémoire disponible ≥ 1 500 Mo, `st` < 10, disque < 75 %

## Hors périmètre

- Les fronts de production, toujours sur Vercel (TCK-517).

## Notes d'implémentation

**2026-09-14, sur le serveur réinstallé (TCK-510).** Relevé : `docs/infra/hebergement.md`.

- D1 — projet Dokploy *Takussan* : Compose `takussan-api-preview` (dépôt public, branche `preview`,
  *Autodeploy* désactivé, 71 clés d'environnement dont aucune vide, domaine
  `preview.api.takussan.com` → `api:8080`) ; Application `takussan-web-preview` (image publique,
  **sans** registre, domaine `preview.takussan.com`, authentification basique). `TRUSTED_PROXIES` =
  `10.0.1.0/24` puis les 22 plages Cloudflare du jour, jamais `*`.
- D2 — `preview.takussan.com` : CNAME Vercel → A `178.18.247.62` proxifié ; `preview.api` reste en
  DNS seul. Mesuré : `401` sans authentification, `200` avec, `401` avec un mauvais mot de passe ;
  `server: cloudflare`, `cf-ray`, aucun `x-vercel-id`.
- D3 — environnement GitHub `preview` : trois variables lues dans `project.all`, deux secrets
  (longueurs vérifiées). `workflow_dispatch` (run `34794945761`) : vert, et le job de déploiement rend
  `✓ https://preview.api.takussan.com/up sert 6995a81d…` puis
  `✓ https://preview.takussan.com/robots.txt sert 6995a81d…`. ⚠ Le `compose.deploy` déclenché par
  le workflow avait échoué au `pull` (délai dépassé vers le stockage de GHCR) : l'image a été tirée à
  la main sur le serveur et le déploiement relancé ; la preuve du workflow a ensuite constaté le
  commit servi.
- D4, étape 1 — projet Compose `takussan-api-preview-4iza80`, répertoire
  `/etc/dokploy/compose/takussan-api-preview-4iza80/code/deploy/takussan` ; la commande du runbook
  (`find … *takussan-api-preview*`) l'y trouve.
- D5, étape 1 — `/up` → `HTTP/2 200`, `X-Build-Sha` = `preview`, certificat Let's Encrypt.
- D5, étape 2 — une tâche réelle (`Artisan::queue('inspire')`) poussée sur chacune des quatre files :
  `default` et `notifications-urgent` consommées par `worker`, `media` et `reconciliation` par
  `worker-media` ; `jobs` → `0`. Le planificateur lance ses tâches toutes les cinq minutes
  (`ExpirePendingBookingsJob`, `SendPropertyVisitReminders`, `sms:pull-mtarget-dlr` … `DONE`).
  ⚠ `failed_jobs` → `23`, **tous** de 01:30 et tous `BookingExpiredNotification` :
  `Class "Resend" not found`. La préproduction déclare `MAIL_MAILER=resend` (et une
  `RESEND_API_KEY`), mais `resend/resend-php` n'est **ni dans `composer.json` ni dans
  `composer.lock`**, et ne l'a jamais été (`git log -S 'resend/'` vide). L'ancien serveur installait
  le même `composer.lock` : ses courriels échouaient de la même façon. Aucun courriel ne part donc,
  et la production aurait le même défaut.
- D4, étape 2 — le seed, par la commande du runbook, détaché sur le serveur (`nohup`, une coupure SSH
  du poste ne le tue pas) : `FIN seed : code=0 en 2536 s`. 856 biens ; 948 Mo de médias dans le
  volume `storage` (`SEED_DOWNLOAD_MEDIA=true`) ; l'import final de `seed.sh` parcourt les sept
  modèles indexés. ⚠ `docker compose run` avertit `The "FRONTEND_URL" variable is not set` :
  `GOOGLE_REDIRECT_URI` (ligne 27 de l'environnement) cite `${FRONTEND_URL}`, défini ligne 46. Dans
  les services déployés par Dokploy, la valeur est pourtant juste (relue par `printenv` et
  `config("services.google.redirect")`).
- D5, étape 3 — `config("scout.prefix")` commence par `preview_` ; la clé lue **dans le conteneur**
  (`printenv MEILISEARCH_KEY`, 64 caractères) rend `403` sur `prod_properties` et `200` sur
  `preview_properties`. Après le seed : `Property::search("maison")` → `5`, `"villa"` → `5` ;
  `preview_properties` compte **817** documents pour 856 biens, et 817 est exactement le compte de
  `shouldBeSearchable()` (brouillons, en attente, refusés, non publics et supprimés exclus). L'index
  était vide pendant le seed, et c'est voulu : `seed.sh` seede avec `SCOUT_DRIVER=null` puis importe
  tout d'un bloc à la fin. `GET /api/public/properties?filter[search]=maison` → `200`.
- D5, étape 2, suite — à 02:00, 12 échecs de plus (`UrgentMaintenanceCreatedNotification`, file
  `notifications-urgent`), même cause Resend : 35 au total, aucun d'une autre cause.
- D5, étape 4, premier temps — `SMS_ORANGE_WEBHOOK_IPS` = l'IP publique du poste, posée par
  `compose.update` puis `compose.deploy` ; relue dans `api` et `worker`, recréés à 02:06:36. Sonde →
  `404 {"message":"Error"}` : c'est le refus du **contrôleur** (jeton faux, `abort(404)`), pas celui du
  filtre. ⚠ Ce premier temps ne prouve rien seul : avec une liste vide, une préproduction laisse passer
  aussi (`RestrictIpMiddleware` ne refuse une liste vide qu'en production).
- D5, étape 4, second temps — `SMS_ORANGE_WEBHOOK_IPS=203.0.113.7`, relu dans `api` recréé à
  02:09:27. Sans en-tête → `403 {"message":"Source IP not allowed"}` ; avec
  `X-Forwarded-For: 203.0.113.7` → **`403` `Source IP not allowed`** (un premier essai perdu sur une
  coupure réseau du poste, rejoué). L'IP écrite par le client est ignorée, l'IP réelle arrive jusqu'à
  Laravel par Traefik → Caddy : **AC2 tenu**, sur l'hôte en DNS seul. La chaîne par Cloudflare se
  prouve en F3.
- D6, étape 4 — budget au repos, après le seed (2026-09-14, 02:04 Z) : **5 697 Mo disponibles** sur
  7 941, `st` à `0` sur les douze relevés, disque à **24 %**. Détail par conteneur dans le plan
  (§ Budget). ⚠ Le front `takussan-web-preview` tournait **sans plafond** (`docker stats` : la
  mémoire de la machine), là où le plan fixe 384 Mo.
- D5, étape 5 — `/storage/sonde.txt` → `public, max-age=604800, stale-while-revalidate=86400` ;
  `/.htaccess` et `/.env` → `404` ; un POST de 26 Mio → `413` ; `gzip` servi.
- D7 (préparé) — projet *CheckPrint Plus* : clé SSH générée par Dokploy, *deploy key* `dokploy` en
  lecture seule ; clone **prouvé** (`Cloning Repo Custom … ✅`), puis `pull` → `unauthorized` : il
  manque le registre `ghcr.io`. Compose `cpp-api-preview` (56 clés) et Application `cpp-web-preview`
  déclarés, non déployés ; DNS non basculé.
- D8, étape 2 — `CONTABO_HOST`, `CONTABO_SSH_KEY`, `CONTABO_USER`, `ENV_FILE`, `ENV_FILE_PREVIEW`,
  `REPO_URL` supprimés des deux dépôts ; relu : aucun secret au niveau du dépôt. La *deploy key*
  `Contabo` de check-print-plus (lecture seule, dernière utilisation le 2026-06-15) retirée aussi ;
  seule la clé `dokploy` reste.
- AC1 — tenu pour Takussan (ci-dessus) ; attend CheckPrint Plus.

## Reste

- D6, étapes 1 à 3, et AC3 : attendent le seau R2 (TCK-510, A5).
- AC4 : tenu avec la seule préproduction Takussan ; à rejouer une fois CheckPrint Plus servi (D7).
- Les courriels : décidé par le porteur le 2026-09-14 — le SDK `resend/resend-php` pour la
  production (branche `fix/sdk-resend`), `MAIL_MAILER=log` pour la préproduction (posé, relu dans
  `api` et `worker` ; `failed_jobs` 36 → 0 par `queue:flush`). Reste : la fusion sur `dev`, puis
  sa promotion.
- D7 : le registre `ghcr.io` avec un jeton `read:packages` (porteur), puis déploiement, DNS,
  environnement GitHub, `ProductionSeeder`, mesures.
- D8, étape 1 : la surveillance externe (compte UptimeRobot ou Better Stack, porteur).
