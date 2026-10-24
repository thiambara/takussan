---
id: TCK-2260
title: "Rapprochement bancaire par payments.reconcile, journal d'audit et tableau de bord du bailleur par reports.view_agency"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2024]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#catalogue-capability-tck-278--tck-279"
  adr:
    - "docs/adr/0003-capacites-enum-code-defined.md#amendement-du-2026-10-24--paymentsreconcile-et-une-capacité-neuve-quun-geste-existant-exige"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-116--gestes-dagence-jugés-par-le-type-de-profil-au-lieu-dune-capacité"
tags: [api, web, accounting, audit, dashboard, authorization, capabilities, migration, pistes]
---

## Contexte

Pistes : P116.07

Réf : **P116.07** du fichier de pistes, `validé`. Le rapprochement bancaire (`BankStatementPolicy`),
le journal d'audit de l'agence (`AuditLogController::indexByEntity`, `IndexAuditLogRequest`,
`ActivityLogPolicy::export`) et l'accès de l'admin au tableau de bord du bailleur
(`DashboardOwnerController`) ne jugeaient que `isAgencyAdminAt`, sans capacité du catalogue. Ils
étaient hors de portée de l'éditeur de rôles. `IntegrationController::paymentProviders` recopiait
le prédicat de la liste au lieu de l'appeler.

Re-mesuré le 2026-10-24 sur `c35c20d16` : relu, les cinq sites sont inchangés. Les tests neufs
rougissent avant correctif : un admin dont le rôle retire la capacité obtient 200 sur les huit
gestes bancaires et sur les cinq lectures.

## Décision du porteur

validation du porteur (2026-10-24) : la décision du 2026-10-23 (capacité neuve `payments.reconcile`, réservée par défaut à l'admin, pour les quatre gestes bancaires ; journal d'audit et tableau de bord du bailleur par `reports.view_agency`), avec une migration de données idempotente, en ajout seul, qui insère `payments.reconcile` dans les rôles personnalisés de base `agency_admin` et ne retire rien ; `IntegrationController::paymentProviders` appelle le prédicat d'`index` au lieu de le recopier

## Reste à faire

compter en préproduction les rôles personnalisés de base `agency_admin`

## Hypothèses

La décision ne dit pas si un agent qui tient la capacité gagne ces gestes. La forme retenue est la
plus prudente, celle des pistes sœurs de l'angle 116 (P116.02, `AgencyPolicy::configure` ; P116.05) :
**l'admin de l'agence ET la capacité**. Un agent n'y gagne rien, et aucun accès ne s'ouvre. L'admin
principal garde le rapprochement sans la capacité, comme le prévoyait déjà la policy. Le journal et
le tableau de bord du bailleur n'avaient pas cette passe, et ne l'ont pas
(`AgencyPolicy::viewReports`).

## Delta à produire

- [x] `Capability::PaymentsReconcile` (`payments.reconcile`). L'admin la reçoit par
      `agencyAssignable()`, l'agent système non.
- [x] `BankStatementPolicy::viewAny` : admin principal, ou `isAgencyAdminAt` ET
      `canActAt(PaymentsReconcile)`. Ses lecteurs sont `view`, `create`, `finalize`, les lignes, le
      mapping CSV et la recherche de paiements.
- [x] `ActivityLogPolicy::viewAny` (super-admin, ou `isAgencyAdminAt` ET `reports.view_agency`).
      `export` la lit. `AuditLogController::indexByEntity` et `IndexAuditLogRequest::authorize`
      l'appellent au lieu de recopier le prédicat.
- [x] `DashboardOwnerController::show` : la branche de l'admin exige aussi `reports.view_agency`.
- [x] `IntegrationController::mayListIntegrations`, lu par `index` et `paymentProviders`.
- [x] Migration `2026_10_24_170000_add_payments_reconcile_to_custom_agency_admin_roles` : ajout seul
      dans les rôles `is_system = false` de base `agency_admin`, idempotente, cache oublié. Son
      `down()` ne la retire que de ces rôles.
