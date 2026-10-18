---
id: TCK-830
title: "Dokploy : la préproduction quitte l'environnement « production » pour un environnement « preview »"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dokploy, environnements, adr-0069, adr-0028]
---

## Contexte

[ADR-0069](../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md) § 1, étape 1
de son Application. L'audit du 2026-10-17 a relevé que le projet Dokploy **Takussan** n'avait qu'un
environnement, créé par défaut et nommé `production`, qui contenait les deux services de
**préproduction** (`takussan-api-preview`, `takussan-web-preview`). La phase F y aurait ajouté la
production.

## Objectif utilisateur

Dans l'interface de Dokploy, la préproduction est rangée sous `preview`, et `production` est vide
jusqu'à la phase F, comme sur Vercel.

## Contraintes strictes

- Les services sont **déplacés**, jamais recréés. Recréer changerait leurs identifiants, que lit
  `images.yml`, le nom interne du Compose, dont dépendent la commande de déploiement et le volume
  `storage`, et le préfixe des sauvegardes.
- Aucune coupure de la préproduction.

## Delta à produire

- `environment.create` : l'environnement `preview` dans le projet Takussan.
- `compose.move` et `application.move` des deux services vers lui.
- Le relevé de `docs/infra/hebergement.md` dit où vit chaque service.

## Critères d'acceptation

- [x] AC1 — `environment.byProjectId` : `preview` porte `takussan-api-preview` et
      `takussan-web-preview` ; `production` ne porte rien.
- [x] AC2 — Avant et après le déplacement, mêmes identifiants (`composeId`, `applicationId`), même
      nom interne (`takussan-api-preview-4iza80`, `takussan-web-preview-j7msd1`), même commande de
      déploiement, même domaine, mêmes six comptes d'authentification basique, même volume
      `takussan-api-preview-4iza80_storage`.
- [x] AC3 — Un déploiement de chacun depuis le nouvel environnement finit `done`, et la
      préproduction sert le même commit (`X-Build-Sha` = `b58c29f8…`, API et front).

## Hors périmètre

- La création de la production : phase F, sur la table de F3, jamais par `environment.duplicate`
  (ADR-0069 § 1).
- Les variables au niveau de l'environnement : étape 3 de l'Application d'ADR-0069.

## Notes d'implémentation

- **Fait le 2026-10-17 vers 23 h 30 UTC**, par l'API de Dokploy (v0.30.8), avec un script qui
  n'imprime que des codes et des identifiants. `environment.create`, `compose.move` et
  `application.move` ont chacun rendu `200`. Environnement `preview` : `7OPQDJ4Vr-tFS8qiz6f1Q`.
- Déploiements de preuve : Compose de 23:34:39 à 23:35:18 Z, Application de 23:35:18 à
  23:35:20 Z, tous deux `done`. Le front a été remplacé sans coupure (`start-first`), et l'API n'a
  pas été recréée, l'image étant la même.
- Les identifiants lus par `images.yml` (variables de l'environnement GitHub `preview`) n'ont pas
  bougé : rien à reposer côté GitHub.
