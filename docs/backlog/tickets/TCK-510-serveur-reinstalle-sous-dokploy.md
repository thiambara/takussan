---
id: TCK-510
title: "Serveur — le VPS est réinstallé à blanc et sert Dokploy, ses bases et leurs sauvegardes"
status: doing
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: []
blocks: [TCK-515]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, serveur, dokploy, sauvegardes, adr-0028]
---

## Objectif utilisateur

Que le VPS qui portera les deux projets soit une machine dont l'état se reconstruit depuis le dépôt
et quelques gestes consignés — et non l'accumulation de 182 jours d'installations à la main.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Déroulé et
commandes : [plan, piste A](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#piste-a--le-serveur),
tâches A1 à A5.

Relevé du 2026-09-13 (`ssh takussan-root`) : Ubuntu 24.04.4, x86_64, 4 vCPU, 7,9 Go ; en natif
nginx, php8.4-fpm, PostgreSQL 17 (`takussan_preview`, 49 Mo), MySQL (`checkprintplus`,
`checkprintplus_preview`, et une base MySQL `takussan_preview` de 65 Mo antérieure à ADR-0020),
Redis, Meilisearch, six unités systemd de files. `/var/www/takussan` n'a jamais eu de `current`.

## Contraintes strictes (métier)

- Aucun secret dans le dépôt, un ticket, une PR ou un journal de CI (`thiambara/takussan` est public).
- Aucun port de base publié sur l'interface publique ; le port 3000 de Dokploy fermé une fois le
  domaine posé, **mesuré de l'extérieur**.
- L'export A1 est relu (`pg_restore --list`, `tar -t`) avant la réinstallation.

## Delta à produire

- [ ] A1 — export chiffré, rapatrié, relu
- [ ] A2 — `deploy/server/bootstrap.sh`, réinstallation, mesures
- [ ] A3 — Dokploy, 2FA, domaine `deploy.takussan.com`, Cloudflare Full (strict), port 3000 fermé
- [ ] A4 — `deploy/server/compose.data.yml` (Meilisearch, deux Redis), services PostgreSQL et MySQL
- [ ] A5 — sauvegardes des bases vers R2, une sauvegarde manuelle relue

## Critères d'acceptation

- [ ] AC1 — `pg_restore --list` de l'export rend un nombre de tables non nul
- [ ] AC2 — `curl -m 5 http://178.18.247.62:3000` échoue depuis l'extérieur ; `https://deploy.takussan.com` répond
- [ ] AC3 — le rôle `takussan_preview` ne peut se connecter qu'à sa base (un rôle sonde est refusé), collation `C`, extension `vector` disponible
- [ ] AC4 — la clé Meilisearch de préproduction reçoit `403` hors de `preview_*`
- [ ] AC5 — une sauvegarde de chaque base est lue dans R2

## Hors périmètre

- Les bases et clés de **production** (TCK-517).
- Le raccordement des applications (TCK-515).

## Notes d'implémentation

**2026-09-13, branche `feat/auto-hebergement-dokploy`.**

- A1 — export fait par `ssh`, chiffré (`gpg --symmetric`, AES256), rapatrié dans
  `~/Sauvegardes/vps-2026-09-13.tar.gpg` du poste ; la phrase de passe est dans le trousseau macOS,
  jamais en clair à côté. Contenu : dump PostgreSQL de `takussan_preview`, dumps MySQL de
  `checkprintplus`, `checkprintplus_preview` et de l'ancienne `takussan_preview`, les répertoires
  `shared` (`.env` et `storage/app`, 984 Mo pour la préproduction Takussan), les vhosts nginx, les
  unités de files, la configuration de Meilisearch. `takussan_prod` (MySQL) est vide : aucune table.
- AC1 — relu depuis l'archive chiffrée : `pg_restore --list` → **92** `TABLE DATA` ; chaque
  archive `shared` porte son `.env`. Extraction de relecture supprimée.
- A2 — `bootstrap.sh` : ses deux `cmd | grep` passent par une sortie capturée (sous `pipefail`, le
  SIGPIPE d'un écrivain encore actif fait échouer le pipeline — mesuré sur les tests de fumée).
- Réinstallation par le porteur depuis le panneau Contabo (décidé le 2026-09-13).
