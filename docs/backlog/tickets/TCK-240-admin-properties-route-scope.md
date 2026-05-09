---
id: TCK-240
title: "Admin biens - restaurer la liste /admin/properties"
status: review
phase: P1
family: bug
estimate: S
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-132, TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#2-agency
tags: [front, admin, super-admin, properties, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur autorisé doit pouvoir ouvrir `/admin/properties` et rester dans le contexte admin attendu pour consulter les biens selon son rôle.

## Contrat de données

Finding smoke `docs/smoke-tests/super-admin-2026-05-08.md` : `TC-SUP-49` observe qu'une navigation vers `/admin/properties` termine sur `/super-admin/properties`, alors que le cas QA attend une liste sous `/admin/properties`.

Endpoint principal : `GET /api/properties` avec scoping par rôle/policy existant.

## Direction UX / Artistique

La route `/admin/properties` doit utiliser le shell admin cohérent avec le contexte courant. Si un super-admin arrive depuis cette route, l'expérience doit être explicite et ne pas produire de changement de namespace surprenant.

## Contraintes strictes (métier)

- Le scoping des biens reste côté backend/policy.
- Un `agency_admin` ne voit que les biens de son agence active.
- Un `super_admin` peut voir la portée plateforme quand le contrat de route le permet.
- La route ne doit pas contourner le shell super-admin dédié pour les actions strictement plateforme.
- Les requêtes frontend doivent continuer à utiliser `fields[...]`, `filter[...]`, `include=` et pagination.

## Delta à produire

- [ ] Clarifier et corriger le comportement de `/admin/properties` pour qu'il ne redirige pas silencieusement vers `/super-admin/properties` dans le parcours QA.
- [ ] Garantir une liste fonctionnelle sous `/admin/properties` avec scoping `agency_admin` et comportement défini pour `super_admin`.
- [ ] Conserver `/super-admin/properties` comme entrée plateforme dédiée si elle reste exposée.
- [ ] Ajouter tests de navigation/redirect pour `super_admin`, `agency_admin`, `agent` et anonyme.
- [ ] Ajouter smoke ou test UI vérifiant que l'URL finale de `/admin/properties` est celle attendue.

## Critères d'acceptation

- [ ] Un super-admin qui ouvre `/admin/properties` obtient la liste attendue par la QA ou une redirection explicitement documentée et testée vers la route canonique.
- [ ] Un `agency_admin` qui ouvre `/admin/properties` reste dans l'espace admin agence et ne voit pas les biens cross-tenant.
- [ ] Les utilisateurs non autorisés sont redirigés ou refusés sans flash de données.
- [ ] Aucun appel API ne fetch tous les champs.

## Hors périmètre

- Refonte de `/super-admin/properties`.
- Création/édition de biens.
- Workflow de modération des biens signalés.

## Notes d'implémentation

`/admin/properties` réutilise la liste dashboard existante; `/super-admin/properties` reste l'entrée plateforme dédiée.
