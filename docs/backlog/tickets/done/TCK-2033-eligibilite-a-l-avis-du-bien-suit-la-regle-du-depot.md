---
id: TCK-2033
title: "La lecture d'éligibilité à l'avis d'un bien rend le verdict du dépôt"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#11-review"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-201--gestes-à-usage-unique-jugés-par-une-lecture-déligibilité-faite-au-montage"
tags: [api, front, avis, i18n, pistes]
---

## Objectif utilisateur

Le client qui ouvre la fiche d'un bien voit le formulaire d'avis exactement quand l'API acceptera
son avis : ni formulaire offert puis refusé, ni refus annoncé à qui peut noter.

## Contexte

Réf : **P201.01** du fichier de pistes.

## Décision du porteur (déléguée)

> validé (délégué) — la règle d'ADR-0043 § 3 fait foi, pas TCK-180 : `GET /api/public/properties/{slug}/review-eligibility` rend le verdict de `ReviewEligibility::forProperty` (réservation `confirmed`/`completed`, bail `active`/`terminating`/`terminated`/`expired` dont le compte est le locataire ; une visite `completed` n'ouvre plus l'avis du bien), et `already_reviewed` se lit en `withTrashed()` (un avis retiré compte, ADR-0043 § 3) ; le texte `property.reviews.notEligible` devient « Vous pourrez laisser un avis après une réservation honorée ou un bail sur ce bien. » (en : « You can leave a review after a completed booking or a lease on this property. » ; wo : le français tel quel) ; garde : le test par preuve de la `Piste`

## Hypothèses (mode sans humain)

- `reason` prend les valeurs `booking`, `lease` ou `none` (`ReviewEligibility::contextKind` de la
  preuve) ; `visit` n'est plus rendu. Le front ne lit pas ce champ (lu, `actions/property.ts:174-182`).
- Le super-administrateur, que `StoreForPropertyReviewRequest::authorize` laisse passer sans preuve,
  reste jugé par `forProperty` seul : la décision désigne ce verdict.
- **Wolof** : le texte `wo` existant n'est pas touché, le wolof étant en pause depuis le 2026-10-16
  (aucune réécriture d'un texte `wo` existant). Il cite encore la visite.

## Delta à produire

- [x] `PublicPropertyController::reviewEligibility` : `ReviewEligibility::forProperty` pour le
  verdict, `withTrashed()` pour `already_reviewed`.
- [x] `property.reviews.notEligible` en `fr` et `en`, au texte de la décision.
- [x] Garde : `PropertyReviewEligibilityTest::test_eligibility_read_matches_what_the_deposit_accepts`,
  une preuve par cas (visite finalisée, bail par statut avec et sans avis retiré, réservation par
  statut) ; le test qui figeait la visite comme preuve est retourné.

## Critères d'acceptation

- [x] AC1 — pour chaque preuve, `eligible && !already_reviewed` vaut « le dépôt rend 201 ».
- [x] AC2 — une visite finalisée seule rend `eligible=false`, `reason=none`.

## Hors périmètre

- Le texte `wo` (pause du wolof).
- Les prédicats des fiches de bail et de réservation (TCK-2037, P201.03).

## Notes d'implémentation

- Reproduit sur `96d942893` : 13 des 21 cas du fournisseur rouges, dans les deux sens (« lu
  éligible, dépôt 403 » et « lu non éligible, dépôt 201 »), plus le test qui figeait la visite.
- Ablation : contrôleur remis → 14 rouges ; rétabli → 26 verts.
