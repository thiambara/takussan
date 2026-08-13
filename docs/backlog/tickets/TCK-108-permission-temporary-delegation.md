---
id: TCK-108
title: "Délégation temporaire permissions"
status: done
phase: P2
family: applicatif
estimate: M
wave: 12
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-014, TCK-049]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
tags: [back, front, permissions, delegation]
---

## Objectif utilisateur

Permettre à un admin d'agence d'attribuer temporairement un rôle (ex:
`agency_manager`) à un agent existant sur une période bornée (date début,
date fin) pour couvrir une absence (vacances, congé, mission ponctuelle)
sans avoir à demander une réinitialisation manuelle au moment du retour.
Le rôle est automatiquement révoqué à l'échéance.

## Contrat de données

**Backend — Migrations** :

- Table `role_delegations` :
  - `id`
  - `user_id` (FK users) — bénéficiaire
  - `delegator_id` (FK users) — admin qui délègue
  - `agency_id` (FK agencies) — scope obligatoire
  - `role` (string) — nom du rôle Spatie permission (TCK-014)
  - `starts_at` (datetime, nullable — null = immédiat)
  - `ends_at` (datetime, requis)
  - `status` (enum : `scheduled`, `active`, `revoked`, `expired`)
  - `reason` (text, nullable) — motif (vacances, etc.)
  - `revoked_at` (datetime, nullable)
  - `revoked_by` (FK users, nullable)
  - `created_at`, `updated_at`
- Index : `(user_id, status)`, `(agency_id, status)`, `(ends_at)`.

**Endpoints** :

- `GET /api/agencies/{agency}/role-delegations` — liste paginée filtrable
  (status, user_id) — admin agence uniquement.
- `POST /api/agencies/{agency}/role-delegations` body
  `{ user_id, role, starts_at?, ends_at, reason? }` — admin agence
  uniquement.
- `DELETE /api/agencies/{agency}/role-delegations/{id}` — révoque
  immédiatement (status → `revoked`, revoked_at = now, revoked_by = caller).

**Mécanisme** :

- Étendre la résolution de rôles utilisateur : un user a ses rôles "fixes"
  (TCK-014) + ses rôles "délégués actifs" (`status=active` et bornes
  temporelles couvrant `now()`).
- Cache des rôles utilisateur (Spatie) doit être invalidé sur changement
  de délégation.
- Job planifié `App\Jobs\Permissions\ProcessRoleDelegationsJob` (toutes
  les 5 min via scheduler) :
  - active les `scheduled` dont `starts_at <= now()`,
  - expire les `active` dont `ends_at <= now()` (status → `expired`).
- Listener `RoleDelegationActivated` / `RoleDelegationExpired` →
  AppNotification au bénéficiaire et au délégateur (TCK-049).

**Frontend** :

- Page `Settings → Équipe → Délégations` (admin agence) : liste,
  formulaire création (user picker, role select, dates, motif),
  bouton "Révoquer".
- Badge sur la liste membres équipe : "Rôle délégué jusqu'au {date}".
- Notification dans la nav (cloche) à l'activation/expiration.

## Direction UX / Artistique

**Ambiance** : sobre, administratif, non-anxiogène. Une délégation est un
événement RH normal — pas de couleur d'alerte.

**Liste délégations** : table avec colonnes Utilisateur, Rôle délégué,
Période (badge "actif" / "à venir" / "expiré" / "révoqué"), Motif,
Actions. Status badges discrets, pas saturés.

**Formulaire création** :
- User picker : autocomplete sur les agents de l'agence.
- Role select : liste filtrée des rôles que l'admin a le droit de déléguer
  (jamais `super_admin` ou `agency_owner`).
