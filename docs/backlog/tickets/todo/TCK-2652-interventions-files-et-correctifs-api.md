---
id: TCK-2652
title: "Interventions côté API : files par état d'attente avec ancienneté, semaine du prestataire, prestataires suggérés, et deux correctifs (accepter une demande terminée, coût montré au locataire)"
status: todo
phase: P1
family: back
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2653, TCK-2654]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [back, maintenance, bug, audit-ux, app]
---

## Objectif utilisateur

Chacun des quatre acteurs voit d'abord ce qui l'attend, et depuis quand :

- l'agence : ce qui est à dispatcher, ce qui est en retard, ce qui est chez le bailleur, ce qui est à confirmer ;
- le prestataire : ses créneaux de la semaine ;
- le bailleur : le devis à approuver.

Une demande oubliée ne peut plus se cacher derrière une section « Urgences » remplie de demandes terminées.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- **Statuts** : `MaintenanceStatus` en compte 12 (`open`, `acknowledged`, `quote_requested`, `quote_submitted`, `awaiting_owner`, `approved`, `rejected`, `assigned`, `in_progress`, `completed`, `closed`, `cancelled`).
- **Filtres** (`$requestFilterable`) : `property_id`, `lease_id`, `requester_id`, `assigned_to`, `category`, `priority`, `status`, `search`. **Aucun filtre** d'attente, de retard, d'absence de prestataire ni de plage de créneau.
- **Aucune date d'entrée dans le statut courant** : seuls `scheduled_at`, `started_at`, `completed_at` et `accepted_at` existent.
- **`can_accept`** = `!terminal && respondToAssignment && accepted_at === null` (`MaintenanceRequestResource.php:192`). `completed` n'est pas terminal, d'où « J'accepte » sur une demande terminée (P2 de l'audit, #32).
- **Le coût** : `estimated_cost` et `actual_cost` sont **toujours servis, au locataire compris** (`:44-45`).
- **Carnet** : `GET /api/agencies/{agency}/service-providers` rend déjà `average_rating` et `reviews_count` (`withAvg`). Il ne rend pas le nombre d'interventions réalisées. Le front affiche `metadata.phone` seul (`ServiceProvidersList.tsx:148`).
- **Signalement** : `StoreMaintenanceRequestRequest` exige `title` **et** `description` (`:52-53`).

**À servir** (consommé par TCK-2653 et TCK-2654) :

- Sur chaque demande :
  - **`file`** et **`waiting_on`** (`agency`, `provider`, `owner`, `tenant` ou `none`) ;
  - `waiting_since` ;
  - `slot_overdue_days` ;
  - `auto_close_at`, pour une demande `completed`.
- **Filtres** :
  - `filter[file]=a_dispatcher|en_retard|chez_le_bailleur|en_cours|a_confirmer|terminees` ;
  - `filter[file]=a_accepter`, pour le prestataire ;
  - `filter[scheduled_from]` et `filter[scheduled_to]`.
- **`GET /api/maintenance-requests/summary`** : les comptes par file, sous les mêmes portées que l'index.
- **`GET /api/maintenance-requests/{id}/suggested-providers`** : au plus 3 prestataires du carnet de l'agence. Chacun porte le métier correspondant, la zone, `average_rating` et le nombre d'interventions réalisées.
- **Carnet** : le téléphone (`user.phone`, sinon `metadata.phone`) et `completed_interventions_count` pour l'agence.

## Contraintes strictes (métier)

**Table des files.** Chaque statut tombe dans **une seule** file, et la table est écrite dans la spec (cf. `spec-delta.md`) :

| Statut | Condition | `file` | `waiting_on` |
|---|---|---|---|
| `open`, `acknowledged`, `rejected`, `assigned` | sans prestataire (`assigned_to` nul) | `a_dispatcher` | `agency` |
| `quote_requested` | — | `en_cours` | `provider` |
| `quote_submitted` | — | `en_cours` | `agency` (devis à décider) |
| `awaiting_owner` | — | `chez_le_bailleur` | `owner` |
| `assigned`, `approved`, `in_progress` | `scheduled_at` antérieur au jour courant | `en_retard` | `provider` |
| `assigned`, `approved`, `in_progress` | sinon | `en_cours` | `provider` |
| `completed` | — | `a_confirmer` | `tenant` |
| `closed`, `cancelled` | — | `terminees` | `none` |

Autres règles :

- **`a_accepter`** : `assigned`, avec le prestataire appelant et `accepted_at` nul.
- **`waiting_since`** :
  - c'est l'entrée dans le statut courant, posée par la machine d'état dans une nouvelle colonne `status_changed_at` ;
  - les données existantes sont rétro-remplies depuis le journal d'activité des transitions, sinon depuis `updated_at`. Le choix est écrit dans la migration.
