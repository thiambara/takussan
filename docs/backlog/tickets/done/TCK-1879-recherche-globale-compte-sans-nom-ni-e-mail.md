---
id: TCK-1879
title: "La recherche globale de la console rend un compte créé par téléphone au lieu d'un 500"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-193--comptes-et-invitations-sans-e-mail-face-aux-textes-et-avis-bâtis-sur-l-e-mail"
tags: [api, console, recherche, pistes]
---

## Objectif

`GET /api/admin/search` rend 200 quand il trouve un compte sans nom ni e-mail, avec un libellé
non vide.

## Contexte

Réf : **P193.01** du fichier de pistes, `retenu · autonome` (A1 : `hit()` est typé `string`, et
la recherche rend 200 dans `AdminGlobalSearchTest`).

- `AdminGlobalSearchService::users()` passait `full_name ?: email` en libellé ; un compte créé par
  `PhoneLoginService::createAccount` a des noms vides et un `email` nul → `TypeError` → 500.
- La recherche par numéro est précisément celle qui trouve ces comptes.

## Hypothèses (mode sans humain)

- Le repli du libellé est celui que la `Mesure` du mesureur décrit : nom, puis e-mail, puis
  numéro (celui que l'opérateur vient de saisir), puis `#<id>`. Aucun texte neuf.
- Le sous-libellé reste l'e-mail (nul pour ce compte) : le changer serait un comportement visible
  que la piste ne demande pas.

## Delta à produire

- [x] `AdminGlobalSearchService::users()` : colonne `phone` lue, libellé `full_name ?: email ?: phone ?: '#'.id`.
- [x] Test : compte créé par téléphone, trouvé par son numéro → 200, libellé = le numéro.

## Critères d'acceptation

- [x] AC1 — Un compte `email` nul, noms vides, `+221771234567`, cherché par `+221771234567` par un
  opérateur Support → 200, un seul résultat `user` (ce compte), libellé `+221771234567`.

## Hors périmètre

- Les autres textes bâtis sur l'e-mail de l'angle 193 (P193.02 à P193.06), et l'angle 221 né de
  cette piste (arguments typés `string` nourris par une colonne nullable).

## Notes d'implémentation

- Ablation : repli rendu à `full_name ?: email` (colonne `phone` gardée) → le test neuf rouge
  (500, `hit(): Argument #3 ($label) must be of type string, null given`) ; correctif remis → 14 verts.
