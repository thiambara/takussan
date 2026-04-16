---
id: TCK-053
title: "Test Infrastructure + Base Test Classes"
status: todo
phase: P0
family: back
estimate: M
created: 2026-04-16
updated: 2026-04-16
depends_on: [TCK-048, TCK-049]
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, infrastructure, testing, pest, factory, seeder]
---

## Objectif utilisateur

Tout ticket métier peut s'appuyer sur une infrastructure de test cohérente avec factories, seeders et helpers API.

## Contrat de données

- `BaseTestCase` avec helpers : `actingAsRole($role)`, `assertJsonStructurePaginated()`, `assertJsonError()`
- `ApiTestCase` extends BaseTestCase : `apiGet()`, `apiPost()`, `apiPut()`, `apiDelete()` avec token auto
- Factories pour tous les modèles de base : `UserFactory` (existant), `AgencyFactory`, `PropertyFactory`, `CustomerFactory`
- `TestSeeder` : crée un agency + users par rôle pour les tests
- RefreshDatabase traité, base SQLite en mémoire pour vitesse

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Toute test class hérite de `BaseTestCase` ou `ApiTestCase`
- Les tests ne dépendent pas de données de prod — factories uniquement
- Chaque rôle de test a les permissions seedées par `RolePermissionSeeder`
- Les tests API vérifient systématiquement le format de réponse standard

## Delta à produire

- [ ] `BaseTestCase` avec helpers assertion JSON
- [ ] `ApiTestCase` avec helpers HTTP + auth
- [ ] `AgencyFactory`, `PropertyFactory`, `CustomerFactory`
- [ ] `TestSeeder` (agency + users par rôle)
- [ ] Config phpunit : SQLite in-memory, parallel support
- [ ] Tests : `BaseTestCaseTest`, `ApiTestCaseTest`

## Critères d'acceptation

- [ ] `actingAsRole('agent')` crée un user avec rôle agent et permissions
- [ ] `assertJsonStructurePaginated()` valide le format pagination standard
- [ ] Les factories génèrent des données valides sans override
- [ ] Les tests tournent en SQLite in-memory < 2s pour le suite de base

## Hors périmètre

- Tests métier spécifiques (→ tickets domaine)
- Tests frontend/E2E (→ front infrastructure)
