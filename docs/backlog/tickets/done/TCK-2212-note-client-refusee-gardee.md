---
id: TCK-2212
title: "Une note du tiroir client refusée par l'API reste dans le champ, avec son message"
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
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-228--mutations-lancées-par-mutate-sans-onerror-et-dont-lécran-ne-lit-pas-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, crm, erreurs, pistes]
---

## Contexte

Réf : **P228.02** du fichier de pistes, `retenu · autonome` (A1 : ADR-0019 fixe le rendu d'une
erreur d'API par `useMessageErreurApi()`, et la borne de 5 000 caractères est écrite dans
`StoreCustomerNoteRequest`).

Dans le tiroir de fiche client du pipeline, `NotesTab` vidait le champ dans le même gestionnaire
que l'envoi, avant toute réponse, et `noteMutation` n'avait qu'un `onSuccess` : une note refusée
(plus de 5 000 caractères, 403, réseau) disparaissait sans message.

## Hypothèse retenue

Le message se dit sous le champ, dans un `role="alert"`, tant que la dernière tentative a échoué ;
le repli est le libellé générique `errors.api.unknown`. Aucun texte neuf.

## Delta à produire

- [x] `CustomerDetailSheet` : le champ ne se vide que dans l'`onSuccess` de l'appel ; l'erreur de
      la mutation s'affiche sous le champ ; `maxLength={5000}` sur le `Textarea`.
- [x] Test vitest `CustomerDetailSheet.note-refusee.p228-02.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Une note refusée reste dans le champ, et le message de l'API s'affiche.
- [x] AC2 — Une note acceptée vide le champ, sans message.
- [x] AC3 — Le champ porte `maxLength=5000`.

## Hors périmètre

- La page de fiche client (`CustomerNotesTimeline`), qui passe par une action serveur.

## Notes d'implémentation

- Ablation : `CustomerDetailSheet.tsx` rendu à `pre-dev` → 2 rouges sur 3 (AC1, AC3 ; AC2 est
  le témoin de non-régression) ; correctif remis → 3/3 verts, et
  `activite-relue-apres-les-gestes.tck-2093.test.tsx` vert (5 tests).
