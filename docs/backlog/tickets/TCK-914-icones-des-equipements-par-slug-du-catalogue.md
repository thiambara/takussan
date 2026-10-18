---
id: TCK-914
title: "Icônes des équipements indexées par les slugs du catalogue"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#26-équipements-du-catalogue-sur-35-saffichent-avec-licône-générique"
tags: [front, pistes]
---

## Contexte

Réf : **P30.05** du fichier de pistes, `validé` (V7 accordé).

`PropertyAmenities.tsx` cherche l'icône par `tag.icon ?? tag.slug`, et aucun tag ne porte
d'`icon`. `amenity-icons.ts` était indexé par des clés que le catalogue (`TagCatalog::EQUIPEMENTS`)
n'émet pas (`cuisine`, `securite`, `salle_sport`, `buanderie`, `internet`, `meuble`…) : 26
équipements sur 35 s'affichaient avec l'icône générique `Building2`.

## Décision du porteur

validé — clés d'icônes alignées sur les slugs du catalogue, icône Lucide la plus proche, revue à la PR ; un test rougit sur un slug du catalogue sans icône

## Objectif utilisateur

Sur la fiche d'un bien, chaque équipement du catalogue se reconnaît à son icône.

## Delta à produire

- [x] `AMENITY_ICONS` indexé par les 35 slugs du catalogue, une icône Lucide chacun.
- [x] Un test lit `TagCatalog.php` et rougit sur un slug sans icône, ou une clé hors catalogue.

## Critères d'acceptation

- [x] AC1 — `getAmenityIcon(<slug du catalogue>)` ne rend jamais l'icône générique.
- [x] AC2 — Les clés de `AMENITY_ICONS` sont exactement les slugs du catalogue.

## Hypothèses

- Les anciennes clés hors catalogue (`pool`, `ac`, `cuisine`, `keybox`…) sont retirées : « clés
  alignées sur les slugs du catalogue ». Un équipement libre d'annonceur qui portait par hasard l'un
  de ces slugs reprend l'icône générique.
- Le choix de chaque icône (35) est à revoir à la PR, comme le dit la décision : `balcon` →
  `Armchair`, `seche-linge` → `Shirt`, `lave-vaisselle` → `Utensils`, `moustiquaires` → `Bug`,
  `aire-de-jeux` → `ToyBrick` sont les moins évidents.

## Notes d'implémentation

- **Reproduction** : `components/__tests__/amenity-icons.tck-914.test.ts` → 27 rouges (les 26
  slugs du constat, et la clé hors catalogue).
- **Ablation** : `amenity-icons.ts` d'avant → 27 rouges ; remis → 37 verts, et 170 verts sous
  `properties/[slug]`.
