---
id: TCK-1196
title: "Console, étiquettes : zod ne se charge qu'à l'envoi du formulaire de création"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1194]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#lécran-des-étiquettes-est-le-seul-de-la-console-à-charger-zod-pour-une-validation-faite-à-lenvoi-dun-dialogue-fermé"
tags: [front, performance, super-admin, pistes]
---

## Contexte

Réf : **P104.02** du fichier de pistes, `retenu · autonome` (A2). Parmi les pages de la console,
seule `tags/page.tsx` atteint zod, par `TagsManager → lib/schemas/tag.ts`, pour lire
`tagTypeValues` (un tableau `as const`) et valider par `tagFormSchema.safeParse` à l'envoi de
`CreateTagDialog`, fermé au chargement. Morceau propre à la page : 64,2 Kio gzip (mesure de
l'explorateur).

## Objectif

Le graphe client de `/super-admin/tags` n'atteint plus zod ; la validation et ses messages sont
inchangés.

## Delta à produire

- [x] `lib/enums/tag.ts` : `tagTypeValues`, sans dépendance ; `lib/schemas/tag.ts` le réexporte.
- [x] `TagsManager` lit `tagTypeValues` dans `@/lib/enums/tag`, ne prend plus que le type
      `TagFormValues` au schéma, et charge `tagFormSchema` et `normaliseTagForm` par
      `await import('@/lib/schemas/tag')` dans `handleCreate`.
- [x] Garde : cas « zod » dans `graphe-client-de-la-console.test.ts`.

## Critères d'acceptation

- [x] AC1 — `paquetsDuGrapheClient(tags/page.tsx, ['zod'])` est vide.
- [x] AC2 — Les messages de validation et l'appel de `createConsoleTagAction` sont inchangés
      (`TagsManager.test.tsx`, `traducteurs-de-messages.test.ts` verts).

## Hors périmètre

- Monter `CreateTagDialog` par `next/dynamic` : l'autre voie de la piste ; le chargement à l'envoi
  est celle que retient la mesure du mesureur, et la plus étroite (un seul import change de forme).
- Un build pour re-mesurer le poids.

## Hypothèses

- Le premier envoi attend le chargement du module (un aller-retour réseau au plus, une fois) :
  accepté par la piste, qui propose cette voie.

## Notes d'implémentation

- Choix de voie (validation en bloc) : `await import()` dans `handleCreate`, comme le classement
  du mesureur, plutôt que `next/dynamic` sur le dialogue.
- Piège : `TagsManager.test.tsx` attendait `createConsoleTagAction` juste après le clic ; avec
  l'`import()`, l'appel suit d'un tour de promesse et fuyait dans le test suivant. L'attente passe
  par `waitFor`.
- Ablation (2026-10-22) : `TagsManager.tsx` rendu à l'état de TCK-1194 → le cas zod rougit
  (`zod ← lib/schemas/tag.ts ← components/admin-tags/TagsManager.tsx ← …/tags/page.tsx`) ; remis →
  vert.
