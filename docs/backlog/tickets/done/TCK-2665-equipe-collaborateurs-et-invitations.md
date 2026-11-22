---
id: TCK-2665
title: "Équipe, côté API : les collaborateurs seuls, ce que chacun porte, et les invitations rangées"
status: done
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-11
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

Implémenté le 2026-11-11 (agent back-agence, branche `feat/audit-ux-app-lot-1`).

**Prémisse re-mesurée** : conforme. `filter[role]` de `GET /api/users` ne prenait qu'une valeur
(`User::roleFilter`), aucun résumé par membre, aucun `meta.counts` ; `GET /api/invitations` sans
filtre sur la fiche ni purge.

**Décisions**

- `filter[role]` en liste (OU) sur le chemin d'agence seulement (`User::teamRoleFilter`, chaque
  valeur par le `roleFilter` d'avant, extrait en `appliquerRole`) ; la console super-admin garde
  une valeur. Une seule valeur rend exactement ce qu'elle rendait.
- `meta.counts {agent, agency_admin, owner, absent}` : toujours rendu sur le chemin d'agence (pas
  seulement sous `include`), calculé sur la base de la liste **avec ses autres filtres et sans
  `filter[role]`** — sinon les pastilles du rôle non choisi tomberaient à 0. Un membre qui tient
  deux profils compte dans les deux. `absent` = une absence active (`RoleDelegation::absences()->active()`).
  Absent du chemin super-admin.
- `include=team_summary` (`AllowedInclude::custom`, lu par le contrôleur) : clés plates sur chaque
  membre, calculées par `App\Services\Reporting\TeamMemberSummary` en une requête par indicateur
  (épinglé : 2 membres et 12 membres → même nombre de requêtes).
  - `properties_followed_count` = `TeamPerformanceService::propertiesManaged()`, extraite de
    `forPeriod` (biens titulaires + collaborations agent|manager, hors portefeuille exclus) : une
    seule définition pour les deux écrans.
  - `commissions_due_amount` = somme des lignes `due` du grand livre dont le membre est bénéficiaire
    dans l'agence ; clé absente sauf pour un lecteur qui tient `payouts.approve` ou
    `reports.view_agency` dans l'agence active.
  - `current_absence` = l'absence en cours, règle de `TeamTodayService` ; le remplaçant est nommé
    sans coordonnée (`nameWithoutContact`).
  - `joined_at` = création du **premier** profil du membre dans l'agence (agent, admin ou bailleur),
    profils supprimés compris : passer d'agent à administrateur supprime le profil d'agent, et la
    date d'arrivée ne doit pas sauter à la promotion.
- `filter[customer_id]` : liste d'entiers, invitations dont l'`invitable` est la fiche `Customer` ;
  une valeur non numérique rend une liste vide (pas de 422 : forme des autres filtres exacts).
- Purge `DELETE /api/invitations/expired` (`ExpiredInvitationPurge`) :
  - « expirée » = la définition de `InvitationResource::isExpired()` : `expired`, **ou** `sent` dont
    `expires_at` est passé (le balayage horaire ne l'a pas encore vue, l'écran la montre déjà
    expirée). AC4 « une invitation `sent` reste » s'entend d'une `sent` non échue — épinglé ;
  - les lignes sont **supprimées** ; une invitation de bailleur délie ses biens
    (`TitulaireALaSaisie::delier`, comme le balayage — idempotent pour celles qu'il a déjà vues) ;
    les profils brouillons restent ; aucune notification (supprimer n'est pas expirer) ;
  - rôles exigés et connus (`InvitationService::INVITABLE_TYPE_BY_ROLE`), sinon 422 ; `team.invite`
    par `InvitationPolicy::purgeExpired`, 403 avant 422 ; second facteur par `ProtectedActions`
    (`AGENCY_TWO_FACTOR`) ;
  - une ligne d'activité `invitations_expired_purged` sur l'agence, causée par l'admin : `{count, roles}`,
    jamais une adresse ;
  - rend `{deleted: n}` sans enveloppe `data`, à la lettre du ticket ;
  - conséquence : une invitation purgée ne peut plus faire l'objet d'une demande de renouvellement
    (TCK-2609) — c'est le sens de la purge.

**Mesures** : 19 tests (11 + 3 + 5). 28 ablations rouges, restaurées par `cp`, md5 vérifiés
(14 côté équipe, 14 côté invitations, dont AC5 : retirer l'entrée de `ProtectedActions`). Deux
ablations restées vertes au premier passage ont été reprises : celle du déliement n'avait réécrit
que le docblock (première occurrence) — refaite sur le code, rouge ; celle des rôles exigés laissait
`filter` requis faire le travail — les trois gardes retirées ensemble, rouge, et un cas
`filter[role]=,` ajouté qui n'est attrapé que par le contrôle de liste vide (ablation rouge).

**Pour `/sync-specs`** : `docs/features.md` (équipe de l'agence, invitations) ne décrit ni la
liste de rôles, ni `team_summary`, ni la purge des invitations expirées.
