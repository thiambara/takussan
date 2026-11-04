---
id: TCK-661
title: "Le détail d'un reversement plateforme s'ouvre au clavier"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa
tags: [front, accessibilite, clavier, super-admin, pistes]
---

## Contexte

Réf : **P07.05** du fichier de pistes (classement A4 : rendre la période cliquable par un
`<button>` quand `onSelect` est fourni, avec le texte qu'elle affiche déjà, sans texte ni
comportement neuf).

Dans `/super-admin/payouts`, `AdminPayoutsClient` passe `onSelect` à `PayoutTable`, seul chemin
vers `PayoutDetailPanel`. La sélection était portée par un `<tr onClick>` sans rôle, sans
`tabIndex` ni clavier, et la ligne ne contenait aucun élément focusable : le détail d'un
reversement était inatteignable au clavier (WCAG 2.2 §2.1.1).

## Objectif

Quand `onSelect` est fourni, chaque ligne de `PayoutTable` expose un bouton atteignable par Tab et
activable par Entrée ou Espace, qui sélectionne le reversement une seule fois.

## Delta à produire

- [x] `PayoutTable.tsx` : avec `onSelect`, la période est rendue dans un `<button type="button">`
      (patron d'`InvoicesTable`), qui arrête la propagation pour que le `<tr onClick>` gardé pour
      la souris ne rejoue pas la sélection. Sans `onSelect` (console agence), rendu inchangé.
- [x] Test : `PayoutTable.clavier.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Avec `onSelect`, Tab atteint un bouton dans la ligne, et Entrée appelle `onSelect`
      une fois avec le reversement.
- [x] AC2 — Espace sélectionne aussi ; un clic sur le bouton ne sélectionne qu'une fois.
- [x] AC3 — Sans `onSelect`, la table ne rend aucun bouton.

## Hypothèses (mode sans humain)

- Le bouton porte le texte de période déjà affiché, sans `aria-label` neuf : la période identifie
  la ligne, et la `Piste` exclut tout texte neuf.
- Le clic sur toute la ligne est gardé pour la souris, comme avant.

## Hors périmètre

- Les autres lignes cliquables à la seule souris du dépôt ne sont pas recensées ici.

## Notes d'implémentation

- Rouge avant correctif : 2 tests — Tab laisse le focus sur `BODY`, et Espace n'appelle jamais
  `onSelect`.
- Ablation : correctif retiré → les 2 mêmes rouges ; `stopPropagation` seul retiré → les 2 tests
  rouges sur « appelé 2 fois » (le clic synthétisé par Entrée/Espace remonte au `<tr>`) ;
  correctif remis → vert.
