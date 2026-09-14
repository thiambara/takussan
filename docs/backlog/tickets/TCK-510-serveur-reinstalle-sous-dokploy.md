---
id: TCK-510
title: "Serveur — le VPS est réinstallé à blanc et sert Dokploy, ses bases et leurs sauvegardes"
status: doing
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-14
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

- [x] A1 — export chiffré, rapatrié, relu
- [x] A2 — `deploy/server/bootstrap.sh`, réinstallation, mesures
- [x] A3 — Dokploy, 2FA, domaine `deploy.takussan.com`, Cloudflare Full (strict), port 3000 fermé
- [x] A4 — `deploy/server/compose.data.yml` (Meilisearch, deux Redis), services PostgreSQL et MySQL
- [ ] A5 — sauvegardes des bases vers R2, une sauvegarde manuelle relue

## Critères d'acceptation

- [x] AC1 — `pg_restore --list` de l'export rend un nombre de tables non nul
- [x] AC2 — `curl -m 5 http://178.18.247.62:3000` échoue depuis l'extérieur ; `https://deploy.takussan.com` répond
- [x] AC3 — le rôle `takussan_preview` ne peut se connecter qu'à sa base (un rôle sonde est refusé), collation `C`, extension `vector` disponible
- [x] AC4 — la clé Meilisearch de préproduction reçoit `403` hors de `preview_*`
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

**2026-09-14, sur le serveur réinstallé.** Relevé complet : `docs/infra/hebergement.md`.

- A2 — Ubuntu 24.04.5, 4 vCPU, 7,9 Go ; `authorized_keys` porte la clé du poste et la clé de
  secours. `bootstrap.sh` : swap `/swapfile` 4 G, ufw sur 22/80/443, journaux `json-file`,
  `passwordauthentication no`. `ssh -o PubkeyAuthentication=no` → *Permission denied (publickey)*.
- A3 — Dokploy `v0.30.6` (Traefik `v3.6.7`), installé **détaché** : lancé au premier plan, il est
  mort avec la session SSH. Compte propriétaire et 2FA créés par le porteur (`user.get` →
  `twoFactorEnabled: true`). Cloudflare, les deux zones : relevé avant modification (`ssl=full`,
  `always_use_https=off`, aucun enregistrement proxifié), puis `ssl=strict`, relu.
  `deploy.takussan.com` A proxifié ; `https://deploy.takussan.com/` → `200`, `http` → `301`,
  certificat d'origine Let's Encrypt. `forwardedHeaders.trustedIPs` = 22 plages Cloudflare du jour
  sous `web` et `websecure`. Nettoyage Docker quotidien actif (relu par
  `settings.getWebServerSettings`).
- AC2 — `bootstrap.sh` rejoué sans `ADMIN_IP` : poste → `:3000` `000`, serveur → `200` ; `:8080`
  (tableau de bord de Traefik) n'est pas publié.
- A4 — Compose `donnees` (Meilisearch v1.16, `redis-takussan`, `redis-cpp`), PostgreSQL 17.11
  (`pgvector/pgvector:pg17`, hôte `serveur-postgres-egr6ii`), MySQL 8.4.11 (hôte
  `serveur-mysql-vsqugl`) ; limites mémoire relues par `docker service inspect`. Redis : `PONG` avec
  mot de passe, `NOAUTH` sans, pour les deux. `shared_buffers` 256MB et `performance_schema` 0 relus
  après redémarrage. MySQL : Dokploy avait créé la base en `utf8mb4_0900_ai_ci`, passée en
  `utf8mb4_unicode_ci` ; `LENGTH(user)` → 22.
- AC3 — `takussan_preview|C|C|UTF8`, `und-x-icu` 1, `vector` 1 ; le rôle sonde → *permission denied
  for database "takussan_preview"* ; `takussan_preview` se connecte.
- AC4 — clé `preview_*` : `prod_sonde` → `403`, `preview_sonde` → `202` (index supprimé ensuite) ;
  sans clé → `401`.

## Reste

- A5 et AC5 : le seau R2 et son jeton sont à créer par le porteur (Cloudflare → R2). Tant qu'ils
  manquent, aucune base n'est sauvegardée hors du serveur.
