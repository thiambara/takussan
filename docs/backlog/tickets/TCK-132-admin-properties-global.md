---
id: TCK-132
title: "/admin/properties — Gestion globale des biens (super_admin)"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#2-agency
tags: [front, admin, properties, super-admin, p1]
---

## Objectif utilisateur

Un super_admin accède à `/admin/properties` et peut consulter, filtrer et agir sur l'ensemble des biens de la plateforme (toutes agences confondues), sans page « En cours de développement ».

## Contrat de données

Endpoint déjà existant : `GET /api/properties` avec scope super_admin (pas de filtre `agency_id` automatique). Le frontend doit utiliser `filter[]`, `sort=`, `include=`, `fields[properties]=` (conventions Spatie obligatoires).

Filtres pertinents : `filter[agency_id]`, `filter[status]`, `filter[type]`, `filter[search]`, `filter[is_published]`, `filter[city]`. Inclure `include=agency,address` au minimum.

Mutations existantes : statuts (publier / dépublier / archiver), suppression, transfert d'agence si exposé.

## Direction UX / Artistique

- Vue **table dense** type back-office : colonnes triables (titre, agence, ville, type, prix, statut, dernière mise à jour).
- Barre de filtres supérieure (recherche libre, agence, statut, type, ville).
- Actions par ligne (menu : voir détail public, voir dans le back-office agence, modérer, archiver).
- Pas de hero ; cohérent avec `/admin/moderation/properties` existant.
- Vue distincte de `/admin/moderation/properties` (modération = workflow de validation, ce ticket = administration courante).

## Contraintes strictes (métier)

- Page **réservée au rôle `super_admin`** (le guard `if (!isSuperAdmin(user.roles)) redirect('/admin')` est déjà en place et doit être conservé).
- Aucune action ne doit court-circuiter la modération (TCK-098) — un bien en `pending_moderation` reste consultable mais ses transitions passent par la file de modération.
- Toutes les actions critiques (suppression, archivage transverse) déclenchent un `ActivityLog` automatique côté backend.
- Pagination obligatoire (`per_page` ≤ 50).

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/properties/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composant `AdminPropertiesTable` (colonnes, tri, sélection)
- [ ] Composant `AdminPropertiesFilters` (recherche, agence, statut, type, ville)
- [ ] Hook/query React Query : liste + actions (publier, dépublier, archiver)
- [ ] Drawer/dialog d'action de masse si plusieurs lignes sélectionnées
- [ ] Skeletons et états vides (aucun bien, aucun résultat de filtre)
- [ ] Tests UI : guard `super_admin`, filtres, actions

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] Un agency_admin (non super_admin) est redirigé vers `/admin`
- [ ] Le super_admin voit les biens de toutes les agences avec pagination et tri
- [ ] Les filtres modifient l'URL (`?filter[...]=...`) et sont partageables
- [ ] Une action sur un bien (archiver, dépublier) met à jour la liste sans rechargement complet
- [ ] Aucun appel ne fetch tous les champs (sparse fieldsets respectés)

## Hors périmètre

- Création/édition d'un bien depuis cette page (le formulaire est déjà couvert par les pages agence)
- Modération workflow (TCK-098 / TCK-067)
- Export CSV (P2 dédié)

## Notes d'implémentation

_(à remplir par implementing-specs)_
