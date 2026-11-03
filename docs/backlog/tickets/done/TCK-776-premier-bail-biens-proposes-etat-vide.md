---
id: TCK-776
title: "Premier bail : le sélecteur propose tout bien ni vendu, ni loué, ni archivé, et dit quand il est vide"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
tags: [front, leases, onboarding, pistes]
---

## Contexte

Réf : **P15.09** du fichier de pistes, `validé` (critère accordé : V7). Le formulaire de création
de bail (`CreateLeaseForm`) ne demandait à l'API que les biens `available`
(`useLeasePropertyOptions`). Un bien neuf (`draft`) ou en modération (`pending_review`) n'y
apparaissait pas, alors que l'API n'exige aucun statut (`StoreLeaseRequest` : `exists` seul). Une
liste vide ne disait rien, sans lien pour créer le bien ou le locataire.

## Décision du porteur

biens proposés : tous sauf sold, archived et rented ; état vide avec des liens « créer un bien » et « ajouter un locataire »

## Delta à produire

- [x] `STATUTS_BIEN_POUR_UN_BAIL` (`lib/queries/leases.ts`) : les huit statuts de `PropertyStatus`
      hors `sold`, `archived` et `rented`, envoyés en `filter[status]=a,b,…` (filtre exact de
      spatie, liste séparée par des virgules).
- [x] `CreateLeaseForm` : sous les deux sélecteurs, un état vide quand une liste est vide une fois
      chargée — le texte, puis « Créer un bien » (`/app/properties/new`) et/ou « Ajouter un
      locataire » (`/app/customers/new`).
- [x] Quatre clés `lease.form.*` en fr et en ; en wo, le texte français tel quel (wolof en pause).

## Critères d'acceptation

- [x] AC1 — Le sélecteur demande exactement les huit statuts, sans `sold`, `archived` ni `rented`.
- [x] AC2 — Sans bien ni locataire, le formulaire le dit et rend les deux liens.
- [x] AC3 — Avec un bien et un locataire, aucun état vide.

## Hypothèses (mode sans humain)

- Chaque lien suit sa liste : « Créer un bien » quand aucun bien n'est proposé, « Ajouter un
  locataire » quand la recherche de locataires ne rend rien. Un gérant qui a des biens et aucun
  locataire voit ainsi le seul lien utile.
- Le statut `PropertyStatus` est recopié côté front : aucune source partagée n'énumère ses cas.
  Un statut ajouté à l'API sans l'être ici ne serait pas proposé.

## Notes d'implémentation

- Ablation : `leases.ts` et `CreateLeaseForm.tsx` remis à `pre-dev` → AC1 et AC2 rougissent
  (le filtre est la chaîne `'available'`, aucun texte d'état vide) ; remis → 3 verts, et les 14
  fichiers de `components/leases/__tests__/` verts (70 tests).
