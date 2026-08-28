---
id: TCK-461
title: "Trois propriétés livrées sont prouvées par LECTURE et gardées par rien — leur régression resterait verte"
status: todo
phase: P2
family: front
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, tests, garde, seo]
---

## Objectif

Qu'un correctif de la vague 49 qu'on retirerait par mégarde fasse **rougir** quelque chose.

## Contexte

La vérification des critères d'acceptation du lot TCK-383→440 (2026-08-28, six agents, périmètres
disjoints) a rendu trois constats de la **même forme**, dans trois surfaces sans rapport. Aucun
des trois n'est un bug : le code livré est juste. Ce qui manque est la garde.

**La forme :** *une chaîne dont les deux extrémités sont testées et dont le maillon central ne
l'est pas.* Elle est plus dangereuse qu'une absence franche de test, parce que le fichier de test
existe, qu'il est vert, et qu'il porte le bon nom.

| # | site | ce qui n'est gardé par rien |
|---|---|---|
| 1 | `components/super-admin/SystemMetricsGrid.tsx:156` (TCK-390) | La tuile « Vérifiées » pointe vers `?filter[is_verified]=1`. `SystemMetricsGrid.test.tsx` compte 8 liens et n'assert nommément que `?status=suspended` et `?filter[status]=pending_review`. **Un retour de la tuile à `/super-admin/agencies` — le défaut d'origine du ticket — resterait vert.** |
| 2 | `components/home/Footer.tsx` (TCK-437, AC2) | Les 7 liens passent par `LienLocalise`, et c'est vrai. Mais **aucun test ne parcourt les sept** : deux seulement sont éprouvés par le comportement. Un `<a href>` nu réintroduit sur l'un des cinq autres laisserait la suite verte — et c'est exactement le défaut que TCK-437 corrigeait. |
| 3 | `app/[locale]/(public)/properties/[slug]/page.tsx:93` (TCK-433, AC2) | La canonique de la fiche est éprouvée **au niveau de la fonction** (`metadata-base.test.ts` sur ce chemin exact), jamais au niveau de la page. **Retirer la ligne 93 ne ferait rougir personne.** |

## Delta à produire

- [ ] **D1** — Un test qui parcourt **tous** les liens rendus par `Footer`, dérivé du DOM et non
      d'une liste écrite à la main, et qui refuse tout `<a>` dont le `href` n'a pas traversé
      `LienLocalise`. ⚠ La forme naïve — énumérer les 7 `href` attendus — reproduit le défaut
      qu'elle prétend fermer : le huitième lien ajouté demain ne serait pas vu.
- [ ] **D2** — Un test qui assert le `href` de chaque tuile de `SystemMetricsGrid` par sa **clé**,
      pas par son rang, et dont la non-vacuité est prouvée (un `href` faux fait rougir).
- [ ] **D3** — Un test de page qui lit la canonique **produite par `generateMetadata`** de la fiche
      de bien, et non la fonction qui la calcule.

## Critères d'acceptation

- [ ] **AC1** — Pour chacun des trois sites, l'ablation est **jouée et prouvée** : le correctif
      retiré (avec l'empreinte md5 du fichier relevée avant et après la mutation, pour établir que
      l'ablation a bien EU LIEU), la suite rougit ; le correctif rétabli, elle reverdit.
- [ ] **AC2** — Aucun des trois tests neufs n'énumère ce qu'il garde : chacun dérive son inventaire
      du rendu ou du système de fichiers, et porte un **plancher de non-vacuité** — sans quoi un
      sélecteur cassé rend vert sur zéro élément.

## Notes

> Ce ticket est le produit d'une passe de vérification, pas d'un rapport d'incident : les trois
> sites ont été trouvés en posant à chaque case la question *« si le correctif était absent, cette
> case serait-elle cochable ? »*. Les trois fois, la réponse était oui.
