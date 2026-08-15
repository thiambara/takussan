---
id: TCK-086
title: "Hiérarchie de biens (immeuble → étages → lots)"
status: done
phase: P1
family: back
estimate: M
wave: 11
created: 2026-04-24
updated: 2026-04-25
depends_on: [TCK-034, TCK-035, TCK-036]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [back, property, hierarchy]
---

## Objectif utilisateur

Permettre à un Agent de modéliser un immeuble (ou résidence) contenant des
étages, des lots ou des appartements en tant que biens enfants, afin de gérer
la disponibilité, la location et les médias à la maille la plus fine sans
recréer manuellement les liens.

## Contrat de données

La relation parent/enfant est portée par `Property.parent_id` (auto-référence)
selon §3 de `models-spec.md`. Ce ticket consomme la spec — la colonne doit
exister via la migration de `TCK-034`. Si absente, prévoir une migration
additive `add_parent_id_to_properties`.

**Endpoints à ajouter** :

- `GET /api/properties/{property}/children` — liste paginée des enfants
  directs (filtres spatie habituels : `filter[status]`, `sort`, `fields[]`,
  `include`).
- `GET /api/properties/{property}/ancestors` — chaîne d'ancêtres jusqu'à la
  racine (utile pour breadcrumbs côté frontend).
- `PATCH /api/properties/{property}` body `{ parent_id }` — attache /
  détache un bien à un parent.

**Inclusions spatie supportées** : `parent`, `children`, `childrenCount`.

**Filtre spatie** : `filter[parent_id]=null` (racines uniquement) ou
`filter[parent_id]=<uuid>`.

## Direction UX / Artistique

_Pas de scope frontend dans ce ticket — voir un futur ticket UI dédié
si nécessaire._

## Contraintes strictes (métier)

- **Anti-cycle** : un bien ne peut pas être son propre ancêtre. Validation
  serveur stricte (parcours récursif limité à 10 niveaux pour éviter les
  attaques DoS). 422 si cycle détecté.
- **Profondeur max** : limitée à 4 niveaux (immeuble → étage → lot →
  sous-lot). 422 au-delà.
- **Cohérence d'agence** : un enfant doit appartenir à la même agence que
  son parent. 422 sinon.
- **Suppression cascade-soft** : la suppression d'un parent met les enfants
  en `parent_id = null` (pas de suppression cascade dure) — un job de
  réconciliation peut signaler les orphelins en background.
- **Permissions** : seul un user avec la permission `properties.update` sur
  les deux biens (parent + enfant) peut modifier `parent_id`.
- **Visibilité publique** : un enfant `published` reste accessible même si
  son parent est `draft` — ils sont indépendants côté listing public.
- **Sparse fieldsets** : la réponse de `GET /children` respecte
  `fields[properties]=…`.

## Delta à produire

- [ ] Migration: `add_parent_id_to_properties` (si non présente) — colonne
      uuid nullable + index + FK self-cascade `set null`
- [ ] Eloquent: relation `parent()` + `children()` + scope `roots()` sur
      `App\Models\Property`
- [ ] Service: `App\Services\Property\HierarchyService` (anti-cycle,
      ancestors(), descendants(), depth())
- [ ] FormRequest: `UpdatePropertyRequest` étendu (rule custom `not_cycle`
      + `same_agency` + `max_depth`)
- [ ] Controller: `PropertyChildrenController@index` +
      `PropertyAncestorsController@index`
- [ ] Routes: `routes/api/properties.php` (children + ancestors)
- [ ] AllowedFilter `parent_id` + AllowedInclude `parent`, `children`,
      `childrenCount` dans `PropertyController`
- [ ] Policy: `PropertyPolicy@updateParent` (vérifie permission sur les 2
      biens)
- [ ] Tests: `PropertyHierarchyTest` (anti-cycle, depth max,
      same-agency, soft-cascade)
- [ ] Tests: `PropertyChildrenEndpointTest` (pagination, filters, fields,
      403 cross-agency)
- [ ] Tests: `PropertyAncestorsEndpointTest` (chaîne complète, racine
      seule, bien isolé)

## Critères d'acceptation