- [x] Front : libellé `admin.roles.capabilities.payments.reconcile` (fr, en ; wo = texte français).
      `PAGES_ADMIN` : le rapprochement exige `payments.reconcile`, le journal `reports.view_agency`.
      Le lien « Rapprochement » de `/app/agency/finances` suit la table.
- [x] `scripts/check-notification-target-audience.mjs` : `EXIGENCES.audit` suit la page, destinataires relus.
- [x] Specs : `features.md` (§ 1.5, 2.5, 2.6) et le catalogue de `models-spec.md`.
      ADR-0003 amendé.

## Critères d'acceptation

- [x] AC1 — Admin dont le rôle retire `payments.reconcile` : les huit gestes du rapprochement
      (liste, import, détail, lignes, mapping CSV, recherche, ignorer une ligne, clôture) en 403, et
      le relevé n'est pas clos.
- [x] AC2 — L'agent du rôle système et l'agent qui tient `payments.reconcile` : les mêmes 403.
- [x] AC3 — Admin du rôle système : aucun 403 (import vide en 422) ; admin principal sans la
      capacité : liste et détail en 200.
- [x] AC4 — Admin dont le rôle retire `reports.view_agency` : journal (deux routes de liste, par
      objet, export) et tableau de bord du bailleur en 403. Agent qui la tient : les mêmes 403.
      Admin du rôle système : 200. Bailleur : son tableau de bord en 200, le journal en 403.
- [x] AC5 — Migration : un rôle personnalisé d'admin reçoit la capacité, et le résolveur la rend sur
      le champ (cache oublié). Un second passage ne change rien. Le rôle personnalisé d'agent et
      les rôles système sont intacts. `down()` retire la capacité des seuls rôles personnalisés
      d'admin.
- [x] AC6 — Front : un admin sans ces capacités n'a ni le rapprochement ni le journal dans
      `PAGES_ADMIN`, et la page des finances ne montre pas le lien du rapprochement.

## Hors périmètre

- Le layout de `/app/overview/owner` ouvre la page à tout admin. Un admin sans
  `reports.view_agency` qui n'est pas bailleur y lit l'état d'erreur de chargement de la page. Il
  n'y a aucune redirection, et ce layout ne lit aucune capacité.
- Les alertes de gouvernance (`GovernanceAlertService`, cible `audit`) partent toujours à tous les
  admins actifs : une alerte de sécurité ne se retire pas par l'éditeur de rôles. L'admin dont le
  rôle retire `reports.view_agency` reçoit l'avis, et son lien le renvoie à la première page qu'il
  peut ouvrir. `scripts/check-notification-target-audience.mjs` (`EXIGENCES.audit`) le dit.
- `check-controller-authorization` : `IndexAuditLogRequest` n'était pas une exemption nommée (c'est
  un FormRequest), et la liste reste inchangée.

## Notes d'implémentation

- Ablations, chaque fois sur un seul fichier remis à `pre-dev` :
  - `BankStatementPolicy` → AC1 rouge ;
  - `IndexAuditLogRequest`, `AuditLogController` ou `DashboardOwnerController` → AC4 rouge (admin
    sans la capacité) ;
  - `ActivityLogPolicy` → AC4 rouge, et le témoin aussi (l'ability `viewAny` n'existe pas avant) ;
  - migration sans l'oubli du cache → AC5 rouge (`canActAt` reste faux) ;
  - sans le filtre `is_system` → `down()` rouge ;
  - sans le filtre `base_profile_type` → les deux rouges ;
  - `pages-admin.ts` → 3 rouges ;
  - page des finances, avant correctif → 2 rouges.

  Tout est vert une fois remis.
- `MembershipCapabilityResolverTest` épingle la largeur d'`agency_admin`, qui passe de 45/47 à
  46/48, avec la décision écrite dans son docblock.
- `StreamedResponse` (l'export CSV) n'a pas de `status()` : le test lit `getStatusCode()`.
