---
id: TCK-2082
title: "Le paiement d'une réservation refusé par l'API affiche son message sous le bouton du client"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-210--gestionnaires-async-du-front-qui-attendent-mutateasync-sans-rattraper-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, reservations, paiements, erreurs, pistes]
---

## Contexte

Réf : **P210.02** du fichier de pistes, `retenu · autonome` (A1 : ADR-0019 fixe le rendu d'une
erreur d'API par `useMessageErreurApi()`, avec un repli existant ; le correctif n'écrit ni ne
calcule aucun montant).

`CustomerPayCta.handleClick` (`BookingDetail.tsx`) attendait `createPayment.mutateAsync` sans
`catch`, passé tel quel à `onClick`. Un refus de l'API (422 `booking_payment.nothing_due` quand
le paiement a été acquitté pendant que la fiche affichait encore le bouton) ne se disait pas : le
bouton se réactivait, sans message.

## Hypothèse retenue

Le message se dit dans un `role="alert"` sous le bouton, dans la section du paiement, effacé au
nouvel essai. Le repli est le libellé générique `errors.api.unknown` : aucun texte neuf.

## Delta à produire

- [x] `CustomerPayCta` : `try`/`catch` autour de `mutateAsync`, message par
      `useMessageErreurApi()` dans un `role="alert"` de la section, effacé au nouvel essai.
- [x] Test vitest `BookingDetail.paiement-refuse.p210-02.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Une demande de paiement rejetée en 422 affiche le message de l'API, le bouton
      restant actif.
- [x] AC2 — Un nouvel essai réussi efface le message.

## Hors périmètre

- La relecture de la réservation après un `nothing_due` (le bouton reste affiché depuis le
  cache) : choix de comportement à part.

## Notes d'implémentation

- Ablation : `BookingDetail.tsx` rendu à `pre-dev` → 2/2 tests neufs rouges (deux
  `Unhandled Rejection: API error 422`, « Unable to find role="alert" ») ; correctif remis →
  2/2 verts, et les 15 fichiers de `bookings/__tests__` verts (51 tests).
- Les deux hooks neufs se posent avant les retours anticipés du composant (règle des hooks).