- [ ] AC1 — `PATCH /properties/{id}` avec un `parent_id` créant un cycle
      → 422 avec message clair
- [ ] AC2 — `PATCH` avec un parent à profondeur 4 → 422
      (`max_depth_exceeded`)
- [ ] AC3 — `PATCH` avec un parent d'une autre agence → 422
      (`same_agency_required`)
- [ ] AC4 — `GET /properties/{id}/children` retourne uniquement les
      enfants directs paginés
- [ ] AC5 — `GET /properties/{id}/ancestors` retourne la chaîne du plus
      proche au plus lointain
- [ ] AC6 — Suppression d'un parent met `parent_id = null` sur les enfants
      (pas de cascade dure)
- [ ] AC7 — `include=parent,childrenCount` est respecté dans les listings
      `GET /properties`
- [ ] AC8 — Un enfant `published` reste visible publiquement même si son
      parent est `draft`

## Hors périmètre

- UI dédiée pour visualiser/éditer la hiérarchie (ticket frontend séparé).
- Héritage automatique de champs (adresse, prix, médias) du parent vers
  les enfants — chaque bien reste indépendant.
- Calcul de KPIs agrégés sur l'arbre (taux d'occupation immeuble) — ticket
  reporting dédié.
- Réorganisation en bulk (drag & drop multi-biens).

## Notes d'implémentation

- **Migration non créée** — `parent_id` était déjà présent dans la table
  initiale `2026_04_17_160005_create_properties_table` (FK self
  `nullOnDelete()`). Le ticket prévoit une migration additive
  conditionnelle, ici inutile.
- **Filtre `parent_id`** — `parent_id` retiré de `$requestFilterable`
  (qui ne déclare que `AllowedFilter::exact`) et réinjecté via un override
  de `getAllowedQueryFilters()` qui interprète `null` / chaîne vide /
  `"null"` comme `whereNull`. Sans ça, `filter[parent_id]=null`
  passe la string littérale au where et ne matche aucun root.
- **Soft-cascade explicite** — la FK `ON DELETE SET NULL` ne se déclenche
  qu'au hard-delete. Comme `Property` utilise `SoftDeletes`, le hook
  `static::deleting()` met explicitement `children()->update(['parent_id' => null])`
  avant chaque suppression (soft ou hard). Test couvre uniquement la
  voie soft-delete (le path `forceDelete()` traverse aussi le hook).
- **`PropertyController::children()` retiré** — la méthode inline
  paginait sans pipeline spatie ni sparse fieldsets. Remplacée par un
  contrôleur dédié `PropertyChildrenController@index` qui passe par
  `Property::buildQuery()`. La route `properties.children` pointe désormais
  vers le nouveau contrôleur (même URL, même nom de route).
- **Validation re-parenting** — la règle composite `parent_id` est portée
  par une classe anonyme dans `UpdatePropertyRequest::parentIdRule()`.
  Trois invariants stricts dans cet ordre : same-agency, anti-cycle,
  max-depth. La règle ne s'exécute que si `parent_id !== null` (détacher
  vers la racine est toujours autorisé tant que la policy passe).
- **Profondeur max 4 niveaux** — `HierarchyService::wouldExceedMaxDepth()`
  combine `depth($candidateParent) + subtreeHeight($node) > 4`. Le node
  conserve donc son sous-arbre intact à condition que la hauteur totale
  reste sous le plafond.
- **Policy `updateParent`** — méthode ajoutée à `PropertyPolicy` (pas de
  Gate global). Vérifie `update` sur le child ET sur le candidate parent
  via le contrôleur (`Gate::forUser($user)->allows('updateParent',
  [$child, $newParent])`). Détacher (parent_id=null) ne demande
  l'autorisation que sur l'enfant.
- **Tests cumulés** : 1058 backend verts (+17 ciblés TCK-086 :
  9 hierarchy + 4 children + 4 ancestors). Pint clean.
- **AC8 satisfait par construction** — `Property::scopePublic()` filtre
  visibility/published_at/status sans regarder le parent : un enfant
  publié reste public même si le parent est draft. Pas de test
  dédié (couvert par les tests publics existants).
