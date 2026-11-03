---
id: TCK-1096
title: "Membres d'une agence : `filter[role]` borné à l'agence, et `filter[assignable]` pour les sélecteurs de cible"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-88--comptes-blocked--ce-quils-reçoivent-et-qui-les-propose-encore"
tags: [back, front, agence, equipe, pistes]
---

## Contexte

Réf : **P88.03** du fichier de pistes, `validé (délégué)` (critère accordé : V7, ce que l'admin
voit dans la liste d'équipe et dans les sélecteurs).

`GET /api/agencies/{a}/members?filter[role]=agent` résolvait le rôle par un `whereHas` sans agence
ni statut : les sélecteurs de référent, de repreneur et de remplaçant (`fetchAgencyAgents`)
proposaient un compte bloqué, un agent suspendu et un bailleur de l'agence qui n'est agent
qu'ailleurs. Le même défaut a été corrigé sur `/api/users` par TCK-665.

### Décision du porteur (déléguée)

> dans `AgencyController::listMembers`, borner `filter[role]` (`agent`, `agency_admin`, `owner`) aux profils de l'agence de la route, sans filtre de statut, pour que l'onglet d'équipe de `TeamConsole` garde les suspendus ; ajouter `filter[assignable]=1`, qui ne garde que les membres pour qui `PersonnelDeLAgence::estPersonnel()` est vrai ; `fetchAgencyAgents` envoie `filter[role]=agent` et `filter[assignable]=1` ; test : avec `filter[role]=agent&filter[assignable]=1`, le compte `blocked`, l'agent `suspended` et le bailleur agent ailleurs sont absents et l'agent actif présent ; avec `filter[role]=agent` seul, le bailleur agent ailleurs est absent et l'agent `suspended` présent

## Objectif utilisateur

L'admin d'agence ne se voit proposer, comme référent, repreneur ou remplaçant, que des agents que
l'API acceptera ; l'onglet d'équipe garde ses membres suspendus.

## Contrat de données

`GET /api/agencies/{a}/members` gagne `filter[assignable]=1` (booléen ; absent ou faux : sans
effet). `filter[role]` garde ses valeurs ; une autre valeur rend toujours une liste vide.

## Contraintes strictes (métier)

- `filter[role]` ne lit aucun statut : l'onglet d'équipe garde les profils suspendus.
- **Hypothèse** : `filter[assignable]` écrit en SQL la règle de `PersonnelDeLAgence::estPersonnel()`
  (compte ni `blocked` ni `deleted` ; profil agent ou admin actif dans l'agence, ou délégation
  active de ces rôles, mêmes portées `active()` qu'`isStaffAt()`). Un prédicat PHP ne filtre pas
  une liste paginée ; le test fixe l'équivalence sur les trois cas de la décision.

## Delta à produire

- [x] `User::buildAgencyMembersQuery()` : la liste blanche de `buildQuery()`, avec `filter[role]`
      borné à l'agence et `filter[assignable]`.
- [x] `AgencyController::listMembers` : s'en sert, et retire le filtre de rôle écrit après coup.
- [x] `fetchAgencyAgents` : `filter[assignable]=1`.
- [x] Tests : `AgencyMembersListTest` (les deux requêtes de la décision), et l'URL de
      `fetchAgencyAgents`.

## Critères d'acceptation

- [x] AC1 — `filter[role]=agent&filter[assignable]=1` : agent actif présent ; compte `blocked`,
      agent `suspended`, bailleur agent ailleurs absents.
- [x] AC2 — `filter[role]=agent` : agent `suspended` présent, bailleur agent ailleurs absent ;
      `filter[role]=owner` le garde.
- [x] AC3 — `fetchAgencyAgents` envoie `filter[role]=agent` et `filter[assignable]=1`.

## Hors périmètre

- Les autres lecteurs de la route (`ContactLeadsInbox`, `AuditTrail`, `CreateDelegationDialog`,
  `TeamConsole`) : ils n'envoient pas `assignable`.
- Les includes de profils de la route, qui ne sont pas bornés à l'agence (TCK-665 l'a fait pour
  `/api/users` seulement).

## Notes d'implémentation

- Ablations, chacune → 1 rouge, puis correctif remis → vert :
  - contrôleur rendu à `HEAD` : 400, `assignable` est un filtre inconnu ;
  - `filter[role]=agent` sans borne d'agence : le bailleur agent ailleurs revient ;
  - `whereNotIn('users.status', …)` retiré : le compte bloqué revient ;
  - `agent-crm.ts` rendu à `HEAD` : `filter[assignable]` absent de l'URL.
- Le filtre de rôle était appliqué deux fois : par la liste blanche de `buildQuery()`
  (`roleFilter(null)`, sans agence) et par le `match` du contrôleur. La nouvelle méthode remplace
  le premier et rend le second inutile.
