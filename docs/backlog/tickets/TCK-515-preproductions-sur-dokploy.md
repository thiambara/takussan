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
- [ ] AC2 — une IP autorisée passe la liste des webhooks ; `X-Forwarded-For: 203.0.113.7` reste en 403
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
- D5, étape 5 — `/storage/sonde.txt` → `public, max-age=604800, stale-while-revalidate=86400` ;
  `/.htaccess` et `/.env` → `404` ; un POST de 26 Mio → `413` ; `gzip` servi.
- D7 (préparé) — projet *CheckPrint Plus* : clé SSH générée par Dokploy, *deploy key* `dokploy` en
  lecture seule ; clone **prouvé** (`Cloning Repo Custom … ✅`), puis `pull` → `unauthorized` : il
  manque le registre `ghcr.io`. Compose `cpp-api-preview` (56 clés) et Application `cpp-web-preview`
  déclarés, non déployés ; DNS non basculé.
- D8, étape 2 — `CONTABO_HOST`, `CONTABO_SSH_KEY`, `CONTABO_USER`, `ENV_FILE`, `ENV_FILE_PREVIEW`,
  `REPO_URL` supprimés des deux dépôts ; relu : aucun secret au niveau du dépôt.
- AC1 — tenu pour Takussan (ci-dessus) ; attend CheckPrint Plus.

## Reste

- D4, étape 2 : le seed (en cours au moment de ces notes).
- D5, étapes 2 à 4 : files et planificateur, recherche, IP du client par ablation (AC2).
- D6 et AC3, AC4 : attendent le seau R2 (TCK-510, A5).
- D7 : le registre `ghcr.io` avec un jeton `read:packages` (porteur), puis déploiement, DNS,
  environnement GitHub, `ProductionSeeder`, mesures.
- D8, étape 1 : la surveillance externe (compte UptimeRobot ou Better Stack, porteur) ; la *deploy
  key* `Contabo` de l'ancien serveur, encore posée sur `thiambara/check-print-plus`.
