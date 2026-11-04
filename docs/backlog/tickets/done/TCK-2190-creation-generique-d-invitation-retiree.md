---
id: TCK-2190
title: "La création générique `POST /api/invitations` est retirée, et la cooptation ne se pose plus hors de sa porte"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-208--lendpoint-générique-post-apiinvitations-face-aux-services-dinvitation-par-rôle"
tags: [api, invitations, autorisation, 2fa, pistes]
---

## Objectif

Plus aucune invitation ne s'émet par la route générique : les routes par rôle et la cooptation
super-admin sont les seules portes. En défense, une invitation `super_admin` rattachée à une
agence ne pose plus le drapeau d'enrôlement, et l'enrôlement ne coupe plus une 2FA active qui ne
pourra pas se confirmer.

## Contexte

Réfs : **P208.01**, **P208.03**, **P208.04**, **P208.05**, **P208.06** du fichier de pistes, toutes
`validé`, un seul ticket comme le demande la décision de P208.01.

### Décision du porteur

P208.01 :

> validé — validation du porteur (2026-10-24) : la création (`store`) est retirée de la route générique `POST /api/invitations` ; `index`, `show`, `revoke`, `resend` et `accept` restent ; les appels de test passent aux routes par rôle ou au service ; ferme aussi P208.03 (liste blanche), P208.04, P208.05, le premier point de P208.06 et P181.05

P208.03 :

> validé — validation du porteur (2026-10-24) : `super_admin` sort de la liste blanche de `CreateInvitationRequest` (avec P208.01) ; en défense, `finalizeAccept` ne pose le drapeau d'enrôlement 2FA que pour une cooptation sans agence, et `enroll` ne coupe pas une 2FA active tant qu'aucune cooptation acceptée n'existe

P208.04 :

> validé — validation du porteur (2026-10-24) : une seule porte de cooptation, `SuperAdminCooptationService` ; le générique est fermé par P208.01 et P208.03, même ticket

P208.05 :

> validé — validation du porteur (2026-10-24) : fermée par le retrait de la création générique (P208.01) ; le témoin qui épingle l'écart est retiré, ou réécrit en test des routes par rôle, qui refusent déjà

P208.06 :

> validé — validation du porteur (2026-10-24) : dans le ticket de P208.01 : les deux premiers points tombent avec la création générique, et les docblocks se corrigent

## Hypothèses (mode sans humain)

- **`CreateInvitationRequest` est supprimée** : elle n'a plus d'appelant. La sortie de `super_admin`
  (P208.03) et d'`agency_admin` (P208.06) de sa liste blanche se fait donc par son retrait.
- **`InvitationPolicy::create` est retirée** : elle ne servait que `store`. Chaque route par rôle
  juge son geste par la policy de son profil (`invite`).
- **`enroll` reste ouvert à l'opérateur amorcé** (profil plateforme actif, sans cooptation) :
  `SuperAdminBootstrapService` pose 2FA active et drapeau, et le front envoie tout compte au
  drapeau sur l'enrôlement. La lettre « tant qu'aucune cooptation acceptée n'existe » l'aurait
  bloqué ; `confirm` l'accepte déjà (`attachSuperAdminRole` rend tôt sur un profil actif).
- **Le témoin de P208.05 est retiré**, pas réécrit : `InviteAgentTest::test_individual_agency_admin_gets_403`
  (et son jumeau du bailleur) teste déjà le refus des routes par rôle.
- **P181.05** est d'un angle impair, hors de la part de cette instance : son entrée n'est pas
  touchée ici. Le retrait de la création générique ferme l'entrée client de `metadata` ; le
  retrait de `metadata` d'`InvitationResource` reste à P181.05.

## Delta à produire

- [x] Route `invitations.store`, `InvitationController::store`, `CreateInvitationRequest` et
  `InvitationPolicy::create` retirés ; `InvitationController@store` sort de `ProtectedActions`.
- [x] `InvitationService::finalizeAccept` : drapeau seulement pour `super_admin` sans agence.
- [x] `SuperAdminTwoFactorController::enroll` : 403 `super_admin.not_pending` sur une 2FA active
  sans cooptation acceptée ni profil plateforme actif.
- [x] Docblocks d'`InvitationPolicy` et d'`InvitationService::send()` corrigés.
- [x] Tests qui passaient par la route : `InvitationSendTest`, `InvitationAttachmentTest` sur le
  service ; `RoleDInvitationRenduTest` lit les rôles d'`InvitationService` ; les cas d'invitation
  d'`AgenceSupprimeeNonCibleeTest` et d'`AgencyAndRoleExistenceOracleTest` retirés.

## Critères d'acceptation

- [x] AC1 — `POST /api/invitations` → 405 pour l'admin de A visant le brouillon de B (rien
  d'écrit, brouillon intact), pour une cooptation `super_admin` par un admin d'agence ou un
  super-admin, et pour une agence `individual` ; les cinq autres routes restent.
- [x] AC2 — Une invitation `super_admin` rattachée à une agence, acceptée par un compte à 2FA :
  drapeau `false`, 2FA intacte. Témoin : la cooptation sans agence pose toujours le drapeau.
- [x] AC3 — `enroll` sur 2FA active sans cooptation acceptée → 403, secret inchangé. Témoins :
  compte coopté sans agence, opérateur amorcé, compte sans 2FA → 200.

## Hors périmètre

- `metadata` dans `InvitationResource` (P181.05).
- Les clés de langue `invitations.errors.cannot_create` et `cross_agency`, sans appelant
  désormais : laissées, leur retrait toucherait le wolof.

## Notes d'implémentation

- Avant correctif : les quatre `POST` de `CreationGeneriqueRetireeTest` rendaient 201.
- Ablation de la route (contrôleur, route, requête, policy remis) → 5 rouges sur 6 ; remise → 6
  verts. Ablation du garde de `finalizeAccept` → 1 rouge ; du garde d'`enroll` → 1 rouge.
