---
id: TCK-214
title: "Super-admin — Enums métier éditables (catégories, libellés, traductions)"
status: review
phase: P1
family: applicatif
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#30-setting
tags: [back, front, super_admin, p1]
---

## Contexte

`features.md` §2.9 P1 prévoit la "Gestion des enums métier (types de biens, statuts)". Aujourd'hui ces enums sont en dur dans le code PHP (cf. `app/Enums/`) — toute évolution nécessite un déploiement. Côté `super_admin`, aucune surface ne permet d'éditer les libellés affichés ni d'ajouter une valeur (ex. nouveau type de bien régional comme "lodge").

## Objectif utilisateur

Un super-admin ouvre `/super-admin/enums`, voit les enums métier éditables (types de biens, équipements, statuts non-techniques), et peut ajouter une valeur, modifier le libellé i18n (FR / EN / WO), désactiver une valeur sans toucher au code.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/enums` — liste des enums éditables (clé, valeurs, traductions)
- `GET /api/admin/enums/{key}` — détail d'un enum
- `POST /api/admin/enums/{key}/values` — ajouter une valeur `{value, labels: {fr, en, wo}, is_active}`
- `PATCH /api/admin/enums/{key}/values/{value}` — éditer libellés / activation
- `DELETE /api/admin/enums/{key}/values/{value}` — désactiver (soft) — refuser 409 si utilisée par > 0 entités

Le store utilise le modèle `Setting` (cf. `models-spec.md#30-setting`) avec une convention de clé `enum.<key>.values`.

## Direction UX / Artistique

Page liste à gauche (les enums éditables), panneau détail à droite avec tableau des valeurs et inline edit des traductions FR/EN/WO. Bouton "Ajouter une valeur" en haut. Indicateur d'usage par valeur (compteur des entités liées). Bandeau d'avertissement clair : "Les enums techniques (statuts internes, rôles) ne sont pas éditables ici".

## Contraintes strictes (métier)

- **Whitelist explicite** des enums éditables — aucun enum technique (statuts de paiement, statuts de réservation interne, rôles) ne doit être exposé. Liste maintenue côté backend (constante `EditableBusinessEnums`).
- Endpoints super-admin-only.
- Lecture côté frontend public passe par un endpoint cacheable (`GET /api/enums/{key}` public, lecture seule, déjà existant ou à exposer).
- Suppression interdite tant qu'au moins une entité utilise la valeur — 409 explicite.
- Activity log obligatoire pour chaque mutation.
- Les libellés FR sont obligatoires ; EN / WO peuvent fallback vers FR.

## Delta à produire

- [ ] Constante `App\Domain\Settings\EditableBusinessEnums` listant explicitement les enums autorisés
- [ ] Service `App\Services\Admin\BusinessEnumService` (lecture, mutation, validation d'usage)
- [ ] Controller `Admin\BusinessEnumController` (4 actions : index, show, store value, update value, deactivate value)
- [ ] FormRequests dédiées
- [ ] Routes `routes/api/admin.php`
- [ ] Endpoint public `GET /api/enums/{key}` (cacheable, lecture seule) — utilisé par le frontend pour les selects
- [ ] Activity log `super_admin_enum_value_added|updated|deactivated`
- [ ] Frontend page `/super-admin/enums`
- [ ] Composants : `EnumList`, `EnumValueTable`, `EnumValueDialog` (création / édition multilingue)
- [ ] Tests backend : whitelist appliquée (refuser un enum technique), 403 hors super-admin, 409 si valeur utilisée
- [ ] Tests UI : édition libellé multilingue, ajout valeur, refus suppression

## Critères d'acceptation

- [ ] Une tentative d'éditer un enum hors whitelist retourne 422 (`enum_not_editable`)
- [ ] L'ajout d'une valeur la rend immédiatement disponible dans `GET /api/enums/{key}` public
- [ ] La suppression échoue 409 si la valeur est utilisée
- [ ] Les libellés FR sont obligatoires à la création
- [ ] Un agency_admin reçoit 403 sur tous les endpoints `/api/admin/enums/*`
- [ ] Chaque mutation produit une entrée d'audit

## Hors périmètre

- Migration des enums PHP existants vers le store dynamique (le ticket **n'altère pas** les enums techniques en dur)
- Personnalisation des enums par agence (multi-tenant override) — non couvert
- Import de traductions en masse — out of scope

## Notes d'implémentation

- Whitelist initiale limitée à `property_type`, `contract_type`, `title_type`, `rent_period`; les statuts techniques restent exclus.
- Les valeurs dynamiques sont stockées dans `settings.key = enum.<key>.values`; les enums PHP restent la base de fallback quand aucun setting n'existe.
- La désactivation est un soft-disable dans le payload JSON (`is_active=false`) et retourne 409 si une entité utilise déjà la valeur.
