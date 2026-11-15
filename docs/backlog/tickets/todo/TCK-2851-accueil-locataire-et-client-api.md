---
id: TCK-2851
title: "Accueil du locataire et du client, côté API : le bail jusqu'au, la photo et l'agent du logement ; la photo, l'agent et le lieu d'une visite à venir"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2852, TCK-2853]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, accueil, locataire, client, audit-ux, app]
---

## Objectif utilisateur

Le locataire voit son logement en photo, jusqu'à quand court son bail et qui le gère (avec de quoi lui écrire) ; le client voit sa visite avec la photo du bien, le nom de l'agent et de quoi s'y rendre.

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- `GET /api/me/rent-summary` (`TenantRentSummary`, l. 95-108) : `lease` = `{id, reference_number, status, monthly_rent, monthly_charges, currency, property {id, title}, agency {id, name, phone}}` — **ni `end_date`, ni photo du bien, ni agent** (`leases.agent_id` existe, `Lease::$fillable` l. 72) ; `offline_payment` porte les numéros Wave / Orange Money de l'agence (`OfflinePaymentMeans`).
- `GET /api/dashboard/me`, `visits_upcoming` (`DashboardTenantService` l. 96-110) : `{id, scheduled_at, status, property {id, title}}` — **ni photo, ni agent, ni adresse ou coordonnées** (`addresses.latitude/longitude` existent).
- Déplacer une visite côté client existe déjà : `POST /api/property-visits/{visit}/reschedule` (`PropertyVisitPolicy::reschedule` : visiteur ou client lié) — rien à faire.
- Écrire à l'agent du bail : `MessagingReach` (règle des contacts joignables, TCK-565) — à confirmer par un test que le locataire joint l'agent de son bail ; sinon, l'ajouter à la règle (pas un passe-droit dans le contrôleur).
- Historique des paiements et interventions du locataire : déjà servis (`CustomerPayments`, `maintenance-requests?filter[requester_id]`) — rien à faire.

## Contraintes strictes (métier)

- **Bail** (`rent-summary.lease`) gagne : `end_date` ; `property.cover_url` (même conversion que la messagerie, `ConversationContext`) ; `property.address_line` (quartier, ville) ; `agent {user_id, name, avatar_url}` — l'agent du bail (`leases.agent_id`), `null` s'il n'y en a pas ou s'il n'est plus actif dans l'agence ; jamais son téléphone ni son courriel (le locataire écrit par la messagerie).
- **Moyens en ligne** : si aucune lecture ne dit au locataire quels moyens **en ligne** sont ouverts (Wave · Orange Money · Free Money), le résumé gagne `online_means: [...]` lu de la configuration de la passerelle ; sinon, noter dans le ticket la lecture qui le dit.
- **Visite à venir** (`visits_upcoming`) gagne : `property.cover_url`, `property.address_line`, `property.coordinates {lat, lng}` (seulement pour une visite `confirmed`) ; `agent {name}` (prénom et nom de l'agent attribué, sans contact) ; `can_reschedule` (même règle que la Policy).
- Pas de N+1 : chargements groupés ; nombre de requêtes constant entre 1 et 5 visites.

## Delta à produire

- [ ] `MessagingReach` : le locataire joint l'agent de son bail (test, et règle si absente).
- [ ] `TenantRentSummary` : champs du bail ci-dessus (+ `online_means` si nécessaire).
- [ ] `DashboardTenantService` : champs de la visite ci-dessus.
- [ ] Tests `TenantRentSummaryLeaseCardTest` (fin de bail, photo, agent actif / parti → `null`, aucun contact de l'agent) et `TenantDashboardVisitsTest` (photo, agent, coordonnées seulement si confirmée, `can_reschedule`, requêtes constantes).

## Critères d'acceptation

- [ ] AC1 — Locataire d'un bail jusqu'au 31 août 2027 géré par Sokhna Sène : `rent-summary.lease.end_date = "2027-08-31"`, `lease.agent.name = "Sokhna Sène"`, `lease.property.cover_url` non vide ; la réponse ne contient ni le téléphone ni le courriel de l'agente.
- [ ] AC2 — Agent du bail suspendu : `lease.agent = null`.
- [ ] AC3 — Client avec une visite confirmée jeudi : `visits_upcoming[0]` porte `property.cover_url`, `property.coordinates`, `agent.name`, `can_reschedule = true` ; visite `scheduled` (non confirmée) : `coordinates` absent.
- [ ] AC4 — Requêtes de `dashboard/me` identiques avec 1 et 5 visites.
- [ ] AC5 — Le locataire crée un fil direct avec l'agent de son bail (`POST /api/conversations`) : 201.

## Hors périmètre

- Les écrans : TCK-2852 (locataire), TCK-2853 (client).
- La relance lue par le bailleur : TCK-2915 (famille 4, amendement d'ADR-0105 § 3).

## Notes d'implémentation

_(à remplir par implementing-specs)_
