---
id: TCK-2041
title: "Le relevé de gérance compte le versé et les frais au mois du versement, et la somme des mois rejoint l'année"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-177--relevés-de-gérance-dune-période-close-recalculés-à-chaque-lecture"
tags: [api, payouts, relevé, pistes]
---

## Objectif utilisateur

Le bailleur qui lit les relevés de deux mois couverts par un même reversement n'y voit plus deux
fois le même versement ni les mêmes frais : le versé et les frais figurent dans le relevé du mois
où le reversement a été versé, avec la mention « Versé ce mois », et la somme des relevés mensuels
rejoint l'attestation annuelle.

## Contexte

Réf : **P177.03** du fichier de pistes. Un reversement était retenu par le relevé dès qu'il portait
une pièce de la période, et son `net_amount` entier et toutes ses factures imputées y étaient
comptés : mesuré sur `9ad4edc14`, loyers de septembre et d'octobre (200 000 chacun, 10 %) et une
facture de 15 000 dans un reversement de 345 000 → septembre et octobre annonçaient chacun
`fees 15000, net 165000, paid_out 345000`.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : brut et commission ventilés par pièce (copie de P177.01) ; « versé » et frais rattachés au mois de `processed_at`, avec la mention « versé ce mois » ; après P177.01

## Hypothèses (mode sans humain)

- « Versé » = Σ `net_amount` des reversements au bailleur `completed` dont `processed_at` tombe
  dans la période, la règle du « net reversé » du tableau de bord
  (`PortfolioMetrics::netPaidOutByMonth`). L'attestation annuelle suit la même règle sur l'année,
  avec la mention « Versé cette année ».
- Les frais sont les factures imputées à ces mêmes reversements. Les frais d'un reversement pas
  encore versé (`pending`, `approved`) n'entrent dans aucun relevé tant qu'il n'est pas versé.
- La liste `payouts` cite toujours les reversements qui portent une pièce de la période, plus ceux
  versés dans la période ; chacun porte `paid_in_period`.
- Brut et commission restent ventilés par pièce de la période, la commission au taux copié par
  TCK-2017. La lecture du **montant** copié (au lieu de `montant − refund_amount` du jour) est
  liée à la ligne négative d'un remboursement, que P177.01 porte et qui est revenue au porteur
  (V4) : c'est le « après P177.01 » de la décision, et le reste de ce ticket.
- La clé `money_out.statement.paid_this_month` / `paid_this_year` est neuve ; en `wo`, le
  français tel quel (wolof en pause).

## Reste à faire

- Lire le brut de chaque pièce reversée sur sa copie (`payout_*_payment.amount`), avec la lecture
  des montants copiés et la ligne négative datée de P177.01.

## Delta à produire

- [x] `OwnerStatementService` : `payoutsPaidIn()` (par `processed_at`) porte le versé et les
  frais ; `paid_in_period` sur chaque reversement listé.
- [x] Gabarit `pdf/statements/owner` : ligne « Versé ce mois » / « Versé cette année ».
- [x] `lang/{fr,en,wo}/money_out.php` : deux clés.
- [x] Garde dans `tests/Feature/Api/OwnerStatementTest.php`.

## Critères d'acceptation

- [x] AC1 — Reversement de 345 000 versé le 5 octobre, portant les loyers de septembre et
  d'octobre et une facture de 15 000 → septembre `fees 0, net 180000, paid_out 0`, octobre
  `fees 15000, net 165000, paid_out 345000`, année `net 345000, paid_out 345000` ; chaque total
  des deux mois somme celui de l'année.
- [x] AC2 — Le reversement est cité dans les deux relevés, `paid_in_period` faux en septembre et
  vrai en octobre ; le PDF d'octobre porte « Versé ce mois ».

## Hors périmètre

- P177.05 (relevé figé à l'avis mensuel) : reclassée dans ce passage.

## Notes d'implémentation

- Les jeux de test existants créaient un reversement `pending` (ou versé le 1ᵉʳ octobre pour
  P177.02) et en attendaient les frais et le versé en septembre : ils sont désormais versés le
  30 septembre, ce que la nouvelle règle exige pour garder leur sens.
- Ablation : service remis à son état antérieur → septembre `fees 15000, net 165000,
  paid_out 345000`, rouge ; ligne du gabarit retirée → « Versé ce mois » absent, rouge. Rétabli →
  vert.
