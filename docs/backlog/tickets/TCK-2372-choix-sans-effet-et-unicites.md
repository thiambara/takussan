---
id: TCK-2372
title: "Les routes de rôle refusent les rôles sans effet, l'assistant de l'hôte perd un champ sans lecteur, et un profil de prestataire comme une destination par défaut deviennent uniques en base"
status: doing
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#76-payoutmethod-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-249--valeurs-de-choix-acceptées-et-rangées-sans-effet"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-250--hasone-et--first-sans-ordre-là-où-plusieurs-lignes-par-parent-sont-possibles"
tags: [back, front, roles, onboarding, prestataire, reversements, messagerie, migration, pistes]
---

## Objectif utilisateur

Un geste que l'API accepte a un effet : changer le rôle d'un membre vers un rôle qu'aucune route ne
matérialise est refusé au lieu d'être « réussi » sans rien changer. L'hôte particulier ne remplit
plus un champ que rien ne lit. Un compte n'a qu'un profil de prestataire et qu'une destination de
reversement par défaut, et c'est la base qui le garantit, pas une lecture suivie d'une écriture.

## Contexte

Quatre pistes validées par le porteur le 2026-10-25 (second tour), angles 249 et 250. La mesure du
mesureur (2026-10-25, db3e25230) tient lieu de re-vérification ; chaque prémisse a été rejouée sur
l'arbre par le test de garde avant le correctif.

