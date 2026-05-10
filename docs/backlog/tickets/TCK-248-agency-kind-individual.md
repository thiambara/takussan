---
id: TCK-248
title: "Agency.kind — distinction standard vs individual + migration + seed"
status: todo
phase: P0
family: back
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: []
blocks: [TCK-254, TCK-255, TCK-267, TCK-269]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, onboarding, agency, p0]
---

## Objectif utilisateur

Permettre à la plateforme de différencier les **agences professionnelles** (`standard`) des **agences individuelles** (`individual`, host solo auto-créé via la CTA "Publier") afin d'appliquer les bonnes restrictions de capacités selon le type.

## Contrat de données

Migration sur `agencies` :

- Nouvelle colonne `kind` (enum : `standard` | `individual`), default `standard` pour les agences existantes.
- Cast Eloquent vers `App\Enums\AgencyKind`.

Aucun nouvel endpoint dans ce ticket — l'utilisation du champ par les contrôleurs (gates, policies, UI) est portée par les tickets aval (TCK-255, TCK-269).

## Contraintes strictes (métier)

- Les agences existantes restent `standard` (pas de migration de données autre).
- Une agence ne peut pas être rétrogradée `standard` → `individual` (pas de méthode publique pour ça ; seul l'upgrade `individual` → `standard` est exposé via TCK-267/269).
- L'enum `AgencyKind` doit exposer un helper `isIndividual(): bool` pour faciliter les checks dans les policies.

## Delta à produire

- [ ] Migration : `add_kind_to_agencies_table`
- [ ] Enum : `App\Enums\AgencyKind` (`standard`, `individual`) + helper `isIndividual()`
- [ ] Cast sur `App\Models\Agency` : `'kind' => AgencyKind::class`
- [ ] Seeder : aucune nouvelle agence créée, mais documenter que les seeders existants utilisent `kind = standard` par défaut
- [ ] Tests : `tests/Feature/Agency/AgencyKindTest.php` (default `standard`, persistance, helper `isIndividual()`)

## Critères d'acceptation

- [ ] AC1 — Migration up/down idempotente, agences existantes en `standard`.
- [ ] AC2 — `Agency::factory()` accepte un override `kind` et la valeur est persistée.
- [ ] AC3 — `$agency->kind->isIndividual()` renvoie `true` ssi `kind = individual`.
- [ ] AC4 — Enum sérialisable JSON via API resource (clé `kind` exposée).

## Hors périmètre

- Restrictions de capacités (gates, policies) — portées par les tickets parcours (TCK-255, TCK-269).
- Wizard de création d'agence individuelle — TCK-255.
- Workflow d'upgrade — TCK-267, TCK-268, TCK-269.

## Notes d'implémentation

_(à remplir par implementing-specs)_
