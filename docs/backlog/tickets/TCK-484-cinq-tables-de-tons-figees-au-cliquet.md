---
id: TCK-484
title: "Cinq tables de tons décident encore une couleur hors de `StatusBadge`, figées au cliquet faute de vocabulaire commun"
status: todo
phase: P3
family: front
estimate: M
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-472]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, dette]
---

## Objectif utilisateur

Un même état doit avoir la même couleur d'un écran à l'autre. Cinq familles y échappent encore,
délibérément et par écrit — ce ticket est là pour que « délibérément » ne devienne pas « oublié ».

## Le défaut

TCK-472 a fait de `console/StatusBadge.tsx` le décideur unique de la couleur d'un statut. Cinq
fichiers décident encore depuis une table à eux, sous un vocabulaire que les cinq tons du DS ne
savent pas dire :

| fichier | vocabulaire | pourquoi il n'a pas été absorbé |
|---|---|---|
| `inventory/labels.ts` | états des lieux, types et états d'élément | trois tables, vocabulaire propre |
| `maintenance/labels.ts` | statuts et priorités de maintenance | onze statuts, dont aucun ne se plie aux cinq tons |
| `maintenance/MaintenancePriorityBadge.tsx` | priorités, pas statuts | porte une variante `dark:` explicite que `StatusBadge` n'a pas |
| `calendar/event-colors.ts` | types d'événement | une couleur par TYPE, jamais par statut |
| `calendar/CalendarPage.tsx` | la légende du calendrier | recopie les pastilles d'`event-colors.ts` |

Les absorber est **un vrai travail de design**, pas un refactor : il faut décider si le DS gagne
des tons, ou si ces familles ont droit à un vocabulaire séparé et assumé.

## Ce qui tient la dette en attendant

`scripts/check-status-badge-unique.mjs`, contrôle **C** : la liste `TABLES_DE_TONS_CONNUES` est un
cliquet **à deux sens** — un fichier de plus est un doublon neuf, un fichier de moins est une
entrée périmée.

⚠ **C'est le sens « de moins » qui compte le plus ici**, et il n'est pas intuitif : *une liste
périmée est précisément ce dont TCK-472 est né* — une affirmation d'unicité qui n'était plus vraie
et que personne ne remesurait. Un cliquet à un seul sens serait une tolérance, pas une garde.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Trancher, **famille par famille** : le DS gagne des tons, ou la famille garde son vocabulaire
      et le déclare. Les cinq n'ont pas forcément la même réponse.
- [ ] Retirer du cliquet chaque entrée absorbée, **dans le même diff** que son absorption.
- [ ] `calendar/CalendarPage.tsx` est un cas à part : il **recopie** `event-colors.ts`. Cette
      duplication-là se ferme sans aucune décision de design.

## Critères d'acceptation

- [ ] **AC1** — chaque famille conservée porte, dans son propre fichier, **la phrase qui dit ce que
      `StatusBadge` ne sait pas faire pour elle**. *« C'est historique » n'est pas cette phrase*
      (AC2 de TCK-472, repris).
- [ ] **AC2** — le contraste des tons de chaque famille conservée est mesuré **sur ses propres
      surfaces**, dans les deux thèmes, par calcul.
- [ ] **AC3** — `node scripts/check-status-badge-unique.mjs` reste vert, avec un cliquet dont le
      compte **a changé** : une absorption qui laisserait la liste intacte serait invisible.
- [ ] **AC4** — ablation dans les **deux** sens : réintroduire une entrée absorbée rougit, et
      retirer une entrée encore vivante rougit aussi.

## Hors périmètre

- Le jeton `--destructive`, qui a son propre ticket (TCK-480).
- Les bandeaux et encarts qui emploient une couleur pour un **message** et non pour un statut :
  hors-périmètre écrit de TCK-450 et TCK-472.

## Notes d'implémentation

Ouvert par la session à la clôture du lot de la vague 52, sur la liste que TCK-472 a figée. Le
ticket existe pour que le cliquet ait une adresse : *une tolérance sans ticket est une décision que
personne ne reprendra.*
