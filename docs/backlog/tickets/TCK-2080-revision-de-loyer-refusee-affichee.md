---
id: TCK-2080
title: "Une révision de loyer refusée par l'API affiche son message sur la fiche du bail"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-210--gestionnaires-async-du-front-qui-attendent-mutateasync-sans-rattraper-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, baux, erreurs, pistes]
---

## Contexte

Réf : **P210.01** du fichier de pistes, `retenu · autonome` (A1 : ADR-0019 fixe le rendu d'une
erreur d'API dans un composant client par `useMessageErreurApi()`, avec un repli existant).

`LeaseDetail.handleRentReview` attendait `reviewRent.mutateAsync(...)` sans `catch`, et la
fonction `async` était passée telle quelle à `onClick`. Un refus de l'API (motif de moins de
5 caractères, variation au-delà du plafond sans `force`, bail hors des statuts révisables) ne
s'affichait pas : après les deux saisies, rien ne se passait.

## Hypothèse retenue

Le message se dit dans un `role="alert"` sous la rangée des gestes de la fiche, effacé à la
tentative suivante. Le repli est le libellé générique `errors.api.unknown` : aucun texte neuf.

## Delta à produire

- [x] `LeaseDetail` : `try`/`catch` autour de `mutateAsync`, message par `useMessageErreurApi()`
      dans un `role="alert"`, effacé au nouvel essai ; pas de toast de succès sur un refus.
- [x] Test vitest `LeaseDetail.revision-refusee.p210-01.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Une révision rejetée en 422 affiche le message de l'API, sans toast de succès.
- [x] AC2 — Une révision acceptée après un refus efface le message et montre le toast.

## Hors périmètre

- Le remplacement des `window.prompt` par un dialogue qui montre les bornes du motif et de la
  variation avant l'envoi (choix d'écran, noté par la `Piste`).
- Les sorties muettes d'une saisie écartée par le front lui-même (montant non numérique ou nul,
  motif vide) : les dire demande un texte neuf.

## Notes d'implémentation

- Ablation : `LeaseDetail.tsx` rendu à `pre-dev` → 2/2 tests neufs rouges (« Unable to find
  role="alert" », deux `Unhandled Rejection: API error 422`) ; correctif remis → 2/2 verts, et
  les 6 fichiers `LeaseDetail.*.test.tsx` verts (25 tests).
