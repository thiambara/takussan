---
id: TCK-1729
title: "L'aperçu du devis compte comme l'API, dans la devise de la demande, et les taux vides de l'agence disent qu'ils valent 0 %"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-133--estimations-et-aperçus-calculés-au-front-face-au-calcul-de-lapi"
tags: [front, maintenance, quote, agency, pistes]
---

## Contexte

Réf : **P133.06** du fichier de pistes (« Petites améliorations »), points 2 et 3.

- L'aperçu du total d'un devis d'intervention sommait les produits bruts, là où
  `MaintenanceQuoteWorkflow::priceLines` arrondit chaque ligne à l'unité de la devise : trois
  lignes de 1,5 × 333 en XOF donnaient un aperçu de 1 499 et un devis enregistré de 1 500. L'aperçu
  se formatait en XOF quelle que soit la devise.
- La configuration de l'agence montrait les exemples `5` (commission) et `18` (TVA) alors qu'un
  champ vide vaut 0 % dans `PayoutCalculator` et `InvoiceService`.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

L'entrée ne porte pas de recommandation du délégué. Choix de l'implémenteur : l'aide « Laissé vide,
ce taux vaut 0 %. » (`en` : « Left empty, this rate counts as 0%. », `wo` : le français), une seule
clé sous les deux champs ; la devise de l'aperçu est `quote_currency` de la demande, sinon le XOF.

## Reste à faire

Point 1 de la `Piste`, non fait : rendre la fenêtre d'avis de visite dans la ressource de la visite
(ou une date limite calculée), au lieu de `FEEDBACK_WINDOW_HOURS = 24` écrit en dur dans
`VisitDetail.tsx`. Il touche l'API, et ce lot ne touche que le front.

## Delta à produire

- [x] `QuoteSubmitForm.tsx` : `quotePreviewTotal(lines, currency)` arrondit chaque ligne au demi
      supérieur à l'unité de la devise, en entiers ; l'aperçu se formate dans cette devise.
- [x] `AgencyConfigForm.tsx` : les deux exemples retirés, une aide sous chacun des deux champs.
- [x] Clé `admin.agencyConfig.fields.emptyRateIsZero` (`fr`, `en`, `wo` = le français).

## Critères d'acceptation

- [x] AC1 — XOF : trois lignes de 1,5 × 333 → aperçu 1 500 (et non 1 499).
- [x] AC2 — demande en EUR : 1,5 × 333,33 → 500,00 €.
- [x] AC3 — ni `5` ni `18` en exemple ; l'aide sous les deux champs.

## Hors périmètre

- La devise d'un premier devis : l'API la tire du bail ou de l'agence (`resolveCurrency`), que la
  ressource de la demande n'expose pas ; l'aperçu retombe sur le XOF tant que `quote_currency` est
  vide (hypothèse : le cas d'un bail hors XOF n'est pas couvert).

## Notes d'implémentation

- Avant le correctif : 3 rouges (aperçu « 1 499 F CFA », « 500 F CFA » pour l'EUR, `placeholder="5"`).
- Ablation : les deux composants rendus à leur version d'avant, tests gardés → les 3 mêmes rouges ;
  remis → verts (21 avec les tests voisins des deux composants).
- `BigInt(…)` et non `0n` : la cible TypeScript est antérieure à ES2020 (`tsc` refuse les
  littéraux). Les flottants rendraient 1,5 × 333,33 = 499,994999…, arrondi à 499,99.
