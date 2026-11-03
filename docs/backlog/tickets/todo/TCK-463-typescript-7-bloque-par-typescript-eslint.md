---
id: TCK-463
title: "TypeScript 7 est bloqué par `typescript-eslint`, pas par notre code — mesuré, et la branche qui le portait est supprimée"
status: todo
phase: P3
family: technique
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, dependances, typescript, outillage]
---

## Objectif

Ne pas re-tenter la montée TypeScript 7 sans savoir ce qui l'arrête, et savoir quand la re-tenter.

## Contexte

**Dependabot a proposé `typescript` 5.9.3 → 7.0.2 (PR #182). Elle a été FERMÉE sans fusion**
(`mergedAt: null`). Une branche locale `wip/pr182-typescript-7` en portait la reprise, avec le
*lockfile* résolu à la main — c'est-à-dire l'inverse d'un abandon : quelqu'un avait repris la PR
pour la faire passer. **Le dépôt ne disait nulle part pourquoi elle n'est pas passée.**

Mesuré le 2026-08-28, en installant `typescript@7.0.2` dans l'arbre du lot **sans toucher au
`package.json`** (`npm install --no-save`), pour que la mesure ne soit pas un engagement :

| commande | TS 5.9.3 | TS 7.0.2 |
|---|---|---|
| `npx tsc --noEmit` | 0 | **0** |
| `npm run lint` | 0 erreur (38 avertissements préexistants) | **échec dur** |

    Error: typescript-eslint does not support TS 7.0.

> **Notre code n'est pas le problème : il typecheck parfaitement sous TypeScript 7.** C'est
> l'OUTILLAGE qui refuse — `typescript-eslint`, à travers `eslint-config-next`. Et
> `npm run lint` est une garde de CI : la montée rendrait la CI rouge sans qu'aucune ligne du
> produit soit en cause.

Une fusion simulée (`git merge-tree`) confirme que la montée n'aurait touché que deux fichiers,
`package.json` (une ligne) et `package-lock.json` — les gardes i18n et `babel-plugin-react-compiler`
étaient préservées. **Le risque n'était pas dans le diff, il était dans une dépendance de l'outillage
que le diff ne nomme pas.**

## Delta à produire

- [ ] **D1** — Re-tenter quand `typescript-eslint` annonce le support de TS 7, **et pas avant**.
      Le signal se prend à la source (`npm view @typescript-eslint/parser peerDependencies`), pas
      sur une date.
- [ ] **D2** — Décider si l'on veut la montée pour elle-même. `tsc` étant déjà vert, le gain n'est
      pas la correction d'une erreur : c'est la performance du compilateur natif. À chiffrer avant
      de le vouloir.

## Critères d'acceptation

- [ ] **AC1** — La re-tentative mesure les **trois** consommateurs de TypeScript, pas un seul :
      `npx tsc --noEmit`, `npm run lint` **et** `npm run build`. ⚠ La première fois, seuls les
      deux premiers ont été joués — `tsc` vert avait suffi à donner l'impression que ça passait.
- [ ] **AC2** — Si la montée passe, le gain annoncé (compilation) est **mesuré** avant/après, pas
      supposé depuis les annonces amont.

## Notes

> ⚠ **La branche `wip/pr182-typescript-7` a été supprimée le 2026-08-28**, après cette mesure.
> Elle ne portait que le `package.json` et un *lockfile* — l'un et l'autre régénérables en une
> commande le jour où l'outillage suivra, et périmés d'ici là.
>
> *Ce qui n'était PAS régénérable, c'est la raison du blocage* — elle ne vivait ni dans la PR
> fermée, ni dans le nom de la branche, ni dans le code. Elle est ici. **Supprimer une branche
> sans écrire ce qu'on avait appris d'elle, c'est ce qui fait re-tenter la même chose dans six
> mois.**
