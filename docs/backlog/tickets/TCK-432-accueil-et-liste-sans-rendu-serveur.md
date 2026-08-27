---
id: TCK-432
title: "La page d'accueil et /properties ne rendent aucun bien côté serveur, et ni l'une ni l'autre n'a de `<h1>`"
status: todo
phase: P1
family: front
estimate: L
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [front, seo, a11y, performance, public, visiteur-anonyme]
---

## Objectif utilisateur

Le visiteur — et le moteur qui l'a amené — voit des biens dans la première réponse du serveur,
pas des rectangles gris.

## Contexte

La fiche de bien a été convertie en composant serveur par TCK-335 (étape 6), et le docblock de
`src/app/(public)/properties/[slug]/PropertyDetailContent.tsx` en énonce la leçon : *« Ce qui
manquait, c'était la DONNÉE : elle arrivait par `useEffect` + `apiFetch`, donc après hydratation,
donc jamais dans le HTML initial. »*

**Les deux surfaces d'entrée du site n'ont pas reçu ce traitement.** Mesuré le 2026-08-27 :

| Route | Composant rendu | Origine des biens |
|---|---|---|
| `/` | `HomepageDiscovery` (`'use client'`) | `useHomepageDiscovery` → `useEffect` + `apiFetch` |
| `/properties` | `PropertiesDiscoveryPage` (`'use client'`) | `useSearch` → `useEffect` + `apiFetch` |

`src/app/(public)/page.tsx` fait neuf lignes et rend `<HomepageDiscovery />` ; la page de liste
enveloppe `PropertiesDiscoveryPage` dans un `<Suspense>` dont le repli est le squelette. Un
`useEffect` ne s'exécute jamais pendant le rendu serveur : le HTML de la page d'accueil de la
plateforme ne contient donc **aucun bien, aucun titre de bien, aucun lien `/properties/<slug>`**.

Deux conséquences, et la seconde ne dépend d'aucun moteur :

1. **Aucun chemin entrant vers les fiches n'existe dans le HTML servi**, ce qui rend le défaut
   solidaire de [TCK-431](TCK-431-sitemap-et-robots-absents.md) — sans sitemap *ni* maillage, une
   fiche de bien n'est atteignable que par quelqu'un qui en connaît déjà l'URL.
2. **Le premier rendu utile attend le JS**, sur un marché où la bande passante mobile est la
   contrainte dimensionnante — c'est la raison même pour laquelle `next.config.ts` sert AVIF en
   premier et plafonne les largeurs d'images.

⚠️ **Et aucune des deux pages n'a de `<h1>`.** Mesuré :

```
$ grep -rn "<h1" src/components/home src/components/property src/components/search
  → aucun résultat
```

`docs/design-guidelines.md` § Typographie pose pourtant *« Hiérarchie stricte : `h1` → titre de
page »*. La fiche de bien en a un (`PropertyHeader`), la home et la liste n'en ont pas : ni pour
un lecteur d'écran qui cherche le titre de la page, ni pour un moteur.

## Contrat de données

Endpoints existants, inchangés :

- `GET /api/public/properties/discovery` — les quatre rangées de la home en un appel
  (`near_city`, `per_row`), déjà utilisé par `useHomepageDiscovery`.
- `GET /api/public/properties/search` — la liste filtrée, déjà utilisée par `useSearch`.

⚠️ La rangée « Près de toi » dépend d'une ville devinée côté client par
`UserLocationProvider` (ipapi.co), avec une échéance de 1200 ms. **Le rendu serveur ne peut pas
attendre un fournisseur tiers** : la forme retenue doit rendre un contenu honnête sans ville, puis
laisser la personnalisation arriver — sans que la page reparte en squelette à l'hydratation.

## Direction UX / Artistique

Aucune refonte visuelle. La grille, les quatre rangées, les quatre variantes de carte et
l'absence de hero marketing (`docs/design-guidelines.md`) restent telles quelles.

Ce qui change est **l'ordre d'arrivée** : le contenu d'abord, l'interactivité ensuite. Le
squelette existant reste, mais pour ce qu'il couvre vraiment — une navigation en cours,
un changement de filtre — et non pour le premier affichage.

Le `<h1>` de chaque page doit dire ce que la page montre, pas le nom de la marque, et suivre la
règle `font-display` des directives.

## Contraintes strictes (métier)

- Le filtrage reste **serveur** : aucune liste complète récupérée puis filtrée côté client
  (`CLAUDE.md` § Sparse fieldsets).
- L'interactivité déjà livrée ne régresse pas : synchronisation d'URL de `useSearch`,
  restauration de défilement (TCK-335), bascule liste/carte, étiquette de repli conjonctif
  (TCK-338), retrait de filtre sur 422 (TCK-346), favoris et comparateur.
- Le titre de la rangée locale reste **dérivé de la réponse**, jamais deviné : titrer
  « À découvrir à Ziguinchor » au-dessus de biens dakarois serait faux, et le serveur dit déjà
  quand il a basculé de ville.
- Un seul `<h1>` par page.

## Delta à produire

- [ ] `/` — les biens des rangées présents dans le HTML de la première réponse
- [ ] `/properties` — les résultats de la recherche courante présents dans le HTML de la première
      réponse, filtres d'URL compris
- [ ] Stratégie de personnalisation géographique compatible avec un rendu serveur, sans
      re-squelette à l'hydratation
- [ ] `<h1>` sur les deux pages, localisé, en `font-display`
- [ ] Tests : présence d'un titre de bien et d'un lien `/properties/<slug>` dans le rendu serveur
      des deux pages ; présence d'un `<h1>` unique

## Critères d'acceptation

- [ ] AC1 — le HTML rendu par le serveur pour `/` contient le titre d'au moins un bien et un lien
      vers sa fiche. Le test s'exécute **sans hydratation** ; un test qui monte le composant client
      et attend l'effet cocherait la case sans rien prouver.
- [ ] AC2 — le HTML rendu par le serveur pour `/properties?type=villa` contient des biens
      correspondant au filtre. Un rendu qui ignore le filtre et sert le catalogue entier échoue.
- [ ] AC3 — chacune des deux pages porte exactement un `<h1>`, non vide, issu du dictionnaire
      next-intl. Un test échouerait si l'un des deux passait à zéro ou à deux.
- [ ] AC4 — non-régression mesurée sur `/properties` : la synchronisation d'URL, la restauration
      de défilement et la bascule liste/carte passent toujours leurs tests existants, sans que
      ceux-ci aient été réécrits pour s'accommoder du nouveau rendu.
- [ ] AC5 — la page ne repasse pas par un état de squelette après hydratation quand le serveur a
      déjà rendu les biens ; un test l'éprouve sur le rendu puis l'hydratation.

## Hors périmètre

- Le sitemap et `robots.txt` — [TCK-431](TCK-431-sitemap-et-robots-absents.md).
- Les URL canoniques et les métadonnées par filtre — [TCK-433](TCK-433-canonical-et-metadatabase-absents.md).
- Les données structurées — [TCK-435](TCK-435-donnees-structurees-incompletes.md).
- Toute refonte visuelle de la home ou de la grille de résultats.

## Notes d'implémentation

_(à remplir par implementing-specs)_
