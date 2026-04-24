---
id: TCK-057
title: "API Client + Data Fetching (React Query)"
status: done
phase: P0
family: front
estimate: S
created: 2026-04-16
updated: 2026-04-22
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

- [x] `npm install @tanstack/react-query` (+ devtools)
- [x] `QueryClient` provider dans le layout racine (`components/providers/QueryProvider.tsx`)
- [x] Hook `useApiQuery<T>()` : wrapper useQuery avec token auto + types
- [x] Hook `useApiMutation<T>()` : wrapper useMutation avec invalidation auto
- [x] Types API : `PaginatedResponse<T>`, `ApiResponse<T>`, `ApiErrorBody`, `SpatieQueryParams` + `ApiError` (dans `lib/api.ts`)
- [x] Composant `QueryBoundary` : loading skeleton + error fallback
- [x] Devtools React Query en développement
- [ ] Tests : query caching, mutation invalidation, error handling — reporté (pas de runner de test configuré dans le scaffold ; à couvrir via un ticket d'infra test dédié)

## Critères d'acceptation

- [x] `useApiQuery` retourne les données typées avec loading/error states
- [x] Le token d'auth est injecté automatiquement dans les requêtes
- [x] Les mutations invalident les queries concernées
- [x] `QueryBoundary` affiche un skeleton pendant le chargement
- [x] Les erreurs API sont affichées (via `ApiError.displayMessage` dans `QueryBoundary`) — hook de toast à brancher par les écrans consommateurs (pas de composant `<Toaster>` monté pour l'instant, prévu TCK-060/UX)

## Hors périmètre

- Endpoints métier concrets (→ tickets domaine)
- Form handling (→ TCK-059)

## Notes d'implémentation

- **Convention spatie imposée** : `buildQueryString(params: SpatieQueryParams)` exporté depuis `lib/api.ts` sérialise `fields[table]`, `filter[...]`, `include`, `sort`, `page`, `per_page` au bon format. `useApiQuery` accepte directement `params` et passe par ce helper — les appelants ne doivent jamais concaténer manuellement des query strings (cf. CLAUDE.md § "API — Conventions frontend").
- **Token** : `AuthContext` expose désormais le token Sanctum en mémoire (`initialToken` hydraté server-side depuis la cookie `AUTH_COOKIE_NAME`). `useApiQuery` / `useApiMutation` l'injectent dans `Authorization: Bearer …` par défaut. Les appels serveur directs (route handlers Next) continuent à lire la cookie HttpOnly et n'utilisent pas ces hooks.
- **Locale** : les deux hooks forwardent automatiquement la locale `next-intl` vers `Accept-Language` (le backend i18n TCK-058 en dépend).
- **Retry policy** : pas de retry sur 4xx (géré dans `createQueryClient`), 1 retry sur le reste. `staleTime` par défaut 5 min, `gcTime` 30 min — à override par query quand pertinent.
- **Invalidation** : `useApiMutation({ invalidate: [...] })` accepte soit un tableau statique, soit une fonction `({ data, variables }) => QueryKey[]` pour des invalidations dynamiques (p.ex. `['property', id]`).
- **Devtools** : montées uniquement en `NODE_ENV === 'development'`.
- **ApiError enrichi** : `displayMessage` pour les toasts + `validationErrors` pour le mapping Laravel 422 → formulaires (consommé par TCK-059).
- **Abort** : `apiRequest` supporte maintenant `signal`; `useApiQuery` le passe depuis TanStack pour l'annulation automatique.
- `QueryClient` instancié via `useState(() => createQueryClient())` dans le provider pour survivre au Fast Refresh sans être partagé entre sessions SSR.
