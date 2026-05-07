---
id: TCK-210
title: "Super-admin — Détail utilisateur cross-tenant `/super-admin/users/[id]`"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: [TCK-211]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
tags: [front, super_admin, p1]
---

## Contexte

`/super-admin/users` (livré TCK-145) propose la liste utilisateurs et l'impersonation, mais aucune fiche détaillée. En cas de support, le super-admin doit reconstituer manuellement profils, sessions, activité — souvent en passant par impersonation, ce qui pollue l'audit. Il manque une vue agrégée non-intrusive.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/users/[id]` et voit en une page : identité, rôles globaux et par profil, sessions actives, devices, dernier login, activité 30 jours, signalements émis et reçus — sans impersonifier.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/users/{id}` — fiche utilisateur enrichie : identité, statut, rôles globaux, profils (owner/agent/customer/broker), agences associées, dernier login, MFA activée
- `GET /api/admin/users/{id}/sessions` — liste des tokens Sanctum actifs (id, name, last_used_at, ip, user_agent)
- `GET /api/admin/users/{id}/activity?filter[...]=...` — extrait du journal d'activité spatie filtré par causer ou subject (paginé)

Sparse fieldsets obligatoires pour chaque endpoint.

## Direction UX / Artistique

Header identité (avatar, nom, email, statut, badges rôles). Sections : *Profils & agences*, *Sessions actives*, *Activité*, *Signalements*. Boutons d'action gris-clair (les actions support arriveront avec TCK-211). Liens vers les agences (`/super-admin/agencies/[id]`) et vers l'audit pré-filtré (`/super-admin/audit?causer_id=...`).

## Contraintes strictes (métier)

- Page accessible **uniquement** au rôle `super_admin` (gardée par le layout).
- Aucun secret (token, hash) ne fuit côté client — Resource dédiée filtre les attributs.
- Toujours utiliser `fields[...]`, `filter[...]`, `include=`.
- Pas d'agrégation côté client : si un compteur est affiché, il vient du serveur.
- Les sessions affichées proviennent de `personal_access_tokens` Sanctum — pas de simulation.

## Delta à produire

- [ ] Backend `Admin\UserDetailController@show` + `@sessions` + `@activity`
- [ ] Resource `Admin\UserDetailResource` (filtre les attributs sensibles)
- [ ] Routes `GET /api/admin/users/{id}`, `GET /api/admin/users/{id}/sessions`, `GET /api/admin/users/{id}/activity`
- [ ] Frontend page `src/app/(super-admin)/super-admin/users/[id]/page.tsx`
- [ ] Composants : `UserDetailHeader`, `UserProfilesSection`, `UserSessionsTable`, `UserActivityTimeline`
- [ ] Lien depuis la liste `super-admin/users` (TCK-145) vers la fiche
- [ ] Tests backend : 200 super-admin, 403 agency_admin, payload sans fuite de secret
- [ ] Tests UI : redirect non-super_admin, rendu détail, lien audit causer

## Critères d'acceptation

- [ ] `/super-admin/users/[id]` rend la fiche en ≤ 3 appels (détail + sessions + activité paginée)
- [ ] Aucun token, hash de password ou secret n'apparaît dans les réponses `Admin\UserDetailResource`
- [ ] Les sessions listées correspondent exactement aux tokens Sanctum actifs (test direct sur `personal_access_tokens`)
- [ ] Un agency_admin reçoit 403 sur `/api/admin/users/{id}/*`
- [ ] Le lien "Voir l'activité dans l'audit" pointe sur `/super-admin/audit?filter[causer_id]={id}`

## Hors périmètre

- Actions support (force reset password, unlock, reset 2FA, fusion comptes) — TCK-211
- Édition des champs utilisateur depuis la console super-admin — non couvert ici
- RGPD export user / droit à l'oubli (extension de spec requise)

## Notes d'implémentation

_(à remplir par implementing-specs)_
