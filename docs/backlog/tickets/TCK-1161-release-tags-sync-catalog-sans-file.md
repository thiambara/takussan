---
id: TCK-1161
title: "release.sh : tags:sync-catalog joué sous SCOUT_QUEUE=false, comme geo:sync-referential"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-89--commandes-de-releasesh-et-seedsh--code-de-sortie-et-conclusion-du-script"
tags: [back, release, search, pistes]
---

## Contexte

Réf : **P89.04** du fichier de pistes (🟠), `validé`.

`release.sh` joue `geo:sync-referential` sous `SCOUT_QUEUE=false`, pour que la réindexation se
fasse avec le code de l'image qu'on déploie et non par l'ancien worker. La ligne suivante,
`tags:sync-catalog`, n'avait pas la variable, alors que `TagCatalog::assurer()` réindexe les
biens d'une proposition qu'il approuve.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste n'offre qu'une voie : préfixer la commande et l'épingler
dans le harnais.

## Delta à produire

- [x] `release.sh` : `SCOUT_QUEUE=false php artisan tags:sync-catalog`.
- [x] `scripts/test-release-reindex.sh` : le talon `php` journalise `SCOUT_QUEUE` dans un second
      journal ; deux vérifications, une par commande de référentiel.

## Critères d'acceptation

- [x] AC1 — `release.sh` joué sous `SCOUT_QUEUE=true` : `geo:sync-referential` et
      `tags:sync-catalog` reçoivent tous deux `SCOUT_QUEUE=false`.

## Hors périmètre

- La réindexation faite dans la transaction de `TagCatalog::synchroniser()` (angle 90).

## Notes d'implémentation

- Ablation : sans le préfixe (état précédent), la vérification de `tags:sync-catalog` rend 0 au
  lieu de 1 ; préfixe remis → vert. Celle de `geo:sync-referential` est verte des deux côtés :
  elle garde l'existant.
