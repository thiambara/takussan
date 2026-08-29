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

- [x] **D1** — Un test qui parcourt **tous** les liens rendus par `Footer`, dérivé du DOM et non
      d'une liste écrite à la main, et qui refuse tout `<a>` dont le `href` n'a pas traversé
      `LienLocalise`. ⚠ La forme naïve — énumérer les 7 `href` attendus — reproduit le défaut
      qu'elle prétend fermer : le huitième lien ajouté demain ne serait pas vu.
- [x] **D2** — Un test qui assert le `href` de chaque tuile de `SystemMetricsGrid` par sa **clé**,
      pas par son rang, et dont la non-vacuité est prouvée (un `href` faux fait rougir).
- [x] **D3** — Un test de page qui lit la canonique **produite par `generateMetadata`** de la fiche
      de bien, et non la fonction qui la calcule.

## Critères d'acceptation

- [x] **AC1** — Pour chacun des trois sites, l'ablation est **jouée et prouvée** : le correctif
      retiré (avec l'empreinte md5 du fichier relevée avant et après la mutation, pour établir que
      l'ablation a bien EU LIEU), la suite rougit ; le correctif rétabli, elle reverdit.
- [x] **AC2** — Aucun des trois tests neufs n'énumère ce qu'il garde : chacun dérive son inventaire
      du rendu ou du système de fichiers, et porte un **plancher de non-vacuité** — sans quoi un
      sélecteur cassé rend vert sur zéro élément.

## Notes

> Ce ticket est le produit d'une passe de vérification, pas d'un rapport d'incident : les trois
> sites ont été trouvés en posant à chaque case la question *« si le correctif était absent, cette
> case serait-elle cochable ? »*. Les trois fois, la réponse était oui.

## Ce qui a été livré, et l'ablation qui le prouve — 2026-08-29

**Trois tests neufs, plus une assertion ajoutée à un test existant.** Chacun dérive son inventaire
du rendu ou du système de fichiers, et porte son plancher de non-vacuité JOUÉ APRÈS la règle : joué
avant, il fait rougir sur le compte au lieu de nommer le défaut — mesuré, corrigé.

| # | fichier | ce qu'il dérive |
|---|---|---|
| D1 | `takussan-web/src/components/home/__tests__/Footer.liens-localises.test.tsx` | les ancres du DOM rendu ; plancher = entrées des colonnes non vides de `footerLinks` |
| D2 | `takussan-web/src/components/admin/super/__tests__/SystemMetricsGrid.destinations.test.tsx` | les tuiles du DOM rendu ; leur CLÉ par lecture inverse de `fr.superAdmin.metrics` |
| D3 | `takussan-web/src/app/[locale]/(public)/__tests__/canonique-de-chaque-page.test.ts` | les `page.tsx` de `(public)` et **chaque sortie** de leur `generateMetadata`, par AST |
| D3 | `…/properties/[slug]/__tests__/page.server.test.tsx` (assertion ajoutée) | la canonique et les `hreflang` **produits**, contre `ORIGINE_SITE` et `LOCALES_INDEXABLES` |

**D1 emploie deux propriétés indépendantes** : l'idempotence sous `hrefLocalise` (avec le vrai
composant), et la TRAVERSÉE — `LienLocalise` remplacé par un double qui marque son ancre, ce qui
attrape même un `<a href="/fr/…">` écrit à la main, que l'idempotence ne verrait pas.

**AC1 — les ablations, empreintes relevées avant et après la mutation** (`md5 -q`, jamais
`git diff --numstat` : il ne distingue pas une substitution à nombre de lignes égal) :

| site | avant → après | effet |
|---|---|---|
| `Footer.tsx` — un `<a href="/properties">` nu ajouté | `2738f088…` → `590c4594…` | **2 rouges** : « `/properties` n'a pas traversé hrefLocalise » et « ces ancres sont écrites en `<a>` nu ». Restauré → `2738f088…`, vert. |
| `SystemMetricsGrid.tsx` — `verified` ramenée à `/super-admin/agencies` (le défaut d'origine de TCK-390) | `05b49e85…` → `708cdb7a…` | **2 rouges** : « agenciesTotal = verified → /super-admin/agencies » et la table par clé. |
| `SystemMetricsGrid.tsx` — `publishedProperties` → `/super-admin/reports` (**une AUTRE tuile**, pour prouver que ce n'est pas une paraphrase de la ligne du ticket) | `05b49e85…` → `28b41ac9…` | **2 rouges**, et `SystemMetricsGrid.test.tsx` reste **VERT** — le constat du ticket, re-mesuré. |
| `properties/[slug]/page.tsx` — ligne `alternates:` retirée | `d55def87…` → `f74f4fa7…` | **2 rouges** : la garde statique nomme `properties/[slug]/page.tsx:86`, le test de page dit « aucun alternates ». |
| `agencies/[slug]/page.tsx` — même retrait, **fichier que le ticket ne nomme pas** | `5010cb8b…` → `068b2f1b…` | **1 rouge** nommant `agencies/[slug]/page.tsx:75`. |

**Le cas légitime passe, et il est compté** : une 8ᵉ entrée ajoutée à `footerLinks`
(`src/data/navigation.ts`, `cbbc17f8…` → `3accd1f9…`) laisse les trois tests de D1 verts — le
plancher suit la source au lieu de figer un nombre. Restauré.

> ⚠️ **La première rédaction de la garde D3 était FAUSSE, et son ablation l'a montrée.** Elle
> cherchait `alternatesPubliques` ou `index: false` **n'importe où dans la source**. Or
> `properties/[slug]/page.tsx` porte `robots: { index: false }` sur sa branche « indisponible »
> (TCK-335) : la page passait donc pour exemptée, et **retirer sa canonique la laissait verte** —
> exactement le défaut que la garde existe pour fermer. Elle juge désormais **chaque objet littéral
> rendu**, par lecture d'AST. *Une garde qu'on n'ablate pas est une paraphrase du ticket.*

