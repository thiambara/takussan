---
id: TCK-1205
title: "Les écritures d'un reversement rendent la projection du `show`, sans clé nulle mensongère"
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-95--réponse-d-une-écriture-face-au-show-du-même-modèle"
tags: [back, api, payouts, contrat, pistes]
---

## Objectif utilisateur

Un écran qui lit la réponse d'une écriture d'un reversement (préparer, approuver, payer, échouer,
annuler) y trouve la même destination masquée, le même émetteur et — côté plateforme — la même
ventilation que dans le détail, au lieu d'une valeur nulle qui dit « aucune ».

## Contexte

Réf : **P95.01** du fichier de pistes, `validé` (critère V7 accordé).

Mesuré avant correctif (`pre-dev` fbb8fc003, test de garde ci-dessous) : `POST /api/payouts` et
`POST /api/payouts/{id}/cancel` d'un reversement à destination rendent `payout_method_masked: null`
quand le `show` rend `•••• 1111` ; `POST /api/admin/payouts/close-period` rend `breakdown: null`.
Le volet `TagController` de la piste est inexact (mesureur, 2026-10-21 : le `show` rend lui aussi
`usage_count` nul) : il n'est pas traité.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenus :

- **`PayoutController`** : la première voie de la piste, une méthode privée `presenter()` appelée
  par `show` et par les cinq écritures, qui charge ce que charge le `show` (`issuer`,
  `payoutMethod:id,masked_identifier`).
- **`PlatformPayoutController`** : la même méthode pour `show`, `approve`, `markPaid` et `cancel`,
  qui calcule la ventilation comme le `show` (deux agrégats par reversement). Pour la clôture, qui
  crée un reversement par agence, et pour la liste, la ventilation n'est pas calculée : la clé est
  **omise** (`when`) au lieu de sortir nulle — la voie la plus étroite, sans 2 × N requêtes. Le
  type du front (`breakdown?: … | null`) admet déjà l'absence.
- `TagController` : hors du ticket (constat inexact).

## Delta à produire

- [x] `PayoutController::presenter()`, appelé par `show`, `store`, `approve`, `markProcessed`,
  `markFailed`, `cancel`.
- [x] `PlatformPayoutController::presenter()`, appelé par `show`, `approve`, `markPaid`, `cancel`.
- [x] `PlatformPayoutResource` : `breakdown` omis quand il n'est pas fourni.
- [x] Test `tests/Feature/Api/PayoutWriteResponseTest.php`.

## Critères d'acceptation

- [x] AC1 — `store`, `approve` et `markProcessed` d'un reversement à destination rendent
  `payout_method_masked` et `issuer` égaux à ceux du `show`.
- [x] AC2 — `cancel` de même.
- [x] AC3 — `approve` d'un reversement de la plateforme rend la ventilation du `show` ; la clôture
  n'a pas de clé `breakdown`.

## Hors périmètre

- `TagController::format()` et `usage_count` (constat inexact, cf. ci-dessus).
- Les autres contrôleurs de l'angle 95 (P95.03, P95.04).

## Notes d'implémentation

- Ablation : les deux contrôleurs et la ressource rendus à `fbb8fc003` → 3 rouges ; remis → 3 verts.
- Classes voisines vertes : `PlatformPayoutTest`, `PlatformPayoutScopeTest`,
  `PlatformPayoutSegregationTest`, `PayoutTest`, `PayoutApprovalTest`, `PayoutBypassTest`,
  `AmountRepresentationTest`, `DateRepresentationTest`, `AmountResourcesSparseFieldsTest`.
