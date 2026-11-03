---
id: TCK-2074
title: "La préparation du reversement au bailleur montre la commission de la plateforme, portée par l'agence, et avertit quand le taux du bail est inférieur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2064]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#3-le-brut-nest-jamais-une-saisie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-178--argent-encaissé-par-la-plateforme-et-reversé-au-bailleur-avant-que-lagence-lait-reçu"
tags: [api, web, reversements, argent, pistes]
---

## Contexte

Réf : **P178.03** du fichier de pistes (🟠, `validé`). La commission de la plateforme est retenue à
la source sur ce qu'elle reverse à l'agence (`features.md` § 1.5, `PlatformPayoutService::closeForAgency`),
mais `GET /api/payouts/preparation` ne lisait jamais `platform_fee_pct_at_payment` : avec un bail à
0 % et la plateforme à 5 %, la préparation proposait au bailleur un net de 150 000 quand la plateforme
n'avait reversé que 142 500 à l'agence, sans rien en dire (mesuré par le mesureur, et reproduit par
`CommissionPlateformeALaPreparationTest` : les clés n'existaient pas).

**Décision du porteur** : validé — validation du porteur (2026-10-23) : l'agence porte la commission de la plateforme (règle actuelle, `features.md:232`) ; montrée à la préparation, avertissement sans blocage quand le taux du bail est inférieur ; après P178.01

P178.01 est faite (TCK-2064) : une pièce soldée par la plateforme n'arrive à la préparation qu'une
fois son `PlatformPayout` `paid` (hors agence `individual`).

## Objectif utilisateur

L'agence qui prépare un reversement voit, sur chaque pièce encaissée par la plateforme, la commission
que la plateforme a gardée et ce qu'elle a réellement reçu ; elle est prévenue quand la commission
prise au bailleur est inférieure, sans que rien ne l'empêche de reverser.

## Contraintes strictes (métier)

- Le calcul du bailleur ne change pas : brut, commission et net restent ceux de `PayoutCalculator::compute`.
- « Soldée par la plateforme » : la lecture de `isSettledByPlatform()`, en SQL par le complément du
  scope `whereNotSettledByPlatform` (TCK-1415). Espèces et intégration de l'agence : aucune commission
  de plateforme.
- La commission de la plateforme s'arrondit ligne par ligne à l'unité de la devise, comme la clôture.
- Lecture de la préparation seule : le relevé de gérance, qui emprunte `compute()`, n'en dit rien.

## Hypothèses (mode sans humain)

- « Avertissement » : un message de la préparation (`role="status"`), qui compte les pièces dont le
  taux appliqué au bailleur (bail, à défaut agence) est strictement inférieur au taux de la plateforme
  noté au paiement. Rien n'est ajouté à la saisie du bail : la décision le place à la préparation.
- La pénalité réglée avec le loyer (angle 206) n'entre pas dans la commission montrée : la préparation
  ne la porte pas non plus.

## Delta à produire

- [x] `PayoutPreparationService::prepare` : sur chaque ligne de loyer et de séjour, `settled_by_platform`,
  `platform_fee_rate`, `platform_fee`, `agency_received` (nuls hors plateforme) et
  `commission_below_platform_fee` ; `totals.platform_fee`.
- [x] `CreatePayoutDialog` : la commission de la plateforme et le reçu de l'agence sous la commission de
  la ligne, le total quand il n'est pas nul, et l'avertissement ; textes `fr`/`en` (`wo` reprend le
  français, wolof en pause).
- [x] Tests : `tests/Feature/Api/CommissionPlateformeALaPreparationTest.php`,
  `src/components/payments/__tests__/CreatePayoutDialog.test.tsx`.

## Critères d'acceptation

- [x] AC1 — bail à 0 %, plateforme à 5 %, loyer de 150 000 reversé par la plateforme : ligne
  `platform_fee 7500`, `agency_received 142500`, avertissement ; net du bailleur 150 000 ; la création
  du reversement rend 201.
- [x] AC2 — bail à 10 % : commission de la plateforme montrée, sans avertissement.
- [x] AC3 — loyer en espèces ou par l'intégration de l'agence : aucune commission de plateforme.
- [x] AC4 — agence `individual`, loyer encore détenu par la plateforme : montré, arrondi à l'unité XOF.
- [x] AC5 — l'écran montre la ligne, le total et l'avertissement, et le bouton de création reste actif ;
  rien de la plateforme sans pièce passée par elle.

## Hors périmètre

- P178.04 (libellé « encaissé par la plateforme » sur la préparation et le rapprochement).
- Un avertissement à la saisie du taux du bail ou de l'agence.

## Notes d'implémentation

- Ablation API : `settledByPlatform()` rendu vide → 3 rouges sur 4 ; la comparaison des taux
  neutralisée → 1 rouge. Ablation front : note de ligne et avertissement retirés → 1 rouge. Tout remis → vert.
