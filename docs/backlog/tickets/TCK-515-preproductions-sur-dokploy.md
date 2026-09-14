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

- [x] D1 à D6 — Takussan : services Dokploy, DNS, environnement GitHub, seed, mesures, restauration, budget
- [x] D7 — CheckPrint Plus
- [ ] D8 — surveillance externe, secrets de l'ancienne chaîne retirés

## Critères d'acceptation

- [x] AC1 — le job `deploy` d'`images.yml` rend `✓ … sert <commit>` pour l'API et le front
- [x] AC2 — une IP autorisée passe la liste des webhooks ; `X-Forwarded-For: 203.0.113.7` reste en 403
- [x] AC3 — restauration PostgreSQL à blanc : `diff` des comptes vide ; volume de médias identique (`sha256sum`)
- [x] AC4 — budget mesuré : mémoire disponible ≥ 1 500 Mo, `st` < 10, disque < 75 %

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
- Promotion #271 (`ad93e5e6`, SDK Resend) — `images.yml` run `34832685800`, vert de bout en bout :
  `✓ https://preview.api.takussan.com/up sert ad93e5e6…` et
  `✓ https://preview.takussan.com/robots.txt sert ad93e5e6…`, déploiement et preuve en 1 min 08 s,
  **sans** `pull` manuel cette fois (l'écart de D3 ne s'est pas reproduit). Dans l'image servie :
  `/app/vendor/resend/resend-php` présent, le transport `resend` se construit (`ResendTransport`),
  `MAIL_MAILER=log` conservé dans `api` et `worker`, `failed_jobs` → `0`.
- AC1 — tenu pour Takussan (ci-dessus, deux fois) et pour CheckPrint Plus. Le `workflow_dispatch`
  de check-print-plus (run `34835883532`) est vert et Dokploy enregistre ses deux déploiements, mais
  sa preuve **ne discrimine rien** : `f1a50473` était déjà servi, et la vérification a répondu avant
  la fin des déploiements. La preuve qui compte est celle de la promotion #28 (`c1744692`, un commit
  neuf) : run `34836831034`, `✓ https://preview.api.checkprintplus.com/up sert c1744692…` puis
  `✓ https://preview.checkprintplus.com/robots.txt sert c1744692…`, relus depuis le poste.
- D6, étape 1 — sauvegarde du volume `takussan-api-preview-4iza80_storage` (service `api`) vers R2,
  `volumes/takussan-preview/`, `0 4 * * *`, 7 exemplaires ; une manuelle en ~2 min :
  945 797 120 o lus dans R2.
- D6, étape 2 — restauration PostgreSQL à blanc, en trois essais. Premier : **0 table** — la
  sauvegarde `.sql.gz` est une archive custom (`pg_dump -Fc | gzip`), `psql` n'en charge rien et ne
  le dit pas. Second, par `pg_restore` : 90 tables sur 92 égales, `jobs` 3 → 0 et
  `scheduled_task_runs` 471 → 464, écrites après la sauvegarde. Troisième, préproduction arrêtée
  (`api`, workers, planificateur) et sauvegarde neuve : **diff vide, 92 tables, 86 927 lignes**,
  `pg_restore` sans erreur ; préproduction redémarrée.
- D6, étape 3 — l'archive du volume lue dans R2 depuis le serveur (41 s), extraite dans un volume
  neuf `restauration_storage` : **17 629 fichiers, même `sha256`** ; volume supprimé ensuite.
- D7, registre — `ghcr.io` (compte `thiambara`, jeton classique `read:packages` fourni par le
  porteur) : `registry.create`, `registry.testRegistry` réussi, rattaché à `cpp-web-preview`. ⚠ Il
  ne suffit pas au Compose, qui n'a pas de champ de registre : `docker login ghcr.io` fait à la main
  sur le serveur (jeton par l'entrée standard) ; `docker pull …/check-print-plus-api:preview` →
  code `0` en 8 s.
- D7, étape 3 — premier déploiement : `compose.deploy` et `application.deploy` → `done` ; `release`
  sort en `0` après les migrations ; `api` saine, `worker` et `scheduler` en marche. DNS :
  `preview.checkprintplus.com` CNAME Vercel → A `178.18.247.62` proxifié (`preview.api` était déjà
  en A, DNS seul). Le certificat Let's Encrypt du front est émis à la bascule — Traefik échouait
  tant que le nom pointait sur Vercel. Mesuré : `401` sans authentification et avec un mauvais mot
  de passe, `200` avec, `server: cloudflare`. Environnement GitHub `preview` de check-print-plus :
  trois variables, deux secrets (longueurs 64 et 42 vérifiées).
- D7, étape 4 — `ProductionSeeder` (code `0`, 10 s) : `plans` 1 → 4, `roles` 0 → 2, `permissions`
  0 → 3, `banks` 0 → 537, `templates` 0 → 89. Le `1` d'avant vient de la migration
  `seed_free_plan` : le critère du plan (« plans non nul ») était coché sans le seeder ; corrigé.
- D7, étape 5 — `/up` → `200`, `X-Build-Sha` = `f1a50473…` ; une tâche `inspire` poussée sur
  `default` : taille 1, puis 0 après 20 s, `inspire … DONE` au journal du worker, `failed_jobs` 0 ;
  `/storage/sonde.txt` → `cache-control: max-age=604800` ; `/.env` et `/.htaccess` → `404`. IP du
  client, par les compteurs de débit : `poste=59 puis 58 ; serveur=59 ; poste-usurpant=57` — deux
  clients, deux compteurs, et l'en-tête usurpé reste sur le compteur du poste. Un premier essai a
  perdu la sonde du poste sur une coupure réseau (`poste= serveur=59 poste-usurpant=59`, qui se lit
  comme un en-tête cru) : non conclusif, rejoué dans une fenêtre neuve.
- D7, étape 5 — restauration à blanc de `checkprintplus_preview`, préproduction arrêtée : **diff des
  comptes vide, 51 tables, 719 lignes** (sauvegarde de 27 683 o, après le seeder). Le premier essai
  n'avait rien mesuré — guillemets de la requête de comptage, MySQL local interrogé avant d'être
  prêt — et son script affichait pourtant `✓ … 0 tables identiques` : deux listes vides sont égales.
  Le second exige une liste non vide.

## Reste sur dev

- D8, étape 1 : la surveillance externe — un compte UptimeRobot ou Better Stack, à ouvrir par le
  porteur ; trois sondes toutes les 5 minutes (`https://preview.api.takussan.com/up`,
  `https://preview.api.checkprintplus.com/up`, `https://deploy.takussan.com/`), alerte par courriel.
- D8, étape 3 : refermer TCK-288 (« à la fin de D », dit le plan), puis ce ticket, une fois l'étape 1
  faite.
- Au porteur, hors du dépôt : copier les secrets du fichier de transit au gestionnaire de mots de
  passe, puis supprimer `~/Sauvegardes/migration-secrets.env`. (*Bot Fight Mode* désactivé dans les
  deux zones et canal de notifications Telegram posé : faits le 2026-09-14, au relevé.)
- À surveiller avant F : Dokploy lui-même est le seul conteneur sans plafond, et le plus lourd
  (867 → 1 013 Mo en neuf heures, § Budget du plan).
- Les courriels : décidé par le porteur le 2026-09-14 — le SDK `resend/resend-php` pour la
  production, `MAIL_MAILER=log` pour la préproduction. Le SDK est sur `dev` (#270) et promu sur
  `preview` (#271, `ad93e5e6`) ; la production le recevra avec la phase F.
