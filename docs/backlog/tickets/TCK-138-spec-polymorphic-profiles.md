---
id: TCK-138
title: Spec — Modèle de profils polymorphes (User → Profiles)
status: review
phase: EF
family: evolution
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: []
blocks: [TCK-139, TCK-140, TCK-141, TCK-142]
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#enums
tags: [spec, evolution, models, identity, profiles]
---

## Contexte

Le couple `UserType` (enum) + rôles spatie diverge en pratique : `UserType::Individual` est un fourre-tout (mappé indistinctement à `owner`, `tenant`, `customer` dans le seeder), `UserType::Broker` est orphelin (aucun rôle correspondant), `app/Models/Bases/Enums/UserType.php` duplique l'enum avec une liste différente, et `PropertyResource:178` calcule `is_agent` depuis `users.type` alors que la vérité d'autorisation est dans les rôles spatie. Cette dette traduit une limite plus profonde : `users` mélange identité authentifiée et nature métier, et l'unicité `users.agency_id` empêche un humain d'avoir plusieurs personas (broker indépendant, propriétaire chez agence A et locataire chez agence B, prestataire multi-agences).

## Objectif

Faire évoluer `docs/models-spec.md` et `docs/features.md` pour adopter un modèle de **profils polymorphes** où `User` = identité authentifiée pure, et chaque persona métier (owner, agent, broker, service_provider) devient une entité dédiée liée au user et scopée par agence — préalable indispensable à TCK-139 → TCK-142.

## Delta à produire

- [ ] `docs/models-spec.md` § 1 User : retirer `type` et `agency_id`, ajouter mention « identité authentifiée pure, voir profils »
- [ ] `docs/models-spec.md` : nouvelles entités `OwnerProfile`, `AgentProfile`, `BrokerProfile`, `ServiceProviderProfile` (colonnes, relations, contraintes d'unicité, soft delete)
- [ ] `docs/models-spec.md` : pivots `BrokerAgencyCollaboration`, `ServiceProviderAgencyCollaboration` pour les profils multi-agences
- [ ] `docs/models-spec.md` § Enums : marquer `UserType` comme déprécié + supprimer la note §1401 sur la dualité Type/Role
- [ ] `docs/models-spec.md` § Sections transversales : nouvelle règle « Active profile context » — tout endpoint authentifié résout un profil actif via `setPermissionsTeamId`
- [ ] `docs/features.md` § 2.1 : section « Profils & contexte actif » (switcher de profil, héritage email/mdp/2FA, KYC distinct par profil)
- [ ] `docs/features.md` § 2.2 : reformuler — les rôles spatie sont scopés par profil (et par agence via le profil), plus directement par `users.agency_id`
- [ ] Diagramme ER mis à jour (section visuelle si présente)

## Critères d'acceptation

- [ ] La spec décrit un User sans `type` ni `agency_id`, avec une relation `profiles()` polymorphe vers les 4 entités de profil
- [ ] Chaque profil porte son propre `agency_id` (sauf `BrokerProfile` qui n'a qu'un `license_number` et collabore via pivot)
- [ ] La règle d'unicité est explicite : un user a au plus un `OwnerProfile`, `AgentProfile`, `ServiceProviderProfile` par `(user_id, agency_id)` ; au plus un `BrokerProfile` par user
- [ ] La spec décrit la sémantique « profil actif » et son rôle dans la résolution des permissions spatie
- [ ] La note §1401 sur la dualité `UserType` ↔ `UserRole` est supprimée et `UserType` est marqué `@deprecated` (suppression effective dans TCK-142)
- [ ] `docs/features.md` mentionne le switch de profil dans le flux d'authentification (UX à câbler en aval)
- [ ] Un `/sync-specs` passe sans nouvelle ⚠️/❌ liée à User/profils

## Hors périmètre

- Implémentation backend (TCK-139 → TCK-142)
- UI de switch de profil côté frontend (ticket dédié à créer plus tard)
- Migration des données réelles de prod (TCK-140 fournit la commande `profiles:backfill`)
- Refonte des autres entités liées à User (Customer, ActivityLog, AppNotification — restent inchangés en surface)

## Notes d'implémentation

- **Carve-out skill**: `family: evolution` traité comme exception sanctionnée à la règle « specs read-only » de `implementing-specs` — ce ticket existe précisément pour livrer la spec.
- **AC #2 reformulé**: l'AC dit « sauf BrokerProfile qui collabore via pivot » mais l'architecture cible (alignée TCK-139) place aussi `ServiceProviderProfile` sur un pivot `service_provider_agency_collaborations`. Owner/Agent = personas employées (FK directe `agency_id`), Broker/ServiceProvider = professionnels indépendants (pivot N:M). C'est la sémantique correcte.
- **Enums ajoutés**: `OwnerProfileStatus`, `AgentProfileStatus`, `CollaborationStatus` (anticipés ici, à matérialiser en TCK-139/TCK-140).
- **Aucun ER diagram** dans `models-spec.md` à ce jour → AC "diagramme ER" no-op.
- **`/sync-specs` à lancer** côté reviewer pour confirmer absence de nouvelle ⚠️/❌ après merge.
- **Cohérence TCK-139..142**: les noms de tables, colonnes et contraintes d'unicité dans la spec matchent exactement ceux des tickets enfants — pas de drift à corriger en aval.