- **Correctif « J'accepte »** : `can_accept` et `can_decline` sont faux dès que la demande est `completed`, `closed` ou `cancelled`. L'acceptation est refusée par le serveur dans les mêmes cas (409), pas seulement masquée.
- **Coût masqué au locataire** ([décision famille 4 n° 6a](../../../qa/audit-ux-2026-11/04-patrimoine-et-location.md)) :
  - `estimated_cost`, `actual_cost` et les champs de devis ne sont pas servis au demandeur locataire ;
  - ils restent servis au donneur d'ordre (`actAsPrincipal`), au bailleur du bien et au prestataire assigné ;
  - c'est un amendement de §1.8, cf. `spec-delta.md`.
- **Signalement** : `description` devient facultative pour le demandeur. `title` reste exigé (le front le déduit de la catégorie). Le formulaire du personnel ne change pas.
- **Suggestions** : une règle déterministe, écrite dans la PR :
  1. métier = catégorie ;
  2. zone qui contient le quartier ou la ville du bien ;
  3. puis `average_rating` décroissante ;
  4. puis les interventions réalisées décroissantes.
  Seulement les prestataires actifs du carnet de cette agence. Aucune IA.
- **Portées** : `summary` et `file` respectent la visibilité actuelle de l'index (chacun ne compte que ce qu'il voit). Le prestataire ne voit l'adresse qu'après acceptation (TCK-592, inchangé).
- **Performance** : `file`, `waiting_on` et `waiting_since` se calculent sans requête par ligne.

## Delta à produire

- [ ] Migration `add_status_changed_at_to_maintenance_requests`, avec le rétro-remplissage. La machine d'état pose la colonne à chaque transition.
- [ ] `App\Services\Maintenance\MaintenanceQueue` : la table ci-dessus, `file`, `waiting_on` et le filtre par file.
- [ ] Filtres `file`, `scheduled_from` et `scheduled_to`. Route `GET /api/maintenance-requests/summary`.
- [ ] Route `GET /api/maintenance-requests/{id}/suggested-providers` → `SuggestedProvidersController`.
- [ ] `MaintenanceRequestResource` : `can_accept` et `can_decline` corrigés, refus serveur 409, coûts masqués au locataire.
- [ ] `StoreMaintenanceRequestRequest` : `description` facultative.
- [ ] Carnet : téléphone et `completed_interventions_count`.
- [ ] Tests :
  - `MaintenanceQueueMappingTest` : fournisseur de données sur les 12 statuts × prestataire présent ou non × créneau passé ou non, qui exige **exactement une** file par cas ;
  - `MaintenanceSummaryCountsTest` ;
  - `MaintenanceAcceptOnCompletedTest`, vérifié par ablation ;
  - `MaintenanceCostHiddenFromTenantTest` ;
  - `ProviderWeekFilterTest` ;
  - `SuggestedProvidersTest` ;
  - `ServiceProviderIndexPhoneAndCountTest` ;
  - `MaintenanceStoreWithoutDescriptionTest`.

## Critères d'acceptation

- [ ] AC1 — Le test de la table couvre les 12 statuts. Chaque cas rend une seule `file`. Ajouter un 13ᵉ statut à l'énumération sans le classer fait rougir le test.
- [ ] AC2 — La demande #8 de la démo (`open`, sans prestataire, depuis le 14 sept.) rend `file=a_dispatcher` et un `waiting_since` du 14 sept. La #9 (`in_progress`, créneau du 27 sept.) rend `file=en_retard` et `slot_overdue_days ≥ 44`.
- [ ] AC3 — Sur une demande `completed` non acceptée, le prestataire reçoit `can_accept=false`, et `POST …/accept` rend 409.
- [ ] AC4 — Le locataire demandeur de la #44 ne reçoit ni `actual_cost` ni `estimated_cost`. L'admin de l'agence et le bailleur du bien les reçoivent.
- [ ] AC5 — Les comptes de `summary` égalent les `meta.total` de chaque `filter[file]`, pour l'admin, pour un prestataire et pour un bailleur.
- [ ] AC6 — `filter[scheduled_from]=lundi&filter[scheduled_to]=dimanche` rend au prestataire ses seules demandes de la semaine.
- [ ] AC7 — Un locataire crée un signalement sans `description` : 201.

## Hors périmètre

- Les écrans (TCK-2653, TCK-2654).
- Le glisser-déposer du tableau, la note vocale, le fil de discussion par intervention.
- Le classement « dispatch suggéré » par IA (ambition).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
