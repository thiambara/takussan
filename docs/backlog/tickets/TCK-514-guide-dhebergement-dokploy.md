---
id: TCK-514
title: "Documentation — le guide d'hébergement Dokploy remplace le guide de premier déploiement"
status: doing
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-09-13
updated: 2026-09-14
depends_on: [TCK-513]
blocks: [TCK-515]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, documentation, adr-0028]
---

## Objectif utilisateur

Que la personne qui reprend le serveur trouve dans le dépôt ce qui sert quoi, ce qui vit hors du
dépôt, et les commandes qui le re-mesurent — sans lire un guide qui décrit une chaîne retirée.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Contenu :
[plan, tâche B6](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-b6--la-documentation).

## Contraintes strictes (métier)

- Aucune valeur de variable dans le relevé : seulement les clés, et où vivent les valeurs.
- Plus aucun document vivant ne cite `deploy.sh`, `server-setup.sh` ou les workflows retirés comme un présent.

## Delta à produire

- [x] `docs/infra/hebergement.md` ; retrait de `premier-deploiement.md` et `deploy-preview.html`, liens réparés
- [x] `docs/infra/versions.{json,md}`, `docs/ardoise.md` (D-04, D-10), `CLAUDE.md`
- [x] retrait du marqueur `lien-mort-assumé` d'ADR-0028

## Critères d'acceptation

- [x] AC1 — `check-doc-links.mjs` vert, sans le marqueur d'ADR-0028
- [x] AC2 — le `grep` de B6 ne rend que des lignes au passé ou en récit
- [x] AC3 — toutes les gardes et les deux générateurs verts

## Reste sur dev

Le delta est livré et ses trois critères tiennent (notes ci-dessous). Le ticket reste `doing` pour
une seule raison : il dépend de TCK-513, qui ne passe `done` qu'une fois la chaîne d'images
éprouvée sur le serveur réinstallé (plan, D3), et un ticket clos ne peut pas dépendre d'un ticket
ouvert (règle n°2). Il passe `done` dans le même commit que TCK-513.

## Hors périmètre

- Le relevé des valeurs mesurées sur le serveur, rempli en D (TCK-515).

## Notes d'implémentation

**2026-09-13, branche `feat/auto-hebergement-dokploy`.**

- `docs/infra/hebergement.md` créé : ce qui sert quoi, ce que le dépôt porte, le relevé de Dokploy
  (tout *non mesuré* jusqu'à TCK-515), le runbook, et la table de ce que Caddy reprend du vhost nginx.
- `premier-deploiement.md` et `deploy-preview.html` retirés. **Aucun lien Markdown ne les visait**
  (mesuré par `grep -rnoE '\]\([^)]*(premier-deploiement\.md|deploy-preview\.html)'`) : il ne restait
  que des mentions en code, dans des documents datés (tickets, ardoise, plan), laissées telles quelles.
- `versions.json` : les six lignes `prod` gardent `non_mesure`, et leur `commande` se lance désormais
  **dans le conteneur** (`docker exec …`) ; `versions.md` suit, commandes comprises.
- Cartouches datés en tête d'ardoise D-04 et D-10 (corps conservés) ; `CLAUDE.md` (§ Workflow git,
  commandes des tests de fumée) ; `takussan-web/CLAUDE.md` (§ Déploiement, § Environnement) ;
  `docs/configuration.md` (réindexation par `release.sh`, Redis).
- Commentaires vivants réécrits au passé ou redirigés vers leur successeur : `dev.sh`, `config/cors.php`,
  `PaymentReceiptPdf`, `RefreshNewBuildSearchLabel`, `Property`, `SearchWolofReviewSheet`,
  `MediaRegeneratePropertyConversions`, `check-infra-versions`, `check-cache-headers-auth`,
  `check-deps-dev-atteignables`, `repo-ci.yml`, `dependabot.yml`. Pint vert.
- AC2 — le `grep` résiduel ne rend que du récit (« comme deploy.sh » dans les fichiers qui en
  héritent, `check-db-engine.mjs:24`, une migration datée, les mesures datées du § Workflow git).
- AC1, AC3 — marqueur d'ADR-0028 retiré ; toutes les gardes, `gen-index --check` et
  `gen-features-by-actor --check` verts.
