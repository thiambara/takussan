---
id: TCK-2715
title: "Le créneau d'une intervention ne se pose pas au-delà d'un an"
status: todo
phase: P2
family: back
estimate: S
wave: 86
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2680, TCK-2700]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [back, maintenance, validation, scheduled_at, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

Le prestataire qui accepte une intervention en proposant son passage, comme l'agent qui fixe ce passage, ne peut pas
enregistrer par mégarde une date absurde (« 12/11/2099 ») qui sortirait l'intervention de toutes les files « à venir ».

## Contexte

Suivi de la vérification adverse de TCK-2680 (corrigée par c54da6b14). Relevé sur l'arbre du lot 1 :

- `AcceptMaintenanceRequestRequest` : `scheduled_at` → `sometimes|nullable|date|after:now`, **sans borne haute** :
  `2099-11-12T10:00:00` est accepté ;
- `UpdateMaintenanceRequestRequest` (`PATCH /api/maintenance-requests/{id}`) écrit **la même colonne** avec
  `sometimes|nullable|date` seul : borner l'acceptation sans borner le `PATCH` laisserait la même date passer par l'autre
  route.

Précédents de borne haute dans le dépôt : `StorePropertyUnavailabilityRequest` (24 mois), `VisitSlotsRequest`
(`before_or_equal:+60 days`), `StoreAgentAbsenceRequest` (`before_or_equal:$maxEndDate`).

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tes recommandations sur les dix points »).**

- **a) (recommandé)** borne haute à **un an** à compter de maintenant, sur les deux routes qui écrivent `scheduled_at`.
- b) pas de borne (statu quo).

## Contrat de données

- `POST /api/maintenance-requests/{id}/accept {scheduled_at?}` et `PATCH /api/maintenance-requests/{id} {scheduled_at?}` :
  une valeur au-delà de `now() + 1 an` rend **422 sur `scheduled_at`**. Le reste du contrat est inchangé (`null` vaut
  « sans créneau » à l'acceptation ; l'heure sans décalage se lit à Dakar, `MaintenanceRequest::scheduledInstant()`).

## Contraintes strictes (métier)

- La borne se juge sur **l'instant désigné** (après conversion du décalage, TCK-2700), pas sur la chaîne reçue : une
  heure `…+01:00` juste sous la borne en UTC+0 doit rester acceptée.
- L'ordre autorisation → validation (TCK-305) est conservé : un tiers qui poste une date au-delà de la borne prend 403
  sur l'acceptation (`respondToAssignment`), pas 422.
- Le `PATCH` ne gagne **pas** `after:now` dans ce ticket (hors périmètre).

## Delta à produire

- [x] Une constante unique de l'horizon (ex. `MaintenanceRequest::SCHEDULING_HORIZON_MONTHS = 12`), lue par les deux
      FormRequests — jamais deux littéraux.
- [x] `AcceptMaintenanceRequestRequest::rules()` et `UpdateMaintenanceRequestRequest::rules()` : règle de borne haute sur
      l'instant converti.
- [x] Message de validation dans `lang/{fr,en,wo}/validation.php` ou le domaine maintenance (wo = texte français, wolof en
      pause).
- [x] Tests : `MaintenanceSchedulingHorizonTest` — les deux routes, chacune des deux côtés de la borne.
- [x] Relire les tests existants qui postent une date d'intervention lointaine (accept et `PATCH`) : ceux qui dépassent
      un an sont à ramener sous la borne, sans changer ce qu'ils éprouvent.

## Critères d'acceptation

- [x] AC1 — `POST …/accept {scheduled_at: <maintenant + 1 an − 1 jour>}` par le prestataire assigné rend 200 et pose
      l'heure ; `{scheduled_at: <maintenant + 1 an + 1 jour>}` rend 422 sur `scheduled_at`, et une relecture montre
      `accepted_at` toujours nul.
- [x] AC2 — `PATCH …/{id} {scheduled_at: <maintenant + 1 an + 1 jour>}` par l'agent qui gère l'intervention rend 422 sur
      `scheduled_at` ; `<maintenant + 1 an − 1 jour>` rend 200.
