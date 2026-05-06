---
id: TCK-166
title: "Polish public — title dupliqué, redirect /super-admin, preload, libellés tri"
status: done
phase: P3
family: front
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#29-administration--configuration
tags: [front, bug, p3, smoke-test-2026-05-05, polish, seo, visiteur-anonyme]
---

## Objectif utilisateur

Le parcours public a une finition propre : pas de `<title>` dupliqué dans l'onglet du navigateur, redirection cohérente quand on tape `/super-admin` directement, plus d'avertissements console preload sur la home, libellés de tri lisibles et conformes à la spec QA.

## Contrat de données

Aucun changement d'API. Tous les correctifs sont côté front (metadata Next, middleware, composants).

## Direction UX / Artistique

- Le `<title>` de chaque page reste informatif et concis (un seul "Takussan" en suffixe).
- Le tri propose des libellés en toutes lettres, alignés sur la spec QA.
- La home reste rapide : pas de `preload` qui ne soit utilisé.

## Contraintes strictes (métier)

- Le suffixe Takussan dans `metadata.title.template` ne doit s'appliquer qu'aux titres qui ne contiennent pas déjà "Takussan" (sinon dédup au moment du template).
- Le middleware d'auth doit traiter `/super-admin` comme n'importe quelle autre route protégée.

## Delta à produire

- [ ] **Title dupliqué** — corriger `metadata.title.template` (ou les `metadata.title` par page) pour `/properties`, `/properties/[slug]`, `/compare`, `/favorites` : le résultat actuel `« X – Takussan — Takussan »` doit devenir `« X — Takussan »`. Aligner avec la convention déjà appliquée par TCK-152 sur le dashboard.
- [ ] **`/super-admin`** — ajouter la route ou son matcher au middleware d'auth pour produire `/auth/login?redirect=%2Fsuper-admin` (aujourd'hui : redirection sans paramètre `redirect=`).
- [ ] **Preload images home** — corriger le `next/image` `priority` / `sizes` sur les cartes hors viewport pour éliminer les warnings `was preloaded using link preload but not used`.
- [ ] **Libellés de tri** — sur `/properties`, remplacer `Prix ↑` / `Prix ↓` par `Prix croissant` / `Prix décroissant` (cf. spec QA TC-VA-08 Q1). Garder `Pertinence` et `Plus récent`.

## Critères d'acceptation

- [ ] Le `<title>` de chaque page publique contient un seul "Takussan".
- [ ] Taper `/super-admin` en visiteur anonyme redirige vers `/auth/login?redirect=%2Fsuper-admin`.
- [ ] La console de la home (`/`) en navigation privée ne contient plus les warnings `preload but not used` sur les images de carte.
- [ ] Le dropdown de tri sur `/properties` affiche `Pertinence`, `Prix croissant`, `Prix décroissant`, `Plus récent`.

## Hors périmètre

- Refonte du système de metadata Next.
- Lighthouse complet (TC-VA-28 — non couvert par ce ticket).
- Création d'une vraie route `/super-admin` côté front (relève des tickets de l'espace super-admin déjà en backlog).

## Notes d'implémentation

- **Title dupliqué** : `(public)/layout.tsx` applique déjà
  `title.template = "%s — Takussan"`. Les `meta.{properties,compare,
  favorites,propertyMissing}.title` dans fr/en.json contenaient en plus
  le suffixe → `« Comparer des biens — Takussan — Takussan »`. Suffixe
  retiré des catalogues : le template le pose une fois. La fiche bien
  (`properties/[slug]/layout.tsx`) suit la même règle ; les
  `openGraph.title` / `twitter.title` gardent un suffixe explicite parce
  qu'ils ne passent pas par le template.
- **`/super-admin`** : pas de middleware Next dans le projet — le garde
  vit dans `(super-admin)/super-admin/layout.tsx` via `getMeAction()`,
  qui redirige nu (`/auth/login`). Ajout d'un check `getToken()` en
  amont qui redirige explicitement vers
  `/auth/login?redirect=%2Fsuper-admin` quand le visiteur est anonyme.
  Le cas token expiré/stale reste sur le flow `/api/auth/session-expired`
  existant (hors périmètre AC).
- **Preload images** : `PropertyRow` exposait `priority={i < 2}` en dur
  → 4 rangées × 2 images = 8 préchargements, dont 6 hors viewport.
  Nouvelle prop `priorityCount` (default 0) ; `HomepageDiscovery` ne
  passe `priorityCount={2}` que sur la première rangée. Les autres
  cards laissent `next/image` lazy-load via l'observer existant.
- **Libellés tri** : `SearchToolbar` remplace `Prix ↑ / ↓` par
  `Prix croissant / décroissant`.
