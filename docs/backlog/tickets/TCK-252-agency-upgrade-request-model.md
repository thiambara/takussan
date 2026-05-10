---
id: TCK-252
title: "AgencyUpgradeRequest — modèle + migration + enums"
status: todo
phase: P1
family: back
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-248]
blocks: [TCK-267, TCK-268]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
    - "docs/models-spec.md#2-agency"
tags: [back, onboarding, agency, upgrade, p1]
---

## Objectif utilisateur

Doter la plateforme d'une entité dédiée pour tracer les **demandes d'upgrade** d'une agence `individual` vers `standard`, avec workflow de review super-admin.

## Contrat de données

Modèle `AgencyUpgradeRequest` (voir spec models §49).

Aucun endpoint dans ce ticket — le form de soumission est porté par TCK-267, la review par TCK-268.

Relations à exposer sur `Agency` :
- `agency.upgradeRequests()` → hasMany
- `agency.pendingUpgradeRequest()` → hasOne (scope `status = pending`)

## Contraintes strictes (métier)

- Une seule demande `pending` autorisée par agence — index unique partiel `(agency_id) WHERE status = pending`.
- L'agence cible doit avoir `kind = individual` au moment de la création (validation dans le service appelant — validé en TCK-267, juste documenté ici).
- Pas de rétrogradation : aucune méthode publique pour repasser `standard` → `individual`.
- Soft delete non requis (on garde l'historique complet).

## Delta à produire

- [ ] Migration : `create_agency_upgrade_requests_table` (colonnes selon spec §49)
- [ ] Index unique partiel `(agency_id) WHERE status = pending` (Postgres) — note pour SQLite local : émulation via `unique_index` conditionnel ou check au niveau service.
- [ ] Enum : `App\Models\Enums\AgencyUpgradeRequestStatus` (`pending`, `approved`, `rejected`, `revoked`)
- [ ] Modèle : `App\Models\AgencyUpgradeRequest` avec scopes `pending()`, `historical()`
- [ ] Relations sur `Agency` : `upgradeRequests()`, `pendingUpgradeRequest()`
- [ ] Tests : `tests/Feature/Agency/AgencyUpgradeRequestTest.php` (création, scope pending, contrainte une seule pending par agence)

## Critères d'acceptation

- [ ] AC1 — Migration up/down idempotente.
- [ ] AC2 — Création d'une 2ème demande `pending` pour la même agence rejetée (DB ou validation).
- [ ] AC3 — `agency.pendingUpgradeRequest` retourne null si aucune ou la seule demande pending.
- [ ] AC4 — Enum sérialisable JSON.

## Hors périmètre

- Form de soumission utilisateur — TCK-267.
- Console super-admin de review — TCK-268.
- Flip `Agency.kind` à l'approbation — TCK-269.

## Notes d'implémentation

_(à remplir par implementing-specs)_
