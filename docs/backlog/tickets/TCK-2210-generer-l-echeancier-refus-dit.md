---
id: TCK-2210
title: "« Générer l'échéancier » ne se monte que là où il aboutit, et son refus se dit"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-228--mutations-lancées-par-mutate-sans-onerror-et-dont-lécran-ne-lit-pas-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, baux, erreurs, pistes]
---

## Contexte

Réf : **P228.01** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

Sur la fiche d'un bail, « Générer l'échéancier » était monté par un test de rôle (`isAgentSurface`)
pour tout bail non `draft`, alors que la route juge `recordPayment` (P46.05) et que
`LeaseService::scheduleUnderLock` refuse en 422 tout bail qui n'est pas `active`, puis tout bail
dont l'échéancier existe. `generateSchedule.mutate({})` n'avait aucun `onError` et l'écran ne lisait
pas l'erreur : le clic refusé remettait le bouton au repos, sans rien dire.

## Décision du porteur (déléguée)

> afficher le refus de « Générer l'échéancier » par un `onError` qui passe par `useMessageErreurApi` (repli générique, aucune clé neuve), dans une ligne `role="alert"` sous les gestes comme la révision de loyer (P210.01), et ne monter le bouton que sous `abilities.record_payment` et pour un bail `active` ; le cas de `LeaseDetail.capacites.test.tsx:106-107` réécrit sur `record_payment`

## Reste à faire

> le drapeau d'API « échéancier absent » qui cacherait aussi le bouton quand l'échéancier existe déjà

## Hypothèses (mode sans humain)

- Le message est effacé au clic suivant ; la ligne `role="alert"` est distincte de celle de la
  révision de loyer, chaque geste gardant son propre refus.
- Le bouton d'ajout de document reste sous `isAgentSurface` (hors de cette piste).

## Delta à produire

- [x] `LeaseDetail` : bouton monté sous `abilities.record_payment` et `status === 'active'` ;
      `onError` de l'appel vers `useMessageErreurApi()`, affiché en `role="alert"` sous les gestes.
- [x] `LeaseDetail.capacites.test.tsx` : le cas « sans capacités » exige l'absence du bouton, le
      cas `record_payment` sa présence.
- [x] Test vitest `LeaseDetail.echeancier.p228-01.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un refus de l'API affiche son message sous les gestes ; un succès suivant l'efface.
- [x] AC2 — Sans `record_payment`, ou sur un bail `pending_signature`, `terminated` ou `expired`,
      le bouton n'est pas monté.

## Hors périmètre

- Le drapeau d'API « échéancier absent » (reste du porteur).
- Les autres sites de l'angle 228 (tickets à part).

## Notes d'implémentation

- Ablation : `LeaseDetail.tsx` rendu à `pre-dev` → 7 tests rouges sur 13 (les 6 neufs, et le cas
  réécrit de `LeaseDetail.capacites`) ; correctif remis → 13/13 verts, et les 7 fichiers
  `LeaseDetail.*.test.tsx` verts (31 tests).
