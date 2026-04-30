---
id: TCK-119
title: Homepage — "Derniers ajouts" affiche les mêmes biens que "En vedette"
status: done
phase: P2
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
tags: [front, bug, p2, homepage]
---

## Objectif utilisateur

Le visiteur voit deux sections distinctes sur la page d'accueil : les biens mis en avant et les biens les plus récemment publiés.

## Contrat de données

La section "En vedette" utilise `filter[is_featured]=true`. La section "Derniers ajouts" doit utiliser `sort=-created_at` sans filtre `is_featured`. L'endpoint est le même `GET /api/properties`.

## Direction UX / Artistique

Les deux sections doivent être visuellement identiques dans leur mise en page, mais présenter des résultats distincts — diversité de contenu perceptible par le visiteur.

## Contraintes strictes (métier)

Les deux requêtes doivent être indépendantes — ne pas dédupliquer côté frontend.

## Delta à produire

- [ ] Localiser le composant ou le hook qui alimente la section "Derniers ajouts" sur la homepage
- [ ] Corriger les paramètres de la requête API : `sort=-created_at`, sans `filter[is_featured]=true`, avec `per_page=8` ou la valeur cible
- [ ] Vérifier que les deux sections affichent des biens différents en local

## Critères d'acceptation

- [ ] La section "Derniers ajouts" et la section "En vedette" n'affichent plus les mêmes biens
- [ ] La section "Derniers ajouts" est triée par `created_at` décroissant
- [ ] Aucune régression sur la section "En vedette"

## Hors périmètre

- Personnalisation des "Derniers ajouts" par profil utilisateur
- Infini scroll ou pagination dans ces sections

## Notes d'implémentation

Root cause was in two places, not one:

1. **Backend** — `PublicPropertyController::index()` hard-coded `orderByDesc('featured')->orderByDesc('published_at')` and ignored all query params. Both homepage sections hit this endpoint and received identical results. Added `featured=true` filter and `sort=created_desc` support.

2. **Frontend** — `useProperties` sent `sort=latest` verbatim; the backend never recognised that token. Fixed the hook to map `'latest'` → `'created_desc'` before building the query string.

The ticket was tagged `[front]` only but the backend change was unavoidable to satisfy the ACs. Both changes are minimal (no new routes, no model changes).
