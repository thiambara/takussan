---
id: TCK-834
title: "Quittance : une échéance de plusieurs mois imprime « du … au … »"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-26--pdf--quittances-contrats-factures
tags: [back, pdf, quittance, pistes]
---

## Contexte

Réf : **P26.03** du fichier de pistes, `validé` (V7 accordé).

Depuis TCK-667 (PR #453, fusionnée le 2026-10-16), une échéance trimestrielle ou annuelle couvre
trois ou douze mois. La « Période » de la quittance (`resources/views/pdf/receipts/rent.blade.php`)
ne lisait que `period_start` au format « mois année » : une quittance de trimestre disait
« Janvier 2027 » pour trois loyers acquittés.

## Décision du porteur

validé — « du … au … » dès que la période dépasse un mois, après la fusion de #453

## Objectif utilisateur

La quittance d'une échéance trimestrielle ou annuelle dit toute la période qu'elle acquitte.

## Contraintes strictes

- Une échéance d'un mois garde son libellé « Octobre 2026 » (TCK-672 le garde en français).
- Les dates de l'acte restent en français, quelle que soit la langue du lecteur
  (`DocumentPdfService`, TCK-672).

## Hypothèses (mode sans humain)

- **« Dépasse un mois »** : `period_end` est postérieur à la veille du même quantième le mois
  suivant (`period_start + 1 mois − 1 jour`). Une échéance du 15 octobre au 14 novembre reste
  donc d'un mois et garde « Octobre 2026 », comme avant.
- **Forme des dates** : « du 1 janvier 2027 au 31 mars 2027 » (`j F Y`, en français), la cellule
  commençant par une majuscule comme le libellé du mois.

## Delta à produire

- [x] `rent.blade.php` : libellé « du … au … » quand la période dépasse un mois.
- [x] `tests/Feature/Services/QuittancePeriodeTest.php`.

## Critères d'acceptation

- [x] AC1 — Échéance du 2027-01-01 au 2027-03-31 : « Du 1 janvier 2027 au 31 mars 2027 », et
      plus « Janvier 2027 ».
- [x] AC2 — Échéance du 2027-01-01 au 2027-12-31 : « Du 1 janvier 2027 au 31 décembre 2027 ».
- [x] AC3 — Échéances du 2026-10-01 au 2026-10-31 et du 2026-10-15 au 2026-11-14 : « Octobre 2026 ».

## Hors périmètre

- Les reçus des autres types d'échéance (caution, pénalité, charges) passent par le même gabarit et
  suivent la même règle ; aucun autre gabarit n'est touché.
- Les autres écarts des gabarits PDF : TCK de P26.06.

## Notes d'implémentation

- **Ablation** : la condition remplacée par `if (false)`, AC1 et AC2 rougissent, AC3 reste vert.
  Remis : 3 verts, et `ActesPdfEnFrancaisTest`, `ReceiptPdfTest`, `DocumentPdfServiceTest`,
  `RentReceiptAfterOnlinePaymentTest` restent verts (28 tests en tout).
- `addMonthNoOverflow()` : une échéance qui part le 31 janvier finit au 27 ou 28 février sans être
  prise pour deux mois.
