---
id: TCK-241
title: "API agences - corriger le scope agency_admin"
status: todo
phase: P0
family: bug
estimate: S
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-141, TCK-142]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
    - docs/models-spec.md#34-ownerprofile-
    - docs/models-spec.md#35-agentprofile-
tags: [back, api, agencies, rbac, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un admin d'agence doit uniquement voir les agences auxquelles son compte est rattaché, tandis qu'un super-admin conserve la vue plateforme.

## Contrat de données

Finding smoke `docs/smoke-tests/super-admin-2026-05-08.md` : `TC-SUP-54` observe que `GET /api/agencies` retourne les 3 agences seedées pour un `agency_admin`, au lieu de limiter la réponse à ses agences.

Endpoint concerné : `GET /api/agencies` et, par extension, les routes classiques `/api/agencies/*` qui s'appuient sur le même scoping.

## Direction UX / Artistique

Sans objet : ticket backend/API.

## Contraintes strictes (métier)

- `super_admin` voit toutes les agences.
- `agency_admin` voit uniquement les agences liées à ses profils ou à son contexte actif.
- Un `agent`, `owner` ou autre rôle non-global ne doit jamais obtenir une liste cross-tenant via `/api/agencies`.
- Le scoping doit être appliqué avant pagination, filtres et tris.
- Les permissions doivent respecter les rôles Spatie scopés par profil, pas une colonne legacy sur `users`.

## Delta à produire

- [ ] Identifier le contrôleur/service de `GET /api/agencies` et appliquer le scope tenant avant `Agency::buildQuery()`.
- [ ] Corriger les routes classiques `/api/agencies/{id}` si elles permettent de lire une agence hors scope.
- [ ] Préserver l'accès global de `super_admin`.
- [ ] Ajouter tests backend : `super_admin` voit tout, `agency_admin` voit ses agences, `agency_admin` multi-agence voit seulement ses agences, utilisateur hors agence ne voit rien ou reçoit 403 selon le contrat existant.
- [ ] Ajouter test de non-régression sur filtres, tris et pagination après scoping.

## Critères d'acceptation

- [ ] `GET /api/agencies` ne retourne plus d'agence hors scope pour un `agency_admin`.
- [ ] `GET /api/agencies` reste cross-tenant pour un `super_admin`.
- [ ] `GET /api/agencies/{id}` refuse ou masque une agence hors scope.
- [ ] Les filtres Spatie et `fields[agencies]=...` fonctionnent encore après correction.

## Hors périmètre

- Namespace `/api/admin/agencies`, déjà super-admin-only.
- Refonte des profils polymorphes.
- UI `/super-admin/agencies`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
