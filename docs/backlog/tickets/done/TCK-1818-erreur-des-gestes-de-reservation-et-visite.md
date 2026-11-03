---
id: TCK-1818
title: "L'erreur d'un geste de réservation ou de visite s'affiche, le dialogue restant ouvert"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-182--gestes-de-transition-rejoués-sur-un-état-déjà-atteint"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, reservations, visites, erreurs, pistes]
---

## Contexte

Réf : **P182.01** du fichier de pistes, `retenu · autonome` (A1 : ADR-0019 fixe le rendu d'une
erreur d'API dans un composant client par `useMessageErreurApi()`).

`BookingDecisionDialog` (accepter, refuser, annuler une réservation) et `VisitDetail` (confirmer,
terminer, marquer absent, annuler, replanifier une visite) attendaient la mutation sans `catch`.
Une erreur de l'API (422 `booking.dates_overlap`, `visit.cannot_cancel`…) rejetait une promesse
que rien ne rattrapait : aucun message, et le dialogue restait ouvert sans rien dire.

## Hypothèse retenue

Le repli est le libellé générique `errors.api.unknown` de `useMessageErreurApi()` : aucun texte
neuf. L'erreur d'un geste sans dialogue (confirmer, terminer, absent) s'affiche dans un
`role="alert"` au-dessus des actions de la fiche, celle d'un geste à dialogue dans le dialogue,
comme `InvoiceDetailDialog`.

## Delta à produire

- [x] `BookingDecisionDialog` : `try`/`catch` autour de `onSubmit`, message dans un
      `role="alert"` du dialogue, effacé au nouvel essai et à la fermeture.
- [x] `VisitDetail` : les trois gestes sans dialogue passent par `geste()`, qui rattrape et
      affiche l'erreur ; `VisitActionForm` rattrape celle de l'annulation et de la replanification.
- [x] Tests vitest `BookingDetail.erreur-geste.p182-01.test.tsx` et
      `VisitDetail.erreur-geste.p182-01.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Une mutation de réservation rejetée en 422 affiche le message de l'API dans le
      dialogue, qui reste ouvert ; un second essai réussi l'efface.
- [x] AC2 — Une confirmation de visite rejetée affiche le message de l'API, sans toast de succès.
- [x] AC3 — Une annulation de visite rejetée affiche le message de l'API dans le dialogue, qui
      reste ouvert.

## Hors périmètre

- La relecture de l'état après une erreur (P182.02, au porteur).
- `CustomerPayCta.handleClick` (`BookingDetail.tsx`) attend aussi `mutateAsync` sans `catch` :
  vu au passage, hors de la piste.

## Notes d'implémentation

- Ablation : les deux composants rendus à `pre-dev` → 4/4 tests neufs rouges (« Unable to find
  role="alert" », quatre `Unhandled Rejection`) ; correctif remis → 4/4 verts, et les 18 fichiers
  de test de `bookings/__tests__` et `VisitDetail*` verts (70 tests).
