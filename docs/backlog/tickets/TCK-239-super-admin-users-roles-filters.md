---
id: TCK-239
title: "Super-admin utilisateurs - afficher rôles et filtres"
status: review
phase: P1
family: bug
estimate: M
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-145, TCK-147]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#34-ownerprofile-
    - docs/models-spec.md#35-agentprofile-
tags: [front, back, super-admin, users, roles, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un super-admin doit pouvoir retrouver, qualifier et filtrer un utilisateur cross-tenant depuis `/super-admin/users`.

## Contrat de données

Finding smoke `docs/smoke-tests/super-admin-2026-05-08.md` : `TC-SUP-15` observe que des comptes agence seedés affichent `Rôles : —` et que plusieurs filtres attendus ne sont pas visibles.

Endpoints concernés : liste utilisateurs super-admin, détail utilisateur et relations nécessaires aux rôles/profils/agences.

## Direction UX / Artistique

La liste doit rester une table opérationnelle : identité, badges de rôles, agences liées, statut de compte et signaux de sécurité visibles sans surcharger chaque ligne.

## Contraintes strictes (métier)

- Le super-admin conserve la portée cross-tenant.
- Les rôles doivent être résolus selon le modèle profils actifs / rôles Spatie scopés, sans revenir à `users.agency_id`.
- Les filtres rôle, agence, statut, email vérifié et 2FA doivent être serveur-side.
- Le frontend ne doit pas récupérer une liste globale puis filtrer localement.
- Les sparse fieldsets et includes nécessaires doivent être explicitement passés.

## Delta à produire

- [ ] Corriger le payload de liste pour exposer les rôles et agences associées aux utilisateurs cross-tenant.
- [ ] Afficher rôles multiples, agences, statut, email vérifié, 2FA et dernière connexion sur `/super-admin/users`.
- [ ] Ajouter recherche multicritère sur email, nom, ID et téléphone si elle n'est pas complète.
- [ ] Ajouter filtres rôle, agence, statut, vérifié et 2FA côté API + UI.
- [ ] Ajouter tests backend pour rôle multi-agence, utilisateur sans profil et utilisateur global `super_admin`.
- [ ] Ajouter tests frontend ou smoke automatisé sur affichage des badges et filtres.

## Critères d'acceptation

- [ ] Les utilisateurs seedés avec rôles agence n'affichent plus `Rôles : —` quand des rôles existent.
- [ ] Un super-admin peut filtrer par rôle et par agence sans fuite de logique client.
- [ ] Les colonnes statut, email vérifié, 2FA et dernière connexion sont visibles ou explicitement vides quand la donnée manque.
- [ ] Les permissions de la route restent 200 pour `super_admin`, 403 pour `agency_admin`/`agent`, 401 anonyme.

## Hors périmètre

- Refonte de l'impersonation.
- Création ou suppression de profils.
- Reset 2FA et révocation de sessions.

## Notes d'implémentation

La liste super-admin utilise maintenant `/api/admin/users`; les rôles sont lus directement depuis `model_has_roles` pour éviter le filtrage implicite du contexte Spatie actif.
