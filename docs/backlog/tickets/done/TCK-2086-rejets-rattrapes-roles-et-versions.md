---
id: TCK-2086
title: "Les rejets des gestes de rôle et de version de document sont rattrapés, l'erreur restant affichée"
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
    - "docs/features.md#22-rôles--permissions"
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-210--gestionnaires-async-du-front-qui-attendent-mutateasync-sans-rattraper-lerreur"
tags: [front, roles, documents, erreurs, pistes]
---

## Contexte

Réf : **P210.04** du fichier de pistes, `retenu · autonome` (A1 : la forme
`void f().catch(() => undefined)`, l'erreur lue sur la mutation, est déjà celle du code voisin,
`MaintenanceAssignmentBlock`, `QuoteSubmitForm`).

Quatre gestionnaires appelés par `void f()` attendaient `mutateAsync` sans `catch` : `save` de
`AgencyRoleEditor`, `submit` de `CreateRoleDialog`, `handleSubmit` et `handleConfirm` de
`DocumentVersionsList`. Chaque écran affiche déjà l'erreur lue sur la mutation ; le rejet sortait
pourtant non rattrapé (`void` ne fait que taire l'avertissement).

## Delta à produire

- [x] `.catch(() => undefined)` aux quatre appels ; aucun changement visible.
- [x] Un test par composant, qui rejette la mutation et compte les rejets non rattrapés :
      `AgencyRoleEditor.rejet-rattrape.p210-04.test.tsx`,
      `CreateRoleDialog.rejet-rattrape.p210-04.test.tsx`,
      `DocumentVersionsList.rejet-rattrape.p210-04.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un enregistrement de rôle rejeté ne laisse aucun rejet non rattrapé ; la
      synchronisation des capacités ne part pas, rien n'est dit enregistré.
- [x] AC2 — Une création de rôle rejetée ne laisse aucun rejet non rattrapé ; le dialogue reste
      ouvert et `onCreated` n'est pas appelé.
- [x] AC3 — Un ajout et une restauration de version rejetés ne laissent aucun rejet non
      rattrapé ; le dialogue reste ouvert.

## Hors périmètre

- Une garde de lint qui refuse le motif (P210.05, au porteur : V6).

## Notes d'implémentation

- Les tests écoutent `process.on('unhandledRejection')` le temps du test : le rejet devient une
  assertion rouge du test, et non une erreur de fin d'exécution que Vitest compte à part.
- Ablation : les trois composants rendus à `pre-dev` → 4/4 tests neufs rouges (« expected
  [ Error: API error 422 ] to have a length of +0 but got 1 ») ; correctif remis → 4/4 verts, et
  `AgencyRoleEditor.test.tsx` (8), `CreateRoleDialog.test.tsx` (7),
  `DocumentDetailClient.abilities.test.tsx` (3) verts.
