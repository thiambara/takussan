---
id: TCK-1037
title: "Liste des biens : le dialogue « Enregistrer la recherche » se charge à l'ouverture"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#zod-et-le-formulaire-dalerte-sont-dans-le-js-initial-de-la-liste-par-le-bouton--enregistrer-la-recherche-"
tags: [front, performance, recherche, pistes]
---

## Contexte

Réf : **P69.04** du fichier de pistes, `retenu · autonome` (A2 : charger le contenu du dialogue
par `next/dynamic`, sur le modèle de TCK-850, ne change ni le formulaire ni son texte ; A5 : retirer
l'exception de la table du test).

`SaveSearchButton` importe statiquement `PublicSearchAlertForm`, `savedSearchPayloadSchema`
(`lib/schemas/search`, donc zod) et `useTraducteurValidation` (`hooks/useApiForm`, donc
react-hook-form et `@hookform/resolvers`). `PropertiesDiscoveryPage` importe le bouton : ces
paquets entrent dans le JS initial de `/properties` avant tout clic. Le test de TCK-744 l'admet par
une exception nommée (`FORMULAIRES_ADMIS`).

## Objectif

Le code du dialogue d'enregistrement d'une recherche, et zod avec lui, n'est chargé qu'à la
première ouverture du dialogue.

## Delta à produire

- [x] Le dialogue (formulaire de compte et formulaire d'alerte sans compte) sort de
      `SaveSearchButton.tsx` dans un module à part, chargé par `next/dynamic` et monté à la
      première ouverture.
- [x] `SaveSearchButton.tsx` retiré de `FORMULAIRES_ADMIS` dans `zod-hors-des-pages-publiques.test.ts`.

## Critères d'acceptation

- [x] AC1 — `zod-hors-des-pages-publiques.test.ts` est vert sans exception pour `SaveSearchButton`.
- [x] AC2 — Les tests existants du bouton (enregistrement, alerte sans compte, critères envoyés)
      restent verts sans changer ce qu'ils vérifient.
- [x] AC3 — Chaque ouverture repart d'un formulaire neuf (nom suggéré, case d'alerte décochée,
      aucune confirmation), comme avant.

## Hors périmètre

- La mesure du morceau au build (`next build` n'est pas joué dans ce passage) : le test garde la
  cause, le graphe d'imports statiques, comme pour TCK-850.
- La part de `react-hook-form` dans le JS initial des autres pages publiques.

## Notes d'implémentation

- Ablation (2026-10-20) : import statique de `SaveSearchDialog` remis dans le bouton →
  `zod-hors-des-pages-publiques.test.ts` rougit sur `properties/(liste)/page.tsx` ; `next/dynamic`
  remis → 20/20 verts. Avant correctif, la même table sans l'exception rougissait par trois chemins
  (`zod ← lib/schemas/search.ts`, `react-hook-form` et `@hookform/resolvers ← hooks/useApiForm.ts`).
- Piège : chargé à l'ouverture, le formulaire apparaît un tour plus tard. Deux tests d'AC15
  lisaient la case par `getByRole` juste après le clic ; ils passent à `findByRole`, sans rien
  changer à ce qu'ils vérifient.
- AC3 : la remise à neuf ne tient pas à la `key={ouverture}` du corps, mais au démontage du contenu
  par base-ui à la fermeture (ablation de la `key` → le test d'AC3 reste vert). La `key` couvre une
  réouverture pendant l'animation de fermeture, qu'aucun test jsdom ne reproduit.
