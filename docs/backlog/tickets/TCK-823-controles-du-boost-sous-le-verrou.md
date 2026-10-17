---
id: TCK-823
title: "Boost : « bien public » et « offre active » jugés sous le verrou de l'achat"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-822]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#93-propertyboost-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-24--crédits-et-boost--idempotence-des-achats-remboursements-ce-que-voit-lespace"
tags: [back, credits, boost, concurrence, pistes]
---

## Contexte

Réf : **P24.04** du fichier de pistes, `validé` (V1 accordé).

`BoostPurchaseService::purchase()` contrôlait l'offre active et le bien public **avant** d'ouvrir
la transaction et de verrouiller l'espace et le bien, et rien n'était re-vérifié sous le verrou.
Une location, une dépublication ou un retrait d'offre écrit entre les deux passait : la mesure
du mesureur a débité une Vedette sur un bien `rented`.

## Décision du porteur

validé — contrôles « bien public » et « offre active » déplacés sous le verrou, sur la ligne verrouillée ; 422 sans débit

## Objectif utilisateur

Un boost n'est jamais acheté, ni débité, sur un bien qui a quitté le public ou pour une offre
retirée, même si le changement tombe pendant l'achat.

## Contraintes strictes

- Le prédicat public reste `Property::scopePublic()`, composé et jamais recopié.
- Le rejeu d'une clé d'idempotence (TCK-822) passe **avant** ces contrôles : un achat déjà fait
  se rejoue en 200, même si le bien a quitté le public depuis.

## Hypothèses (mode sans humain)

- L'offre est relue sous un verrou **partagé** (`FOR SHARE`) : un retrait concurrent attend la fin
  de l'achat, sans sérialiser deux achats de la même offre par deux espaces.
- `offerFeatured()` (Vedette offerte) prend le même contrôle « bien public » sous le verrou : il
  partageait le même helper.
- Le contrôle « bien rattaché à un espace » reste avant le verrou : le verrou de l'espace en a
  besoin.

## Delta à produire

- [x] `assertBoostable()` scindé : `assertHasSpace()` avant le verrou, `assertPublic()` et
      `assertProductActive()` sous le verrou.
- [x] `tests/Feature/Boost/BoostPurchaseUnderLockTest.php`.

## Critères d'acceptation

- [x] AC1 — Un bien passé à `rented` juste avant le `FOR UPDATE` sur l'espace : 422
      `boost.property_not_public`, solde inchangé, aucune ligne `property_boosts`.
- [x] AC2 — Une offre passée inactive au même instant : 422 `boost.product_inactive`, sans débit.
- [x] AC3 — Sans changement, l'achat passe (201).

## Hors périmètre

- La pause d'un boost déjà actif sur un bien qui quitte le public (`boosts:tick`), inchangée.

## Notes d'implémentation

- **Ablation** : le service remis à son état d'avant (contrôles avant le verrou), AC1 et AC2
  rougissent (201 et débit), AC3 reste vert ; remis, les 3 sont verts, et les 94 tests de
  `tests/Feature/Boost` aussi.
- Le test écrit le changement par `DB::beforeExecuting`, au premier `select … from "agencies" …
  for update` : c'est l'instant exact entre l'ancien contrôle et le verrou.
