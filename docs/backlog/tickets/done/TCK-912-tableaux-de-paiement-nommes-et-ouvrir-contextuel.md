---
id: TCK-912
title: "Tableaux de paiement : une caption par tableau, et « Ouvrir » qui nomme sa ligne"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#boutons--ouvrir--sans-contexte-tableaux-sans-titre"
tags: [front, a11y, pistes]
---

## Contexte

Réf : **P07.13** du fichier de pistes, `validé` (V7 accordé).

`payments/InvoicesTable.tsx`, `payments/PayoutsTable.tsx`, `payments/PaymentsHistoryTable.tsx`
et `billing/PayoutTable.tsx` rendaient un `<table>` sans `<caption>` : un lecteur d'écran annonce
« tableau », sans dire lequel. Les factures et les reversements portaient à chaque ligne un bouton
« Ouvrir » au nom identique : dans la liste des boutons, N fois « Ouvrir », sans la ligne visée.

## Décision du porteur

validé — libellés contextuels et captions en fr/en ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16)

## Objectif utilisateur

Un utilisateur de lecteur d'écran sait quel tableau il parcourt, et quelle facture ou quel
reversement ouvre le bouton qu'il atteint.

## Delta à produire

- [x] Une `<caption className="sr-only">` sur les quatre tableaux (« Factures », « Reversements »,
  « Historique des paiements », « Reversements de la plateforme »).
- [x] `aria-label` « Ouvrir la facture {référence} » et « Ouvrir le reversement {référence} » sur
  les boutons, le texte visible « Ouvrir » restant en tête du nom (WCAG 2.5.3).
- [x] Clés `fr`/`en` ; en `wo`, le texte français tel quel.

## Critères d'acceptation

- [x] AC1 — Chacun des quatre tableaux a pour nom accessible sa caption.
- [x] AC2 — Le bouton d'une facture se nomme « Ouvrir la facture INV-… », celui d'un reversement
  « Ouvrir le reversement PO-… » ; à défaut de référence, `#<id>`, comme la cellule.

## Hypothèses

- La caption est masquée visuellement (`sr-only`) : la page porte déjà un titre visible, et la
  décision ne demande pas de texte visible neuf.
- La `Piste` proposait aussi de passer les tableaux par `console/DataTable` ; la décision du
  porteur retient les captions seules, sans cette refonte.

## Hors périmètre

- La navigation aux flèches des `role="radio"` de `PropertyReviewForm.tsx`, relevée par le constat
  mais absente de la `Piste` et de la décision.
- `billing/PayoutTable.tsx` n'a pas de bouton « Ouvrir » : sa sélection passe par la période, déjà
  propre à la ligne (TCK-661).

## Notes d'implémentation

- **Reproduction** : `payments/__tests__/tableaux-nommes.tck-912.test.tsx` → 6 rouges sur 6 (aucun
  tableau nommé, aucun bouton au nom contextuel).
- **Ablation** : les quatre composants remis à `pre-dev`, clés gardées → 6 rouges ; correctif
  rétabli → 6 verts, et 100 verts dans `payments/__tests__` et `billing/__tests__`.
