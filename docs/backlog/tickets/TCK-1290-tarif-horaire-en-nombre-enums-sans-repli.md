---
id: TCK-1290
title: "Réponses composées à la main : `hourly_rate` en nombre, enums sans repli en chaîne vide"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-94--réponses-composées-à-la-main-dans-les-contrôleurs--dates-hors-adr-0018"
tags: [api, prestataire, montants, enums, pistes]
---

## Contexte

Réf : **P94.05** du fichier de pistes, `validé` (V1 accordé).

`Me\ServiceProviderProfileController` (`show`, `updateTrades`) rend `hourly_rate` en chaîne
(`decimal:2` → `"4500.00"`) et `visit_fee`, à côté, en nombre. Quatre lignes de
`AgencyUpgradeRequestController` et `SuperAdminInvitationController` écrivent
`?->value ?? (string) $x`, qui rendrait `""` et non `null` pour un enum nul.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : les deux voies que la piste écrit, `(float)` pour `hourly_rate` (`null` gardé
`null`, la plus étroite) et `?->value` seul pour les enums.

## Objectif

Les deux montants voisins sortent sous la même forme ; un enum nul sort `null`.

## Delta à produire

- [x] `hourly_rate` rendu par `(float)`, `null` conservé, dans `show` et `updateTrades`.
- [x] `?->value` seul aux quatre lignes d'enum.
- [x] Test `ServiceProviderOnboardingTest::test_hourly_rate_is_rendered_as_a_number_like_visit_fee`.

## Critères d'acceptation

- [x] AC1 — Sans tarif, `hourly_rate` → `null` ; `PATCH …/trades` avec `4500.5` → `4500.5` en
      nombre, et `show` de même.
- [x] AC2 — Les quatre lignes d'enum n'ont plus de repli `(string)`.

## Hors périmètre

- Le front (`ProfileServiceProviderSection.tsx`) accepte déjà `number | string` : il n'est pas
  touché.

## Notes d'implémentation

- La partie enum n'a pas de test rouge possible : `agencies.kind`, `agencies.status`,
  `users.status` et `documents.type` sont `NOT NULL` (mesure du mesureur), la branche `""` ne
  s'atteint pas. Changement de forme seul, couvert par les tests existants des deux contrôleurs.
- Ablation (montant) : contrôleur remis à `HEAD` → 1 rouge (`'4500.50'` au lieu de `4500.5`) ;
  correctif remis → 9/9 verts. `SuperAdminInvitationLifecycleTest` (18),
  `AgencyUpgradeRequestReviewTest` (17), `AccountAndProfileValidationTest` (11) verts.
