---
id: TCK-066
title: "Admin — Tags & amenités UI"
status: todo
phase: P1
family: front
estimate: S
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-023, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#4-tag
tags: [admin, tags, amenities, front]
---

## Contexte

TCK-023 (admin configuration) est `done` côté backend : endpoints CRUD pour `tags` (type: amenity, property_type, etc.). Aucune UI dédiée côté frontend — les agents peuvent sélectionner des tags sur un bien mais un admin ne peut pas créer/renommer/archiver un tag via l'interface.

## Objectif utilisateur

Un admin doit pouvoir gérer le référentiel des tags et amenités (piscine, meublé, climatisation…) utilisés dans les fiches biens : créer, renommer, activer/désactiver, organiser par catégorie.

## Contrat de données

Endpoints à consommer (existants, TCK-023) :

- `GET /api/tags` — liste (filter[type], filter[is_active], filter[search])
- `POST /api/tags` — créer un tag (type, label, slug, icon, is_active)
- `PATCH /api/tags/{id}` — renommer, changer icône, (dé)activer
- `DELETE /api/tags/{id}` — soft delete (si un tag est lié à des biens, l'endpoint renvoie 409 — à afficher lisiblement)

Sparse fieldsets : `fields[tags]=id,type,label,slug,icon,is_active,properties_count`.

## Direction UX / Artistique

Table dense avec filtres par type en haut (onglets ou segmented control). Inline edit quand possible (label, is_active toggle). Modal de création compact. Le compteur `properties_count` permet de juger avant suppression.

## Contraintes strictes (métier)

- Seuls `super_admin` et `agency_admin` (selon le scope du tag — global vs agence) accèdent à cette page.
- Le `slug` est généré automatiquement à la création ; non modifiable après.
- Un tag avec `properties_count > 0` ne peut pas être supprimé : l'UI doit afficher le blocage et proposer "Désactiver" à la place.

## Delta à produire

- [ ] Page `/admin/tags` (ou `/admin/settings/tags`) avec table filtrable par type
- [ ] Modal création : type (select), label, icône (optionnel)
- [ ] Inline edit du label + toggle `is_active`
- [ ] Action suppression avec confirmation, fallback désactivation si `properties_count > 0`
- [ ] Entry navigation dans sidebar admin
- [ ] Tests Vitest : rendu table, flow création, blocage suppression avec liens

## Critères d'acceptation

- [ ] AC1 — La table liste tous les tags, filtrables par type (amenity, property_type, etc.)
- [ ] AC2 — La création d'un tag via modal fonctionne ; le slug est généré automatiquement et affiché
- [ ] AC3 — Le toggle `is_active` persiste immédiatement
- [ ] AC4 — Tenter de supprimer un tag avec `properties_count > 0` affiche un message clair et propose la désactivation
- [ ] AC5 — Un utilisateur non-admin est redirigé
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Gestion des enums métier (types de biens, statuts de bail…) — couverte par TCK-068
- Internationalisation des labels tags (P2, à traiter plus tard via champ JSON multi-locale)
- Catégorisation automatique par IA

## Notes d'implémentation

_(Rempli à l'implémentation)_
