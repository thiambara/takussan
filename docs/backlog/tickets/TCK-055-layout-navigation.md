---
id: TCK-055
title: "Layout System + Navigation"
status: review
phase: P0
family: front
estimate: M
created: 2026-04-16
updated: 2026-04-22
depends_on: [TCK-054, TCK-056]
blocks: [TCK-038, TCK-039, TCK-040, TCK-041, TCK-042]
spec_refs:
  features: []
  models: []
tags: [front, infrastructure, layout, navigation, header, sidebar, footer]
---

## Objectif utilisateur

L'application a des layouts cohérents par zone (public, auth, dashboard) et une navigation adaptée au rôle utilisateur.

## Contrat de données

- Pas d'endpoint API dédié — utilise `GET /api/auth/me` pour le user courant
- Routes Next.js organisées par layout group : `(public)`, `(auth)`, `(dashboard)`

## Direction UX / Artistique

- **Layout public** : header minimal (logo, nav, login/register), contenu plein écran, footer discret
- **Layout auth** : centré, logo, pas de nav distrayante. Fond épuré ou illustration subtile.
- **Layout dashboard** : sidebar collapsible (icônes + labels), header avec user menu, zone contenu scrollable
- **Navigation adaptative** : les items de nav changent selon le rôle (agent voit "Mes biens", customer voit "Mes réservations")
- **Mobile** : sidebar → drawer hamburger, header simplifié

## Contraintes strictes (métier)

- Next.js App Router : layouts dans `src/app/(group)/layout.tsx`
- Les layouts sont des Server Components par défaut
- Navigation client-side uniquement pour les éléments interactifs (dropdown, mobile toggle)
- Les routes dashboard sont protégées (→ TCK-056 middleware)
- SEO : layout public a metadata appropriée, layout dashboard noindex

## Delta à produire

- [ ] Route groups : `(public)`, `(auth)`, `(dashboard)` dans `src/app/`
- [ ] `PublicLayout` : Header + Footer + main content
- [ ] `AuthLayout` : centré, logo, pas de nav
- [ ] `DashboardLayout` : Sidebar + Header + main content
- [ ] Composant `Navigation` avec items par rôle
- [ ] Composant `UserMenu` dans le header dashboard
- [ ] Migration des pages auth existantes vers `(auth)` group
- [ ] Migration dashboard/profile vers `(dashboard)` group

## Critères d'acceptation

- [ ] Les 3 layouts s'affichent correctement sur desktop et mobile
- [ ] La navigation s'adapte au rôle de l'utilisateur connecté
- [ ] Les pages auth existantes fonctionnent dans le nouveau layout
- [ ] Le dashboard sidebar est collapsible sur mobile
- [ ] Les metadata SEO sont appropriées par layout

## Hors périmètre

- Contenu des pages métier (→ tickets domaine)
- Design system composants (→ TCK-054)

## Notes d'implémentation

- Les pages auth existantes restent aux URL `/auth/*`. Groupées dans `src/app/(auth)/auth/` pour partager le layout du groupe (parenthèses URL-invisibles).
- Les dashboards `/app/*` et `/admin/*` sont regroupés sous `src/app/(dashboard)/` avec un layout racine qui enforce la garde `AUTH_COOKIE_NAME` une seule fois (les layouts enfants ne dupliquent plus).
- `Navigation` est un primitive agnostique (horizontal / vertical) — `buildDashboardNavItems` reproduit la logique existante de `AppSidebar` et reste appelable depuis header et sidebar.
- `UserMenu` factorise le dropdown déjà présent dans `AppTopbar` (variants `dark`/`light`).
- La `HomePage` conserve son `Navbar` métier (barre de recherche + catégories) — le `Header` générique sert les pages publiques légères.