- [x] AC3 — Une valeur juste sous la borne mais portant un décalage qui la ferait passer au-delà une fois convertie rend
      422 (et l'inverse rend 200) : la borne lit l'instant, pas la chaîne.
- [x] AC4 — Un compte qui n'est pas le prestataire assigné, postant une date au-delà de la borne sur `…/accept`, prend
      403 (pas 422).

## Hors périmètre

- `after:now` sur le `PATCH` de l'agence (une heure passée peut servir à consigner un passage déjà fait : à décider à
  part).
- Les créneaux de visite (`PropertyVisit`), qui ont leurs propres règles (`CreneauDeVisite`).
- L'écran : le sélecteur de date du front peut déjà limiter la saisie ; ce ticket ne garde que l'API.

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-3, branche `feat/audit-ux-app-lot-2`), sur le code de TCK-2700 tel qu'il est
dans l'arbre (`MaintenanceRequest::scheduledInstant()`, 2d5ecccf9).

**Prémisse re-mesurée** : conforme. Avant le correctif, `MaintenanceSchedulingHorizonTest` rougit 6 tests sur 11 :
`2027-11-12` et `2099-11-12` passaient en 200 sur l'acceptation comme sur le `PATCH`.

**Décisions**

- **Une constante, une règle.** `MaintenanceRequest::SCHEDULING_HORIZON_MONTHS = 12` et
  `MaintenanceRequest::schedulingHorizon()` (maintenant + 12 mois, `addMonthsNoOverflow` : un 29 février donne le
  28 février suivant, jamais le 1er mars). Une seule règle de validation, `App\Rules\DansLHorizonDuPassage`, posée
  dans `AcceptMaintenanceRequestRequest` (après `after:now`) et `UpdateMaintenanceRequestRequest` (sans `after:now`,
  hors périmètre) : aucun littéral dans les FormRequests.
- **Borne incluse** : exactement un an d'ici passe, une seconde de plus rend 422 (« au-delà de `now() + 1 an` »).
- **L'instant, pas la chaîne** : la règle convertit par `scheduledInstant()`, la conversion qu'emploient les deux
  routes à l'écriture. `2027-11-11T07:30:00-01:00` (08:30 UTC) rend 422, `2027-11-11T08:30:00+01:00` (07:30 UTC) 200.
- **Une valeur illisible n'est pas jugée par la règle** : `nullable` et `date` en répondent (422) ; la conversion est
  sous `try`, sans quoi `pas une date` aurait rendu 500 (la règle `date` ne coupe pas les règles suivantes).
- **Ordre autorisation → validation** inchangé (TCK-305) : le tiers prend 403 avant toute règle, borne comprise.
- **Message** `maintenance.errors.beyond_scheduling_horizon` en fr/en, `wo` = le texte français : « Le passage ne peut
  pas être fixé à plus d'un an d'ici. »
- **Tests existants relus** : aucun ne poste une date d'intervention au-delà d'un an (les créneaux postés sont à
  quelques jours de maintenant, ou en dates fixes de 2026 sous horloge figée) ; aucun n'a été modifié.

**Mesures** : `MaintenanceSchedulingHorizonTest` 11 tests (52 assertions). Verts aussi, un fichier à la fois :
`MaintenanceScheduleOffsetTest` (7), `MaintenanceAcceptWithSlotTest` (13, AC5 de TCK-2700), les 47 autres fichiers qui
font un `PATCH` ou un `…/accept` d'intervention, `LangGroupParityTest`, `LabelKeysCoverValuesTest`. Pint propre.

**Ablations** (une à la fois, sauvegarde par copie, restaurées après contrôle md5) :

| | Mutation | Rouges |
|---|---|---|
| H1 | règle retirée de l'acceptation | 2 (AC1 au-delà, AC3 accept) |
| H2 | règle retirée du `PATCH` | 4 (AC2, borne incluse, AC3 patch, message) |
| H3 | borne jugée sur l'heure murale de la chaîne | 4 (les quatre cas d'AC3) |
| H4 | borne exclue (`>=`) | 1 (borne incluse) |
| H5 | horizon à 13 mois | 6 |
| H6 | conversion hors `try` | 1 (valeur illisible → 500) |
| H7 | autre message | 1 |
| H8 | `authorize()` de l'acceptation toujours vrai | 1 (AC4 : 422 au lieu de 403) |

**Specs** : à reporter par `/sync-specs` dans `docs/features.md` § 18 (le passage borné à un an, sur les deux routes)
et `docs/models-spec.md` § 21 (`scheduled_at` : horizon de 12 mois).
