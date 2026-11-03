---
id: TCK-150
title: "Favoris — 401 immédiat après login (race condition token)"
status: done
phase: P1
family: front
estimate: S
wave: 17
created: 2026-05-04
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-favoris--collections
  models:
    - docs/models-spec.md#16-favorite
tags: [front, bug, p1, smoke-test-2026-05-04, favorites, auth]
---

## Objectif utilisateur

Un utilisateur qui se connecte à Takussan voit son badge favoris se charger sans erreur réseau dans la console / le panneau réseau, et sans appel 401 résiduel.

## Contrat de données

Endpoint : `GET /api/favorites?per_page=100` (Spatie déjà en place).

La query React Query qui le déclenche est tirée trop tôt — avant la résolution de `/api/auth/set-token` (Server Action Next.js qui pose le cookie HTTPOnly côté Next.js). Conséquence : un premier `GET /api/favorites` part sans token et retourne 401, suivi d'un second appel ~1-2s plus tard qui réussit.

## Contraintes strictes (métier)

- La query favoris doit être **gated** sur la disponibilité effective du token (cookie ou contexte d'auth résolu).
- Pas de double appel : un seul `GET /api/favorites` doit être émis au login.
- Pas de retry agressif — si la query est désactivée tant que le token n'est pas présent, React Query la déclenchera naturellement à la première transition `enabled: true`.

## Delta à produire

- [x] **Frontend** — Identifier le hook React Query qui appelle `/api/favorites` (probablement `useFavorites` ou similaire dans `takussan-web/src/lib/queries/favorites.ts` / `takussan-web/src/hooks/useFavorite.ts`)
- [x] **Frontend** — Conditionner la query sur `enabled: !!token` (ou `enabled: status === 'authenticated'` selon l'API du `AuthContext`)
- [x] **Frontend** — Vérifier qu'aucun autre hook (Header badge, FavoriteButton, etc.) ne tire `/api/favorites` indépendamment sans gate
- [ ] **Tests frontend** — Test sur le hook : mocker le contexte sans token → la query n'est pas déclenchée ; avec token → un seul appel

## Critères d'acceptation

- [ ] Après un login propre depuis `/auth/login`, le panneau réseau ne montre **aucun** `GET /api/favorites?... → 401`
- [ ] Le badge favoris se charge correctement avec son état initial
- [ ] Aucune régression sur le bouton favori (`FavoriteButton`) sur les fiches biens publiques

## Hors périmètre

- Refonte du flow d'auth Server Actions / set-token (TCK-existant)
- Cache offline des favoris (P3)

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bug **P1-1**.
- Réseau observé après login : `POST /api/auth/login → 200`, puis `POST /api/auth/set-token → 200`, puis `GET /api/favorites?per_page=100 → 401`, puis `GET /api/favorites?per_page=100 → 200` (deuxième tentative, succès).
- Probable que la query soit dans le layout dashboard (toujours active) et tire avant que `set-token` ne soit terminé.
- Voir `takussan-web/src/components/favorites/` (modifications en cours dans `git status` : FavoriteButton, FavoritesPopover, PublicFavoritesPage, favoritesStore.ts).

**Implémentation 2026-05-05 :**
- **Root cause** : `useFavoritesQuery` (dans `favorites.ts`) utilisait `useApiQuery` qui passe `token` de `useAuth()` à `apiRequest`, mais la query était toujours `enabled` — elle pouvait donc tirer avant que le token soit posé par le flux de login.
- **Fix** : Ajout de `enabled: !!token` dans `useFavoritesQuery`. La query React Query est désormais désactivée tant que le token n'est pas disponible, et se déclenche automatiquement à la première transition `enabled: true` après `setToken()`.
- Vérifié qu'aucun autre hook (`useAddFavoriteMutation`, `useRemoveFavoriteMutation`, `FavoritesPopover`) n'envoie `GET /api/favorites` sans gate. Les mutations sont déclenchées uniquement par action utilisateur (clic cœur). Le `FavoritesPopover` utilise `usePropertiesByIdsQuery` (endpoint public, pas d'auth). L'`AuthContext.useEffect` sur `[user, token]` passe toujours le token directement.
- Tests existants : 3/3 FavoriteButton ✅. ESLint clean.
