---
id: TCK-1192
title: "Les commentaires des animations d'entrée disent `backwards`, comme `globals.css`"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations--trois-commentaires-décrivent-encore-les-animations-dentrée-en-both-alors-que-globalscss-les-déclare-en-backwards"
tags: [front, documentation, pistes]
---

## Contexte

Réf : **P102.04** du fichier de pistes, `retenu · autonome` (A6 : des commentaires contredisent le
CSS mesuré). `.animate-fade-in-up`, `.animate-card-enter` et `.animate-section-enter` sont en
`backwards` depuis la revue design du 2026-09-16 ; quatre commentaires disent encore `both`.

## Objectif

Les quatre commentaires décrivent ce que déclare `globals.css`.

## Delta à produire

- [x] `card-stagger.ts:4-7` : les deux animations sont en `backwards`.
- [x] `globals.css` (barre du comparateur) : « Pas de `backwards` ici, contrairement aux trois
      autres ».
- [x] `globals.css` (`prefers-reduced-motion`) : c'est la phase `fill` de `backwards` qui rend la
      règle nécessaire.
- [x] `PropertyDetailContent.tsx` : le `transform` de fin restait posé sous `both` ; il ne l'est
      plus sous `backwards`, et la règle d'enveloppe tient pendant l'animation.

## Critères d'acceptation

- [x] AC1 — Aucun commentaire ne décrit plus ces trois animations en `both` au présent.
- [x] AC2 — Aucune ligne de code ni de CSS ne change.

## Hors périmètre

- L'état `opacity-0` de `PropertyCard` sous `prefers-reduced-motion` : c'est le défaut de P102.01
  (TCK-1188), vu de ce côté.
- Les `both` des animations du parcours de publication (`wizard-*`), qui sont bien en `both`.

## Notes d'implémentation

- Commentaires seuls : aucun test ne peut garder un commentaire, la piste le dit (« Rien à garder
  par un test »). Vérifié par `grep -n both` sur les trois fichiers : il ne reste que le récit
  daté (`globals.css:418`) et les animations `wizard-*`.
- Quatre commentaires et non trois : le mesureur a relevé `globals.css:450` en plus.
