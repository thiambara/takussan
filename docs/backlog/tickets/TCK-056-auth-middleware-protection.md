---
id: TCK-056
title: "Auth Middleware + Route Protection"
status: todo
phase: P0
family: front
estimate: S
created: 2026-04-16
updated: 2026-04-16
depends_on: [TCK-054]
blocks: [TCK-055, TCK-041, TCK-042, TCK-043, TCK-044, TCK-045, TCK-047]
spec_refs:
  features: [docs/features.md#21-authentification--comptes]
  models: []
tags: [front, infrastructure, auth, middleware, route-protection]
---

## Objectif utilisateur

Les routes protégées sont inaccessibles sans authentification et l'utilisateur est redirigé automatiquement vers login.

## Contrat de données

- Utilise `GET /api/auth/me` pour vérifier le token et récupérer le user
- Cookie `auth_token` existant (déjà dans `session.ts`)
- Types User existants (déjà dans `auth.ts`)

## Direction UX / Artistique

- Redirection fluide : pas de flash de contenu protégé
- Après login : redirection vers la page initialement demandée
- Après logout : redirection vers la page d'accueil publique

## Contraintes strictes (métier)

- Next.js middleware (`middleware.ts`) pour vérification côté serveur
- Les routes `/dashboard/*` requièrent auth
- Les routes `/auth/*` sont inaccessibles si déjà connecté (redirect dashboard)
- Le token est vérifié à chaque navigation côté serveur (cookie)
- Côté client : React context/provider pour l'état auth (éviter les appels répétés)

## Delta à produire

- [ ] `middleware.ts` à la racine src avec matcher sur `/dashboard/:path*` et `/auth/:path*`
- [ ] `AuthProvider` context : user courant, loading, login/logout/register helpers
- [ ] Hook `useAuth()` : accès au context auth
- [ ] Hook `useRequireAuth()` : redirect vers login si non connecté
- [ ] Redirection post-login vers page demandée (search param `?redirect=`)
- [ ] Tests : navigation protégée, redirect, auth state

## Critères d'acceptation

- [ ] Accéder à `/dashboard/*` sans token redirige vers `/auth/login`
- [ ] Accéder à `/auth/*` avec token redirige vers `/dashboard`
- [ ] Après login, l'utilisateur est redirigé vers sa page initiale
- [ ] Le `AuthProvider` fournit le user courant sans appel API répété
- [ ] Le logout redirige vers la page d'accueil

## Hors périmètre

- Layout complet (→ TCK-055)
- Rôles/permissions côté front (→ P1, après TCK-014)