- Réf : **P249.01** — `UpdateAgencyMemberRoleRequest::ALLOWED_ROLES` (7 rôles) et
  `UpdateUserRoleRequest::ALLOWED_ROLES` (6) acceptaient `tenant`, `customer` et `service_provider`
  (et `super_admin` sur la route d'agence) ; les contrôleurs tombaient sur `default => null` et
  répondaient 200 avec le rôle demandé, sans changer aucun profil.
- Réf : **P249.03** — `preferences.primary_property_type` restait `required` dans
  `HostIndividualOnboardRequest` alors que TCK-966 (P47.07) a cessé de l'enregistrer ; l'étape 2 de
  l'assistant bloquait tant que le sélecteur était vide.
- Réf : **P250.02** — la règle « un profil de prestataire par compte » (TCK-2280) ne tient que par un
  `exists()` lu avant l'écriture ; aucune contrainte depuis `2026_05_10_170000`.
- Réf : **P250.03** — `User::customer()` et `Booking::lease()` sont des `HasOne` sans unicité et sans
  lecteur ; `MaintenanceRequest::conversation()` est un `HasOne` sans filtre ni ordre, et le fil se
  lit ailleurs (`SyncMaintenanceConversation::conversationFor`) ; `POST /api/conversations` accepte
  `maintenance_request_id` pour un groupe créé à la main ; `PayoutMethodService` garde une seule
  destination par défaut en lisant puis écrivant.

## Décision du porteur

- P249.01 : « validation du porteur (2026-10-25) : les deux routes de changement de rôle n'acceptent que `agency_admin`, `agent` et `owner`, par une liste partagée ; tout autre rôle rend 422 »
- P249.03 : « validation du porteur (2026-10-25) : le sélecteur « Type de bien principal » quitte l'assistant de l'hôte, et la règle passe à `sometimes` pour qu'un brouillon repris passe encore »
- P250.02 : « validation du porteur (2026-10-25) : un index unique partiel `(user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL` sur `service_provider_profiles`, dont la migration échoue en le disant s'il existe des doublons ; `orderBy('id')` explicite dans les lectures de `ServiceProviderAgenciesController` »
- P250.03 : « validation du porteur (2026-10-25) : `User::customer()` et `Booking::lease()` sont retirés ; le fil d'une intervention se lit par `MaintenanceRequest::conversation()` seule ; `maintenance_request_id` est refusé à la création manuelle d'un groupe ; index unique partiel `(user_id) WHERE is_default` sur `payout_methods`, migration qui échoue en le disant s'il existe des doublons »

## Hypothèses (mode sans humain)

- P249.01 : `UpdateUserRoleRequest::ALLOWED_ROLES` vaut `UpdateAgencyMemberRoleRequest::ALLOWED_ROLES`
  (une liste, deux noms). Le refus 403 `role.super_admin_grant_forbidden` de la route d'agence n'a
  plus de cas (`super_admin` rend 422 à la validation) : il est retiré du contrôleur ; sa clé de
  traduction reste, hors du périmètre.
- P249.03 : `preferences` et `preferences.primary_property_type` passent à `sometimes` (et
  `nullable`), la liste des types reste confrontée à une valeur envoyée. L'assistant n'envoie plus
  `preferences`, et un brouillon relu en perd la clé, pour que l'ancien état vierge reste reconnu
  comme tel.
- P250.02 et P250.03 : chaque migration relève les doublons vivants avant de créer l'index ; s'il en
  existe, elle lève une exception qui dit le nombre de comptes et les identifiants, sans rien
  corriger. Le `down()` retire l'index.
- P250.03 : `payout_methods` est en `SoftDeletes`, et une destination supprimée garde son
  `is_default`. L'index porte donc `WHERE is_default AND deleted_at IS NULL` : sans la seconde
  clause, ajouter une destination après avoir supprimé celle par défaut heurtait l'index (23505, 500).
  `PayoutMethodService` retire l'ancienne destination par défaut AVANT d'écrire la nouvelle, sous
  verrou de la ligne `users`, pour que l'index ne voie jamais deux lignes.
- P250.03 : `SyncMaintenanceConversation::conversationFor` est retiré ; ses deux lecteurs lisent
  `$mr->conversation()->first()`.

## Delta à produire

- [x] P249.01 : liste partagée `['agency_admin', 'agent', 'owner']`, `default => null` retirés des
  deux contrôleurs.
- [x] P249.03 : règle `sometimes` ; sélecteur, type, état initial, garde d'étape et envoi retirés de
  `HostIndividualWizard` ; clés `fields.primaryPropertyType` et `propertyTypes.*` retirées.
- [x] P250.02 : migration `service_provider_profiles_user_live_unique` ; `orderBy('id')` dans
  `ServiceProviderAgenciesController::index` et `::agencies`.
- [x] P250.03 : `User::customer()` et `Booking::lease()` retirés ; `MaintenanceRequest::conversation()`
  = groupe le plus ancien (`ofMany`) ; `maintenance_request_id` `prohibited` dans
  `CreateGroupConversationRequest` ; migration `payout_methods_user_default_unique`.

## Critères d'acceptation

- [x] AC1 (P249.01) — `tenant`, `customer`, `service_provider` et `super_admin` → 422 sur
  `PUT /api/agencies/{a}/members/{u}/role` (admin d'agence et super-admin) et sur
  `PUT /api/users/{u}/role` ; profils du membre inchangés.
- [x] AC2 (P249.01) — `tenant` demandé pour le seul administrateur → 422 de validation, et non
  `agency_member.cannot_remove_last_admin`.
- [x] AC3 (P249.03) — `POST /api/host/individual/onboard` sans `preferences` → 201 ; avec un type
  valide (brouillon repris) → 201 ; avec un type inconnu → 422.
- [x] AC4 (P249.03) — l'assistant n'affiche plus « Type de bien principal », n'envoie plus
  `preferences`, et un brouillon fantôme hérité qui porte encore la clé est supprimé.
- [x] AC5 (P250.02) — deux profils de prestataire vivants pour un même compte → violation d'unicité ;
  un profil supprimé et un vivant, ou deux brouillons sans compte → acceptés.
- [x] AC6 (P250.02, P250.03) — chaque migration, face à des doublons, échoue en nommant le nombre et
  les identifiants, et ne modifie rien ; `down()` retire l'index.
- [x] AC7 (P250.03) — `MaintenanceRequest::conversation()` rend le plus ancien groupe, jamais une
  conversation directe.
- [x] AC8 (P250.03) — `POST /api/conversations` d'un groupe avec `maintenance_request_id` → 422,
  aucune conversation créée ; le fil reste celui que crée l'assignation.
- [x] AC9 (P250.03) — deux destinations vivantes par défaut pour un compte → violation d'unicité ;
  ajouter une destination par défaut, ou après avoir supprimé celle par défaut → 201, une seule par
  défaut.

## Notes d'implémentation
