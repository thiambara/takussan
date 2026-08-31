---
id: TCK-503
title: "Coque du tableau de bord — `h-screen` sur un téléphone, une unité que TCK-501 a dû abandonner un cran plus bas"
status: todo
phase: P2
family: bug
estimate: S
wave: 58
created: 2026-08-31
updated: 2026-08-31
depends_on: [TCK-501]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, bug, dashboard, responsive]
---

## Objectif utilisateur

Un utilisateur qui ouvre n'importe quelle page de `/app/*` depuis un téléphone doit atteindre le
bas de ce qu'elle affiche.

## Contrat de données

Aucun changement d'API. Le défaut, s'il est confirmé, est entièrement de mise en page.

## Direction UX / Artistique

Rien de neuf à dessiner. La coque doit occuper le **viewport réellement visible**, pas la hauteur
que le navigateur annonce barre d'adresse rétractée.

## Contraintes strictes (métier)

1. **RELEVER AVANT DE CORRIGER.** Ce ticket naît d'un fait de CODE, pas d'une mesure : la coque
   (`takussan-web/src/components/layout/AppShell.tsx`) est en `h-screen`, c'est-à-dire `100vh` —
   l'unité exacte que TCK-501 a dû remplacer par `dvh` un niveau plus bas, pour la raison écrite
   dans sa contrainte 2. **On ne sait pas encore ce que ça coupe à l'écran, ni de combien.**
   Le `main` intérieur porte `overflow-y-auto`, ce qui peut absorber tout ou partie de l'écart, et
   le document lui-même défile, ce qui rétracte la barre et corrige peut-être le cas en pratique.
   *Une correction posée sans relevé se juge sur sa plausibilité, pas sur son effet.*
2. Si le relevé montre que rien n'est coupé, **le ticket se ferme en `obsolete` avec le relevé
   dans ses notes**. C'est un résultat, pas un échec.
3. La coque sert **toutes** les pages `/app/*` et `/admin/*` : une modification de sa hauteur se
   juge sur plusieurs pages, pas sur celle qui a déclenché le ticket.

## Delta à produire

- [ ] Relevé au navigateur, à 390 px de large et à hauteur de viewport réduite (barre d'adresse
      déployée) : quelle bande, en pixels, est hors de portée sur au moins trois pages de `/app/*`
      dont une longue et une courte.
- [ ] Si la bande est réelle : coque en unité dynamique, avec le repli qu'exige la barre latérale
      en `md:h-full`.
- [ ] Tests : la classe de hauteur de la coque est gardée par une assertion qui rougit si l'on
      rétablit `h-screen`.

## Critères d'acceptation

- [ ] AC1 — le relevé est écrit dans les notes du ticket, avec la commande ou la manipulation qui
      le reproduit et sa date.
- [ ] AC2 — à 390 px de large et barre d'adresse déployée, le dernier élément interactif d'une
      page longue de `/app/*` est atteignable.
- [ ] AC3 — à 1440 px, la coque est **inchangée** : barre latérale pleine hauteur, `main` seul à
      défiler.
- [ ] AC4 — le test rougit si l'on rétablit `h-screen` (ablation).

## Hors périmètre

- La messagerie pleine page, corrigée par TCK-501 — c'est elle qui a rendu ce cas visible, elle
  n'en dépend plus.
- Toute refonte de la barre latérale ou de la barre supérieure.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
