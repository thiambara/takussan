---
id: TCK-167
title: Fix forbidden() — 6 pages dashboard plantent en 500 pour les rôles non autorisés
status: todo
phase: P0
family: bug
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
tags: [front, dashboard, rbac, nextjs]
---

## Objectif utilisateur

Quand un utilisateur connecté tape une URL `/app/*` réservée à un autre rôle, il doit retomber sur son dashboard sans page d'erreur — pas un crash serveur 500.

## Contrat de données

Aucune donnée nouvelle. Les pages concernées sont des Server Components qui lisent l'utilisateur courant via `getMeAction()` et bloquent l'accès quand le rôle n'est pas couvert.

Pages identifiées avec le bug en customer (smoke test 2026-05-05) :

- `src/app/(dashboard)/app/calendar/page.tsx` (ligne 27)
- `src/app/(dashboard)/app/properties/new/page.tsx` (ligne 16)
- `src/app/(dashboard)/app/customers/page.tsx`
- `src/app/(dashboard)/app/properties/page.tsx`
- `src/app/(dashboard)/app/properties/[id]/page.tsx`
- `src/app/(dashboard)/app/customers/[id]/page.tsx`

Toutes appellent `forbidden()` (Next.js 16) sans que `experimental.authInterrupts` soit activé dans `next.config.ts`. Résultat : 500 au lieu d'une redirection.

## Contraintes strictes (métier)

- Aucun de ces écrans ne doit fuiter d'information côté customer — la branche d'erreur ne doit pas non plus rendre un layout d'agent partiellement.
- Le code de gating doit rester côté serveur (Server Component) pour éviter le flash de contenu privé.
- Les routes `/admin/*` redirigent déjà proprement vers `/auth/login?redirect=…` (cf. smoke test visiteur § P3-3) — l'objectif est de **harmoniser** : `/app/*` doit aussi redirect, pas crasher.

## Delta à produire

- [ ] Remplacer chaque `forbidden();` par `redirect('/app');` (ou `redirect('/app/overview/tenant')` selon le rôle reçu) dans les 6 fichiers listés.
- [ ] Factoriser la garde `assertCanReachAgentArea(user)` (ou équivalent) dans un helper partagé `src/lib/auth/guards.ts` pour centraliser : check rôle agent/owner/admin → sinon redirect.
- [ ] Ajouter un test e2e (Playwright ou équivalent existant) qui parcourt les 6 routes en customer authentifié et asserte une redirection 200 vers `/app/*` sans body 500.
- [ ] Harmoniser le comportement de `/app/overview/super-admin` : actuellement 404, le mettre dans la même garde (redirect aussi).
- [ ] Vérifier que la nav publique (composant top nav `(public)`) cache désormais le lien `List a property` quand `user.role === customer` (cf. TCK-173).

## Critères d'acceptation

- [ ] Un customer authentifié naviguant sur les 6 URLs ci-dessus est redirigé sur `/app` (200) sans aucun overlay d'erreur Next.js dev.
- [ ] Un agent authentifié continue d'accéder normalement aux 6 pages.
- [ ] `next.config.ts` n'introduit pas `experimental.authInterrupts: true` (le fix passe par `redirect`, pas par l'activation du flag expérimental).
- [ ] Le test e2e ajouté passe en CI.

## Hors périmètre

- Refactor du système de rôles (couvert ailleurs).
- i18n des éventuels messages d'accès refusé (TCK-175).
- Masquage des CTA agent visibles sur le dashboard customer (TCK-173).

## Notes d'implémentation

_(à remplir par implementing-specs)_
