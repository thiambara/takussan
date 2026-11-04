---
id: TCK-2117
title: "Une action typée `int` ne rend plus 500 `TypeError` sur vingt chiffres ou une valeur non numérique"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2115]
blocks: []
spec_refs:
  features:
    - "docs/features.md#2-domaines-applicatifs-transverses"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-215--identifiants-numériques-de-route-hors-de-bigint-sur-les-routes-connectées"
tags: [back, routes, erreurs, pistes]
---

## Contexte

Réf : **P215.02** du fichier de pistes, `retenu · autonome` (A1). Une action qui type un paramètre
de route `int` reçoit la chaîne du chemin : au-delà de `PHP_INT_MAX`, ou pour `abc` quand la route
n'a aucune contrainte, PHP lève `TypeError` à l'appel, et la route rend 500. `whereNumber()` et
`\d+` laissent passer vingt chiffres. Même attendu et même correctif que TCK-1851 : la contrainte
`[0-9]{1,18}` rend 404 avant l'appel.

## Objectif utilisateur

Une URL altérée vers une facture, un versement, une session, un journal d'audit, une tâche en échec
ou un paiement rend 404, et non une erreur de serveur.

## Contrat de données

Aucun changement pour un identifiant réel (18 chiffres couvrent tout `bigint` atteint par une
séquence).

## Delta à produire

- [x] Contrainte `[0-9]{1,18}` sur chaque paramètre de route qu'une action type `int` : les routes
  de la piste (`service-provider-bills/{bill}`, `me/payouts/{payout}`, `auth/sessions/{tokenId}`,
  `audit-log` et `activity-log/{entity}/{id}`, `admin/jobs/failed/{id}` ×3, `{paymentType}/{paymentId}`
  ×3), et celles de même cause que le balayage ne voyait pas : `admin/users/{user}/sessions/{tokenId}`,
  `report-exports/{reportExport}/download`, `profiles/{profile}/agency-role`,
  `documents/{document}/versions/{versionId}` ×2, `inventories/{inventory}/room-photos/{media}`,
  `properties/{property}/media/{mediaId}`.
- [x] Garde : `IdentifiantsDeRouteHorsBigintTest::test_chaque_parametre_de_route_type_int_est_contraint_a_dix_huit_chiffres`
  lit la signature de chaque action et exige la contrainte ; l'exemption de ces actions est retirée
  du balayage de TCK-2115.

## Critères d'acceptation

- [x] AC1 — le balayage de TCK-2115 ne rend aucun 5xx, sans exemption.
- [x] AC2 — aucun paramètre de route typé `int` sans contrainte `[0-9]{1,18}`.

## Hypothèses

- Les sept routes hors de la liste de la piste ont la même cause et le même correctif ; elles
  restaient en 500 dès que le parent est un identifiant réel (le balayage joue la même valeur
  partout, et la liaison parente refusée masquait l'enfant). Les laisser aurait rendu la garde
  statique rouge.

## Notes d'implémentation

- Reproduction : après TCK-2115, dix routes en 500 sur vingt chiffres (`TypeError`), six sur `abc` ;
  la garde statique en relève dix-huit.
- Ablation : `routes/` rendu à l'état de TCK-2115 → les trois cas du balayage et la garde statique
  rouges ; remis → 6/6.
