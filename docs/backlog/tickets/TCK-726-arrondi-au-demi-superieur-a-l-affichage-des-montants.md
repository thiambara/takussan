---
id: TCK-726
title: "Montants affichés arrondis au demi supérieur, pour que la TVA et le total de la facture PDF s'additionnent"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-26--pdf--quittances-contrats-factures
tags: [back, pdf, invoices, currency, pistes]
---

## Contexte

Réf : **P26.02** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`InvoiceService` range une TVA au centime. `CurrencyFormatter` l'affiche sans décimale en XOF par
`NumberFormatter`, sans régler de mode d'arrondi : ICU arrondit alors au pair. Mesuré par le
mesureur : sous-total 100 025, TVA 18 % → la facture PDF imprime « 100 025 · 18 004 · 118 030 »,
qui ne s'additionnent pas. Le même formateur imprime 1 250 pour 1 250,5, quand `amountDue()` et
`PayoutCalculator` arrondissent au demi supérieur et encaissent 1 251.

## Décision du porteur

arrondi ROUND_HALFUP dans `CurrencyFormatter`, pour que TVA et total s'additionnent

Hypothèse (mode sans humain) : le formateur est partagé par les PDF, les courriels et les
notifications (singleton, `@currency`). Le mode d'arrondi s'applique donc partout où il formate :
c'est ce que dit la décision (« dans `CurrencyFormatter` »), et c'est aussi le comportement du
`formatCurrency` du front (`Intl.NumberFormat`, arrondi `halfExpand` par défaut), que la classe
dit refléter.

## Objectif utilisateur

Le locataire et le comptable lisent sur une facture PDF un sous-total, une TVA et un total qui
s'additionnent, et le même montant que celui qu'on leur encaisse.

## Contrat de données

Aucun changement d'API ni de schéma. Seul le texte des montants fractionnaires rendus par le
serveur change (un demi s'arrondit vers le haut, en valeur absolue).

## Contraintes strictes (métier)

- Les montants rangés en base ne bougent pas : l'arrondi en base est P04.08, à part.
- Le mode d'arrondi est celui d'`amountDue()` et de `PayoutCalculator` : `PHP_ROUND_HALF_UP`,
  soit `NumberFormatter::ROUND_HALFUP` (le demi s'éloigne de zéro).

## Delta à produire

- [x] `CurrencyFormatter::format()` : `ROUNDING_MODE = ROUND_HALFUP`.
- [x] `CurrencyFormatterTest` : 1 250,5 → 1 251 et 18 004,5 → 18 005 en XOF ; 2,125 → 2,13 en EUR.
- [x] `CurrencyPdfRegressionTest` : gabarit de facture rendu sur sous-total 100 025 et TVA 18 % ;
      le sous-total et la TVA lus dans le texte s'additionnent au total lu.

## Critères d'acceptation

- [x] AC1 — `format(1250.5, XOF)` rend « 1 251 F CFA », comme `round(1250.5)` à l'encaissement.
- [x] AC2 — le rendu HTML de `pdf.invoices.default` (sous-total 100 025, TVA 18 004,5, total
      118 029,5) imprime 100 025, 18 005 et 118 030, et sous-total + TVA = total à l'écrit.
- [x] AC3 — les autres tests de `CurrencyFormatterTest` et de `CurrencyPdfRegressionTest` restent
      verts.

## Hors périmètre

- L'arrondi au centime à la création de la facture, de la commission, de la caution et du
  reversement : P04.08.
- Le relevé du bailleur (`OwnerStatementService.php:115-135`), qui additionne des lignes non
  arrondies : la piste le laisse « à vérifier », non mesuré ici. Avec un sous-total lui-même
  fractionnaire, deux arrondis indépendants peuvent encore s'écarter d'une unité : seul P04.08
  (montants entiers en base pour XOF) l'exclut.

## Notes d'implémentation

- **Ablation** (la ligne `ROUNDING_MODE` retirée de `CurrencyFormatter`) → les deux tests neufs
  rougissent : `'1 251 F CFA'` attendu, `'1 250 F CFA'` obtenu ; TVA `18005` attendue, `18004`
  imprimée. Correctif remis → 21 verts sur les deux classes.
- **2,125 et non 0,005 pour l'euro** : 0,005 n'est pas exact en binaire, et l'arrondi du nombre
  converti aurait pu trancher sans le mode. 2,125 est exact : seul le mode décide.
- Le test de gabarit lit les montants dans la cellule qui suit chaque libellé du pied de facture,
  et vérifie l'égalité sur l'écrit, pas sur les valeurs du modèle.
