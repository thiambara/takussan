---
id: TCK-132
title: "/super-admin/properties — Gestion globale des biens (super_admin)"
status: done
phase: P1
family: front
estimate: M
wave: 15
created: 2026-05-02
updated: 2026-05-03
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#2-agency
tags: [front, super-admin, properties, p1]
---

## Objectif utilisateur

Un super_admin accède à `/super-admin/properties` et peut consulter, filtrer et agir sur l'ensemble des biens de la plateforme (toutes agences confondues), sans page « En cours de développement ».

## Impact TCK-138 → TCK-146

- **Path frontend** : `/super-admin/properties` (et **non** `/admin/properties` — `/admin/*` est réservé au dashboard agency_admin via TCK-131 ; le namespace super-admin frontend vit sous `/super-admin/*` depuis TCK-145).
- **Layout** : monter la page sous `(super-admin)/super-admin/...` avec la garde server-side livrée par TCK-145 (`roles` contient `super_admin`). Pas de re-implémentation de la garde.
- **Endpoint backend** : `GET /api/properties` — **inchangé** sous le namespace public. TCK-144 a délibérément gardé les CRUD partagés à leur place (le super_admin y accède via `Gate::before`/`isSuperAdmin()`). Aucune route déplacée sous `/api/admin/properties` — au contraire, TCK-144 a ramené `/api/admin/properties/moderation` vers `/api/properties/moderation`.
- **Détection super_admin** : côté serveur via `roles` array du `/auth/me` (jamais via le profil actif — un super_admin n'a pas nécessairement de profil).

## Contrat de données

Endpoint existant : `GET /api/properties`. Le scope super_admin est appliqué côté backend (pas de filtre `agency_id` automatique). Frontend obligatoirement avec `filter[]`, `sort=`, `include=`, `fields[properties]=` (conventions Spatie, cf. CLAUDE.md).

Filtres pertinents : `filter[agency_id]`, `filter[status]`, `filter[type]`, `filter[search]`, `filter[is_published]`, `filter[city]`. Inclure `include=agency,address` au minimum.

Mutations existantes : statuts (publier / dépublier / archiver), suppression. La modération vit sous `/api/properties/moderation` (TCK-098, post-TCK-144).

## Direction UX / Artistique

- Vue **table dense** type back-office : colonnes triables (titre, agence, ville, type, prix, statut, dernière mise à jour).
- Barre de filtres supérieure (recherche libre, agence, statut, type, ville).
- Actions par ligne (menu : voir détail public, voir dans le back-office agence, modérer, archiver).
- Pas de hero ; thème **stone-900 + amber** du shell super-admin (TCK-145), pas le thème Lin/Bricolage du shell agence.
- Vue distincte de `/super-admin/agencies` et de `/properties/moderation` (modération = workflow de validation, ce ticket = administration courante).

## Contraintes strictes (métier)

- Page **réservée au rôle `super_admin`** ; garde server-side via le layout `(super-admin)` (TCK-145). Un user sans le rôle est redirigé vers `/app` côté serveur, pas de flash.
- Aucune action ne doit court-circuiter la modération (TCK-098) — un bien en `pending_moderation` reste consultable mais ses transitions passent par la file de modération.
- Toutes les actions critiques (suppression, archivage transverse) déclenchent un `ActivityLog` automatique côté backend.
- Pagination obligatoire (`per_page` ≤ 50).
- Actions destructives (archivage transverse, suppression) → `ConfirmActionDialog` avec phrase à retaper (pattern TCK-145).

## Delta à produire

- [ ] Page UI: `src/app/(super-admin)/super-admin/properties/page.tsx` — retirer `<StubPlaceholder>` s'il existe, sinon créer la page sous le shell super-admin
- [ ] Composant `SuperAdminPropertiesTable` (colonnes, tri, sélection)
- [ ] Composant `SuperAdminPropertiesFilters` (recherche, agence, statut, type, ville)
- [ ] Hook/query React Query : liste + actions (publier, dépublier, archiver) — proxy si nécessaire
- [ ] Drawer/dialog d'action de masse si plusieurs lignes sélectionnées
- [ ] Skeletons et états vides (aucun bien, aucun résultat de filtre)
- [ ] Tests UI : redirect côté serveur si non super_admin, filtres, actions

## Critères d'acceptation

- [ ] La page existe sous `/super-admin/properties` et n'affiche plus de `<StubPlaceholder>`
- [ ] Un user sans `super_admin` qui charge `/super-admin/properties` est redirigé vers `/app` **côté serveur** (pas de flash)
- [ ] Le super_admin voit les biens de toutes les agences avec pagination et tri
- [ ] Les filtres modifient l'URL (`?filter[...]=...`) et sont partageables
- [ ] Une action sur un bien (archiver, dépublier) met à jour la liste sans rechargement complet
- [ ] Aucun appel ne fetch tous les champs (sparse fieldsets respectés)
- [ ] L'éventuelle ancienne route `/admin/properties` (super_admin only) est supprimée ou redirige vers `/super-admin/properties`

## Hors périmètre

- Création/édition d'un bien depuis cette page (le formulaire est déjà couvert par les pages agence)
- Modération workflow (TCK-098 / TCK-067)
- Export CSV (P2 dédié)
- Vue agency_admin globale des biens de l'agence (couverte par les pages agence existantes)

## Notes d'implémentation

- **Proxy `/api/super-admin-properties/[[...path]]`** : nouveau handler same-origin qui forward vers `/api/properties[/...]` avec le bearer pris du cookie httpOnly. Lives outside `/api/super-admin/*` car l'upstream reste le CRUD partagé (TCK-144 a délibérément gardé le scope public + Gate::before). Pattern symétrique à `/api/super-admin-users` (TCK-145).
- **Filtres backend disponibles** : `agency_id`, `status`, `type`, `visibility`, `search` — tous déjà whitelistés dans `Property::$requestFilterable`. **Pas de `is_published` ni `city`** côté backend — l'UI utilise `filter[visibility]=public` comme proxy de "publié" et n'expose pas le filtre ville (filtrer sur `addresses.city` exige une `AllowedFilter::callback` non livrée — ouvrir un ticket backend si l'usage le justifie).
- **Sparse fields** : `fields[properties]=id,agency_id,reference_number,title,slug,type,contract_type,status,visibility,price,currency,published_at,created_at`. **Ne pas** y inclure `main_photo_url`, `location` ou `*_label` — ce sont des attributs calculés du `PropertyResource` et spatie rejette avec HTTP 400 (`InvalidFieldQuery`) si on les liste. **Inclure `agency_id`** est obligatoire : sans la clé étrangère sur la ligne parente, Eloquent ne peut pas eager-load `belongsTo(Agency::class)` et `row.agency` revient `null` pour chaque bien (la colonne "Agence" affiche alors "—" partout).
- **Action "Archiver"** : utilise `POST /api/properties/bulk-archive` (TCK-074) même pour un seul bien — il n'existe pas d'endpoint single-archive (le `DELETE` fait du soft-delete via `deleted_at`, pas de l'archivage `archived_at`).
- **Mutations + cache** : chaque action invalide `['super-admin', 'properties']` via React Query, pas de full reload (AC).
- **Ancienne route `/admin/properties`** : convertie en `redirect('/super-admin/properties')` dans `(dashboard)/admin/properties/page.tsx` (l'espace `/admin/*` reste dédié à l'agency_admin, TCK-131).
- **Sidebar** : entrée "Biens" ajoutée à `SuperAdminSidebar` entre "Agences" et "Utilisateurs".
- **Vérification UI navigateur non effectuée** : les tests unitaires et le lint passent, mais le dev server n'a pas été démarré pour un walk-through manuel — confirmer en review avec un super_admin.
