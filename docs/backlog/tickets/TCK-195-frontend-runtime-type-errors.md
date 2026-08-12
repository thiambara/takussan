---
id: TCK-195
title: Frontend — corriger les erreurs TypeScript runtime
status: done
phase: P1
family: technique
estimate: S
wave: 21
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#17-propertyvisit-
tags: [front, typescript, visits, profiles, ci]
---

## Objectif utilisateur

Les visiteurs et utilisateurs authentifiés conservent des parcours visite et profil typés correctement dans l'application.

## Contrat de données

Les corrections s'appuient sur les contrats existants des visites, utilisateurs, rôles et profils actifs.

## Direction UX / Artistique

Préserver les libellés et formulaires existants ; seules les incohérences de typage runtime sont visées.

## Contraintes strictes (métier)

- Le rôle `tenant` doit être traité comme un rôle de première classe dans les libellés de profil.
- Les valeurs optionnelles/nullables du dialogue de visite doivent rester cohérentes avec le schéma de formulaire et le payload API.
- Aucune conversion `as any` ne doit être utilisée pour faire passer TypeScript.

## Delta à produire

- [ ] Corriger `PropertyVisitDialog.tsx` pour ne plus passer `string | null` là où le champ attend `string | undefined`.
- [ ] Compléter le mapping `Record<UserRole, string>` dans `ProfileAdminSection.tsx`.
- [ ] Compléter le mapping `Record<UserRole, string>` dans `ProfileHeader.tsx`.
- [ ] Ajouter ou ajuster les tests ciblés si les labels de rôle ou valeurs par défaut sont modifiés.

## Critères d'acceptation

- [ ] `npx tsc --noEmit --pretty false` ne remonte plus d'erreur dans `PropertyVisitDialog.tsx`.
- [ ] `npx tsc --noEmit --pretty false` ne remonte plus d'erreur dans `ProfileAdminSection.tsx`.
- [ ] `npx tsc --noEmit --pretty false` ne remonte plus d'erreur dans `ProfileHeader.tsx`.
- [ ] Les libellés de rôle incluent explicitement `tenant`.

## Hors périmètre

- Refonte du dialogue de visite.
- Refonte du profil actif ou du switcher de profils.
- Correction des erreurs de tests TypeScript, couverte par TCK-194.

## Notes d'implémentation

Le test du dialogue de visite a été réaligné sur le gating authentifié actuel et enveloppé avec `NextIntlClientProvider`, requis par le composant Dialog partagé.
