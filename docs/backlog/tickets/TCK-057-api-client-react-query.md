---
id: TCK-057
title: "API Client + Data Fetching (React Query)"
status: todo
phase: P0
family: front
estimate: S
created: 2026-04-16
updated: 2026-04-16
depends_on: [TCK-054, TCK-056]
blocks: [TCK-039, TCK-040, TCK-041, TCK-042, TCK-043, TCK-044, TCK-045, TCK-047]
spec_refs:
  features: []
  models: []
tags: [front, infrastructure, react-query, api, data-fetching]
---

## Objectif utilisateur

Les données API sont récupérées, mises en cache et synchronisées de manière cohérente dans toute l'application.

## Contrat de données

- Utilise l'`apiRequest` existant dans `lib/api.ts` comme fetcher de base
- Types de réponse API alignés sur le format TCK-048 : `{ data, meta, links }`
- Types d'erreur API alignés sur TCK-048 : `{ message, errors? }`

## Direction UX / Artistique

- Loading states : Skeleton components (de TCK-054) pendant le fetch
- Error states : composant ErrorBoundary + toast d'erreur
- Pas de spinner global — chaque section gère son loading
- Optimistic updates pour les actions simples (favori, toggle)

## Contraintes strictes (métier)

- React Query (TanStack Query) comme state manager serveur
- QueryClient provider au niveau du layout racine
- Stale time : 5 min par défaut, configurable par query
- Les mutations invalident les queries concernées automatiquement
- Token d'auth injecté automatiquement via le QueryClient
- Types TypeScript pour chaque endpoint consommé

## Delta à produire

- [ ] `npm install @tanstack/react-query`
- [ ] `QueryClient` provider dans le layout racine
- [ ] Hook `useApiQuery<T>()` : wrapper useQuery avec token auto + types
- [ ] Hook `useApiMutation<T>()` : wrapper useMutation avec invalidation auto
- [ ] Types API : `PaginatedResponse<T>`, `ApiError`, `ApiResponse<T>`
- [ ] Composant `QueryBoundary` : loading skeleton + error fallback
- [ ] Devtools React Query en développement
- [ ] Tests : query caching, mutation invalidation, error handling

## Critères d'acceptation

- [ ] `useApiQuery` retourne les données typées avec loading/error states
- [ ] Le token d'auth est injecté automatiquement dans les requêtes
- [ ] Les mutations invalident les queries concernées
- [ ] `QueryBoundary` affiche un skeleton pendant le chargement
- [ ] Les erreurs API sont affichées via toast

## Hors périmètre

- Endpoints métier concrets (→ tickets domaine)
- Form handling (→ TCK-059)