- Date pickers : début optionnel ("immédiat" par défaut), fin obligatoire.
- Validation inline : `ends_at > starts_at`, `ends_at <= now() + 1 an`.
- Bouton "Créer la délégation" + résumé en clair ("Aïssatou aura le rôle
  Manager du 1 mai au 15 mai 2026").

**Révocation** : bouton ghost rouge dans la ligne, confirmation modale
avec champ motif optionnel.

**Pas de prescription technique** : choix lib date picker, table, modal,
state management — laissés à l'IA implémenteur.

## Contraintes strictes (métier)

- **Périmètre agence** : une délégation est toujours scopée à une agence ;
  le délégateur doit être admin de cette agence. Impossible de déléguer
  cross-agence.
- **Rôles non délégables** : `super_admin`, `agency_owner` (ou équivalent
  selon TCK-014) — un admin agence ne peut pas déléguer ces rôles, même
  s'il les possède.
- **Pas de chaîne de délégation** : un utilisateur dont le rôle est
  délégué ne peut pas re-déléguer ce rôle à un autre.
- **Auto-délégation interdite** : `delegator_id != user_id`.
- **Durée max** : 12 mois ; au-delà, c'est une promotion réelle, pas
  une délégation.
- **Audit** : chaque création / révocation / expiration / activation
  produit un ActivityLog (cf. spec transverse).
- **Idempotence du job** : exécuter `ProcessRoleDelegationsJob` deux fois
  ne doit pas dupliquer notifications ni effets.
- **Invalidation cache permissions** : à chaque changement de status, le
  cache Spatie permissions de l'utilisateur cible est purgé.
- **Sécurité** : un agent ne voit jamais la liste des délégations
  (sauf la sienne, en lecture seule).
- **Conflits de délégations** : deux délégations actives du même rôle
  pour le même user dans la même agence → autorisé (cumul de la
  période la plus longue), mais l'UI alerte l'admin lors de la création.

## Delta à produire

- [ ] Migration `create_role_delegations_table`
- [ ] Modèle `App\Models\RoleDelegation` + relations + scopes (`active`, `scheduled`, `expired`)
- [ ] Enum `App\Models\Enums\RoleDelegationStatus`
- [ ] FormRequests `StoreRoleDelegationRequest`, validation des règles métier
- [ ] Policy `RoleDelegationPolicy` (admin agence uniquement)
- [ ] Controller `Api\RoleDelegationController` (index, store, destroy)
- [ ] Service `App\Services\Permissions\RoleDelegationService` (create, revoke, sync cache)
- [ ] Override résolution rôles utilisateur (trait sur User ou observer Spatie)
- [ ] Job `App\Jobs\Permissions\ProcessRoleDelegationsJob` (scheduler 5 min)
- [ ] Events + Listeners : `RoleDelegationActivated`, `RoleDelegationExpired`, `RoleDelegationRevoked`
- [ ] Hook `AppNotification` (TCK-049) — types `role_delegated`, `role_delegation_expired`, `role_delegation_revoked`
- [ ] Resources `RoleDelegationResource` + `RoleDelegationCollection`
- [ ] Tests `RoleDelegationTest` : create, list, revoke, scoping agence, role non délégable, durée max, auto-délégation
- [ ] Tests `ProcessRoleDelegationsJobTest` : activation, expiration, idempotence
- [ ] Tests d'intégration : un user avec rôle délégué actif passe une policy ; à expiration, échoue
- [ ] Page Settings → Équipe → Délégations (liste + création + révocation)
- [ ] Composants formulaire (user picker, role select, date range)
- [ ] Hook fetch + mutation côté frontend
- [ ] i18n fr/en/wo (`role_delegations.*`)

## Critères d'acceptation

- [ ] AC1 — un admin agence crée une délégation `agency_manager` pour un
  agent du 2026-05-01 au 2026-05-15 → `status=scheduled`
- [ ] AC2 — au passage de `starts_at`, le job active la délégation
  (`status=active`) ; l'agent gagne le rôle effectivement (vérifié via
  policy en test)
- [ ] AC3 — au passage de `ends_at`, le job expire la délégation
  (`status=expired`) ; l'agent perd le rôle dans la même run
- [ ] AC4 — un admin peut révoquer immédiatement → `status=revoked`,
  l'agent perd le rôle dans la requête courante
- [ ] AC5 — un agent non admin tente `POST /role-delegations` → 403
- [ ] AC6 — un admin tente de déléguer `super_admin` → 422 avec message
  explicite
- [ ] AC7 — un admin tente de se déléguer à lui-même → 422
- [ ] AC8 — un admin tente une délégation > 12 mois → 422
- [ ] AC9 — l'agent bénéficiaire reçoit une AppNotification à l'activation
  ET à l'expiration
- [ ] AC10 — le job est idempotent : deux exécutions consécutives ne
  produisent pas de doublon de notification ni d'event

## Hors périmètre

- Délégation multi-agence (un user delegate sur plusieurs agences en
  une seule action) — V2.
- Délégation de permissions atomiques (pas un rôle entier) — pas
  demandé, ticket dédié si besoin émerge.
- Workflow d'approbation (le délégateur demande, un super-admin
  valide) — pas demandé.
- Historique audit visualisable côté UI — couvert par ActivityLog
  général, pas de vue dédiée.
- Notifications email/SMS (uniquement AppNotification in-app dans ce
  ticket).

## Notes d'implémentation

_(à remplir par implementing-specs)_
