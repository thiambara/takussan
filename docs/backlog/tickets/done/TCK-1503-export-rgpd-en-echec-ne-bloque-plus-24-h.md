---
id: TCK-1503
title: "Un export RGPD en échec ou expiré ne bloque plus une nouvelle demande pendant 24 h"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#57-dataexport-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-111--jobs-à-statut-de-suivi-sans-failed"
tags: [api, privacy, rgpd, pistes]
---

## Contexte

Réf : **P111.02** du fichier de pistes, `validé`.

`DataExportController::store()` compte dans la limite d'une demande par 24 h toute demande
récente du titulaire, quel que soit son statut : un export passé à `failed` rend
`429 data_export_throttled` à la demande suivante.

## Décision du porteur

validé — porteur (2026-10-22) : ne compter dans la limite de 24 h que les demandes `queued`, `processing` et `ready`, et l'écrire dans `features.md:475`

## Reste à faire

Écrire la règle dans `docs/features.md:475` : la spec est fermée à l'implémenteur (ADR-0066,
étape 4), au `/sync-specs` qui suit la fusion.

## Objectif utilisateur

Une demande d'export qui a échoué n'a rien rendu : le titulaire peut en refaire une aussitôt.

## Contrat de données

Aucun changement : la réponse `429` garde sa forme (`code`, `message`, `available_at`).

## Contraintes strictes (métier)

- Seuls les statuts `queued`, `processing` et `ready` comptent ; `failed` et `expired` non.
- Chaque nouvelle demande ouvre son entrée `portability` au registre (ADR-0044), comme
  aujourd'hui : rien ne change à l'observateur.

## Delta à produire

- [x] Filtre `whereIn('status', …)` dans la recherche de la demande récente.
- [x] Test : une demande récente par statut, `202` pour `failed` et `expired`, `429` sinon.

## Critères d'acceptation

- [x] AC1 — une demande `failed` ou `expired` de moins de 24 h n'empêche pas une nouvelle demande.
- [x] AC2 — une demande `queued`, `processing` ou `ready` de moins de 24 h rend toujours `429`.

## Hors périmètre

- La ligne de `features.md` (reste ci-dessus).
- Les demandes déclenchées par un super-admin, qui n'ont pas de limite.

## Notes d'implémentation

- Hypothèse : `expired` ne compte pas, la décision ne nommant que trois statuts. Une demande ne
  passe `expired` qu'à l'échéance de son archive, donc rarement en moins de 24 h.
- Ablation : filtre retiré → `DataExportTest::test_seules_les_demandes_…` rouge (`429` au lieu de
  `202` sur `failed`) ; remis → vert.
