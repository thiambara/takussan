---
id: TCK-2084
title: "Une suppression de recherche sauvegardée qui échoue se dit sur sa ligne"
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
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-210--gestionnaires-async-du-front-qui-attendent-mutateasync-sans-rattraper-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, recherche, erreurs, pistes]
---

## Contexte

Réf : **P210.03** du fichier de pistes, `retenu · autonome` (A1 : ADR-0019 fixe le rendu d'une
erreur d'API par `useMessageErreurApi()`, avec un repli existant).

`SavedSearchesList.handleDelete` attendait `remove.mutateAsync({ id })` en `try … finally`, sans
`catch`. Une suppression qui échoue (panne, 403 hors propriétaire, 404) laissait la ligne à
l'écran sans un mot, et le rejet sortait non rattrapé.

## Hypothèse retenue

Le message se dit dans un `role="alert"` sur la ligne visée, sous le réglage de son alerte, et
s'efface au nouvel essai. Le repli est le libellé générique `errors.api.unknown` : aucun texte
neuf.

## Delta à produire

- [x] `SavedSearchesList` : `catch` dans `handleDelete`, message par `useMessageErreurApi()`
      gardé avec l'`id` de la ligne ; `SavedSearchRow` reçoit `deleteError` et l'affiche.
- [x] Test vitest `SavedSearchesList.suppression-refusee.p210-03.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un `DELETE` en erreur affiche le message de l'API sur la ligne visée, et sur elle
      seule ; la ligne reste affichée.
- [x] AC2 — Un nouvel essai efface le message de la ligne.

## Hors périmètre

- Les autres listes du même motif : relevées par l'angle 210, chacune sa piste.

## Notes d'implémentation

- Ablation : `SavedSearchesList.tsx` rendu à `pre-dev` → 2/2 tests neufs rouges (« Unable to
  find role="alert" », deux `Unhandled Rejection: API error 500`) ; correctif remis → 2/2 verts,
  et les trois autres fichiers `SavedSearchesList.*.test.tsx` verts.
