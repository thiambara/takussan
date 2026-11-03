---
id: TCK-1162
title: "La référence d'un versement se tire à nouveau quand elle est déjà prise"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#28-payout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92--contraintes-unique-sans-garde--doublon-rendu-en-500"
tags: [back, paiements, reversements, pistes]
---

## Contexte

Réf : **P92.09** du fichier de pistes, `validé` (V1 et V6 accordés). Entrée de la même famille que
P76.03 (TCK-1158) : elle cite `PayoutService.php`.

`ReferenceNumberGenerator::payout()` tire `PO-Ym-` suivi de six caractères au hasard, sans nouvel
essai, alors que `payouts.reference_number` est unique. Une collision remonte en violation
d'unicité : 409 `payout.already_paid_out` dans `PayoutService::create` (une pièce « déjà reversée »
qui ne l'est pas), 500 dans `createForBill`.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : pour le nouvel essai, la voie la plus étroite : le générateur retire tant que la
référence existe (suppressions douces comprises). Une course entre deux tirages identiques dans la
même seconde reste possible en théorie (36⁶ tirages par mois) ; elle n'est pas fermée ici.

## Reste à faire

- le rendu de repli d'une `UniqueConstraintViolationException` en 409 `http.conflict` pour
  `api/*` (sans le `DETAIL`) : il fixe le rendu de toute violation d'unicité non prévue sur
  l'ensemble des routes, une décision structurelle (V6) qui s'écrit en ADR avant d'être codée, et
  `docs/adr/` est fermé à l'implémenteur.

## Objectif utilisateur

Une préparation de versement n'échoue plus sur une référence tirée deux fois.

## Delta à produire

- [x] Nouvel essai dans `ReferenceNumberGenerator::payout()`.
- [x] `PayoutReferenceRetryTest`.

## Critères d'acceptation

- [x] AC1 — `PO-<Ym>-AAAAAA` déjà pris, tirages `aaaaaa` puis `bbbbbb` : la référence rendue est
      `PO-<Ym>-BBBBBB`.
- [x] AC2 — une référence libre est gardée au premier tirage.

## Hors périmètre

- Le filet global (« Reste à faire »).
- Les autres références tirées au hasard (`BK-`, `INV-`, …) : la piste ne vise que celle du
  versement.

## Notes d'implémentation

- Les tirages sont fixés par `Str::createRandomStringsUsingSequence()`, remis à la normale au
  `tearDown()`.
- Ablation : générateur d'avant → 1 rouge (AC1 rend `…-AAAAAA`) ; remis → 2/2.
