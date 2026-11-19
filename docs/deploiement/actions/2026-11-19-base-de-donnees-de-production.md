---
titre: "Créer le rôle et la base de production (LOCALE C, pgvector), et prouver que le rôle de préproduction y est refusé"
type: donnee
tickets: [TCK-517]
cles: [DB_DATABASE, DB_USERNAME, DB_PASSWORD]
creee: 2026-11-19
preview: fait
production: a-faire
---

## Quoi faire

[Plan, F1, étape 2](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) : rôle `takussan_prod` **sans `CREATEDB`**, base `takussan_prod` en
`--encoding=UTF8 --locale=C`, `REVOKE CONNECT … FROM PUBLIC`, puis la preuve inverse (le rôle de préproduction est
refusé). Ajouter `CREATE EXTENSION vector` par `pgadmin` dans `takussan_prod` **avant** le premier `migrate`
(hebergement.md, IA). Ranger le mot de passe hors du VPS. Le `REVOKE` sur la base `postgres` elle-même est dans
`2026-11-19-durcir-le-reseau-et-les-acces-du-serveur.md`.

## Comment vérifier

`\l` montre `takussan_prod` en `C` ; une connexion avec le rôle de préproduction rend `permission denied` ;
`select extname from pg_extension` contient `vector`.

## Historique

- 2026-11-19 · preview · fait · Claude (inventaire, pour le porteur) · reporté de hebergement.md (base et rôle créés le 2026-09-14, extension `vector` posée le 2026-11-01) ; re-mesuré le 2026-11-19 : `takussan_preview` présente sur `serveur-postgres`
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : aucune base `takussan_prod`
