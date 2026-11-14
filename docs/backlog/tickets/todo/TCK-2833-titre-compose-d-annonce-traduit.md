---
id: TCK-2833
title: "Le titre proposé d'une annonce se compose dans la langue de l'interface, sans « de », « à » ni « chambre » en dur"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#28-internationalisation--préférences"
  models: []
  tickets:
    - docs/backlog/tickets/done/TCK-631-publication-plein-ecran-et-apercu.md
tags: [front, i18n, publication, titre, suivi-lot-3]
---

## Objectif utilisateur

Qui publie un bien avec l'interface en anglais se voit proposer un titre entièrement en anglais
(« Apartment … in Bel Air ») et non un mélange (« Apartment de 60 m² à Bel Air »).

## Contexte (relevé au HEAD 196e7908f, 2026-11-14)

Relevé sur `/publish` en `en` : le titre proposé à l'étape de finition vaut « Apartment de 60 m² à Bel … ».

Le titre se compose **dans le front**, pas dans l'API : `suggestTitle()`
(`takussan-web/src/components/property-form/wizard/suggest-title.ts`, TCK-464), appelé par
`StepFinition.tsx` et `ApercuAnnonce.tsx`. Seul le type passe par le dictionnaire (`tType`). Trois
segments sont en français dans le code : `de ${area} m²`, `${n} chambre(s)` et `à ${lieu}`. Le
commentaire du module l'assume comme une entorse au principe n° 5 (le front possède le texte), au
motif que la publication « n'est aujourd'hui servie qu'en français ». Le relevé en `en` montre que ce
motif ne tient plus.

Le patron existe déjà : `src/lib/titre-de-la-liste.ts` compose ses titres par gabarits du dictionnaire,
pour que chaque langue décide de l'ordre et de la préposition.

## Contrat de données

Aucun endpoint. Le titre reste une valeur par défaut que l'utilisateur corrige. Les entrées de
`suggestTitle` ne changent pas (type, contrat, surface, chambres, quartier, ville).

## Contraintes strictes (métier)

- Le titre français ne change pas, au caractère près, pour toutes les combinaisons déjà couvertes par
  `suggest-title.test.ts`.
- Chaque langue décide de l'ordre des segments, de la préposition et de l'accord singulier/pluriel
  des chambres (gabarit ICU, pas de concaténation de mots traduits).
- Wolof en pause : les clés neuves portent en `wo` le texte français tel quel.
- Un titre déjà saisi ou modifié par l'utilisateur n'est jamais réécrit (comportement actuel inchangé).

## Delta à produire

- [ ] `suggestTitle` compose tout le titre par le dictionnaire (fr, en, wo), plus seulement le type.
- [ ] Les deux appelants (`StepFinition`, `ApercuAnnonce`) passent ce qu'il faut au module.
- [ ] Le commentaire « entorse assumée » disparaît avec l'entorse.
- [ ] Tests : `suggest-title.test.ts` étendu à `en`.

## Critères d'acceptation

- [ ] AC1 — En `en`, pour un appartement de 60 m² sans chambres à Bel Air, le titre proposé contient
      le libellé anglais du type, « 60 m² » et « Bel Air », et ne contient ni « de », ni « à », ni
      « chambre » comme mot. Test qui échoue au HEAD (ablation : remettre le segment en dur le rend
      rouge).
- [ ] AC2 — En `en`, avec 1 puis 3 chambres, le titre porte le nombre de chambres au singulier puis
      au pluriel **anglais**, et le lieu. Test.
- [ ] AC3 — En `fr`, les attentes existantes de `suggest-title.test.ts` restent vertes **sans être
      modifiées** (diff du fichier : ajouts seulement).
- [ ] AC4 — Au navigateur, `/publish` en `en` (390 et 1280) : le titre proposé à l'étape de
      finition et celui de l'aperçu sont entièrement en anglais. Relevé consigné.
- [ ] AC5 — `node scripts/check-i18n.mjs` (dans `takussan-web`) reste vert : clés présentes dans
      les trois dictionnaires.

## Hors périmètre

- Les autres textes de l'API encore en français (P06.12).
- La justesse du wolof (dette D-24, wolof en pause).
- Le titre des listes publiques (`titre-de-la-liste.ts`), déjà traduit.

## Notes d'implémentation

_(à remplir par implementing-specs)_
