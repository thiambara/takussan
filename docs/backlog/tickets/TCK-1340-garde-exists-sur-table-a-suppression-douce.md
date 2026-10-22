---
id: TCK-1340
title: "Garde : aucune règle exists neuve sur une table à suppression douce sans écarter les lignes supprimées"
status: done
phase: P2
family: chore
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1336, TCK-1338]
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-96--règles-exists-sur-une-table-à-suppression-douce"
tags: [api, validation, garde, suppression-douce, pistes]
---

## Contexte

Réf : **P96.04** du fichier de pistes, `validé`.

Rien n'empêchait d'écrire une règle `exists:` neuve sur une table dont le modèle porte
`SoftDeletes`, forme fautive de P96.02 et P96.03 (corrigées par TCK-1336 et TCK-1338, même lot).

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V6.

## Choix de l'implémenteur

La `Piste` demande un test d'architecture avec « une liste d'exceptions motivées ». Retenu, comme
le recommandait la ligne du délégué, le cliquet de `ExistsSurRouteOuverteTest` : les règles qui
restent non bornées après TCK-1336 et TCK-1338 sont figées en exceptions, chacune avec son motif,
et une exception qui n'a plus la forme fait rougir. C'est la voie la plus étroite : elle ne
corrige aucune règle de plus.

## Delta à produire

- [x] `tests/Feature/Architecture/ExistsSurTableASuppressionDouceTest.php` : pour chaque
      `exists:<table>` et `Rule::exists('<table>')` de `app/Http/Requests` (commentaires exclus),
      exige `->withoutTrashed()`, `->whereNull('deleted_at')` ou `,deleted_at,NULL` quand la table
      est celle d'un modèle à `SoftDeletes` (lue par `getTable()` sur `app/Models`, pas listée à la
      main).
- [x] Exceptions figées : `StorePrivacyRequestRequest` (légitime, registre RGPD), les deux
      requêtes de reversement (reste de P96.02), `ClosePlatformPayoutPeriodRequest` (reversement),
      `IndexCalendarRequest` (P62.07), et trois requêtes dont l'appelant rend déjà 422
      (`StoreAgentHandoverRequest`, `SetPrimaryContactCustomerRequest`, `UpdateTaskRequest`).

## Critères d'acceptation

- [x] AC1 — Une règle neuve non bornée sur une table à suppression douce fait rougir la garde.
- [x] AC2 — Une exception corrigée ou disparue fait rougir la garde.
- [x] AC3 — La détection lit les trois formes, ignore les commentaires, et une règle bornée ne
      couvre pas sa voisine.

## Reste à faire

Corriger les règles figées qui peuvent l'être sans décision (les trois « déjà 422 ») et retirer
leur exception ; les reversements attendent le porteur.

## Hors périmètre

- Les `validate()` écrits dans les contrôleurs : la garde ne lit que `app/Http/Requests`, comme
  `ExistsSurRouteOuverteTest`.

## Notes d'implémentation

- Granularité : `<fichier>#<table>`, sans compte d'occurrences (comme `ExistsSurRouteOuverteTest`).
- Ablation : `StoreInvoiceRequest` remis à `exists:customers,id` → rouge
  (`Api/StoreInvoiceRequest.php#customers`) ; `UpdateTaskRequest` borné → rouge (exception
  périmée) ; remis → 4/4 verts. Sur `pre-dev` avant TCK-1336 et TCK-1338, elle aurait signalé
  leurs treize règles.
