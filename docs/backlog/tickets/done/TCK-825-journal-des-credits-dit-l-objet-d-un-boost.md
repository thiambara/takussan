---
id: TCK-825
title: "Crédits : le journal dit le bien et l'offre d'une dépense ou d'un remboursement de boost"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-24--crédits-et-boost--idempotence-des-achats-remboursements-ce-que-voit-lespace"
tags: [back, front, boost, credits, pistes]
---

## Contexte

Réf : **P24.03** du fichier de pistes, `validé` (V7 accordé).

La page « Crédits » (`CreditsPanel`) rendait le journal en date, type, montant et motif. Une dépense
de boost est écrite sans motif, et un remboursement automatique aussi : leurs lignes se lisaient
« Dépense −20 — », sans le bien ni l'offre. `CreditMovementResource` n'émettait que
`property_boost_id`, qu'aucune colonne ne lisait.

## Décision du porteur

validé — colonne « Objet » dans le journal : le bien et l'offre d'une dépense ou d'un remboursement de boost

## Objectif utilisateur

L'administrateur de l'espace lit, dans l'historique de ses crédits, sur quel bien et pour quelle
offre chaque crédit a été dépensé ou rendu.

## Contrat de données

- `GET /api/credits` : chaque mouvement porte `boost` — `{id, kind, variant, property: {id, title}}`,
  ou `null` hors boost. Chargé d'avance (`boost`, `boost.property`) : deux requêtes pour la page,
  pas une par ligne.
- La ressource ne le rend que chargé (`whenLoaded`) : le portefeuille de la console
  (`AdminCreditWalletController`) ne change pas.

## Contraintes strictes (métier)

- L'offre se dit par son genre et sa variante, **pas par sa durée** : une Vedette prolongée cumule
  ses durées sur une seule ligne (ADR-0061 § 5), et la durée de la ligne de boost ne serait pas
  celle de l'achat que le mouvement débite.

## Delta à produire

- [x] `CreditMovementResource` : clé `boost` ; `CreditController::show()` : chargement anticipé.
- [x] Front : colonne « Objet » dans `CreditsPanel`, textes `credits.movements.colObject`,
  `object`, `offers.*` en `fr` et `en`.
- [x] Tests : `CreditMovementObjectTest`, un cas de `CreditsPanel.test.tsx`.

## Critères d'acceptation

- [x] AC1 — La dépense et le remboursement d'un même badge disent le bien et l'offre.
- [x] AC2 — Un octroi n'a pas d'objet (`boost: null`, « — »).

## Hypothèses

- Le texte `wo` porte le texte français tel quel (wolof en pause depuis le 2026-10-16).
- La liste des boosts de l'espace sur la page « Crédits » (le « boosts » de `features.md`) n'est
  pas demandée par la décision : seule la colonne l'est.

## Hors périmètre

- Une liste des boosts de l'espace sur la page « Crédits ».

## Notes d'implémentation

- Ablation : colonne retirée → le cas de `CreditsPanel` rouge ; chargement anticipé retiré → le
  test d'API rouge (`boost` absent de la réponse).
