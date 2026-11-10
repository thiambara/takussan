---
id: TCK-2665
title: "Équipe, côté API : les collaborateurs seuls, ce que chacun porte, et les invitations rangées"
status: todo
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2667, TCK-2668]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#48-invitation-"
tags: [back, team, invitations, audit-ux, app]
---

## Objectif utilisateur

L'admin voit son équipe — agents et administrateurs, sans les bailleurs — avec, pour chacun, ses biens, ses commissions dues et son absence en cours, et range ses invitations.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- La page appelle `GET /api/users` (`UserAdminController::index`, via le BFF `admin-users`) : membres à profil agent, bailleur ou admin de l'agence active ; `filter[role]` **n'accepte qu'une valeur** ; impossible d'exclure les bailleurs. Par membre : 2FA, dernière connexion, `created_at` du **compte**. Ni biens suivis, ni commissions dues, ni absence en cours, ni date d'arrivée dans l'agence. (`GET /api/agencies/{agency}/members` accepte une liste de rôles, mais la page ne l'utilise pas.)
- `GET /api/invitations` : filtres exacts `status`, `agency_id`, `role`, `email`, `invited_by` ; **aucun filtre sur la fiche invitée** (`invitable_type` / `invitable_id`) ; **aucune purge** des invitations expirées. Les invitations de locataires naissent de la fiche client (`POST /api/customers/{customer}/invite`) et ne se listent que sur la page Équipe.

## Contraintes strictes (métier)

- Décision 2 (a) de la famille : l'équipe ne liste que les collaborateurs (agents, administrateurs). L'API garde la liste des bailleurs disponible pour qui la demande : rien n'est retiré, on filtre.
- `commissions_due_amount` ne sort que pour qui tient `payouts.approve` ou `reports.view_agency` ; sinon la clé est absente.
- La purge ne touche que les invitations **expirées** de l'agence active, des rôles demandés ; elle exige la double authentification de l'admin, comme renvoyer et révoquer (`ProtectedActions`), et `team.invite`. Elle est journalisée (nombre et rôles), sans adresse e-mail dans le journal applicatif.
- Le compte par rôle et le compte d'absents servent les pastilles : ils portent sur l'ensemble filtré, pas sur la page.

## Delta à produire

- [ ] `UserAdminController::index` : `filter[role]` accepte une liste séparée par des virgules (OU), comme `members`.
- [ ] `include=team_summary` → par membre : `properties_followed_count` (même définition que `properties_managed` de `TeamPerformanceService`), `commissions_due_amount`, `current_absence {starts_at, ends_at, substitute {id, name}} | null`, `joined_at` (création du profil dans l'agence).
- [ ] `meta.counts {agent, agency_admin, owner, absent}`.
- [ ] `GET /api/invitations` : `filter[customer_id]` (invitations nées d'une fiche client).
- [ ] `DELETE /api/invitations/expired?filter[role]=…` → `InvitationController::purgeExpired`, rend `{deleted: n}` ; ajout à `ProtectedActions`.
- [ ] Tests : `TeamMembersSummaryTest`, `InvitationsPurgeExpiredTest`, `InvitationsCustomerFilterTest`.

## Critères d'acceptation

- [ ] AC1 — Sur une agence de 9 agents, 2 admins et 11 bailleurs, `filter[role]=agent,agency_admin` rend 11 membres et `meta.counts` vaut `{agent: 9, agency_admin: 2, owner: 11, absent: n}`.
- [ ] AC2 — Un membre sans `payouts.approve` ni `reports.view_agency` ne reçoit pas la clé `commissions_due_amount`.
- [ ] AC3 — `current_absence` d'un agent absent du 10 au 14 nov. nomme son remplaçant, et vaut `null` le 15.
- [ ] AC4 — La purge avec `filter[role]=agent,agency_admin` supprime les seules invitations expirées de ces rôles dans l'agence active : une invitation `sent`, une expirée de locataire et une expirée d'une autre agence restent (comptes avant / après).
- [ ] AC5 — La purge sans second facteur confirmé rend le refus de `ProtectedActions` et ne supprime rien.
- [ ] AC6 — `filter[customer_id]=42` rend la seule invitation née de la fiche 42.

## Hors périmètre

- L'absence qui délègue (TCK-2666).
- Les écrans (TCK-2667, TCK-2668).
- L'invitation envoyée par WhatsApp (ambition de l'audit).
- Le rappel d'activer la double authentification (« Rappeler » de la maquette) : aucun envoi de ce rappel n'existe.

## Notes d'implémentation

_(à remplir par implementing-specs)_
