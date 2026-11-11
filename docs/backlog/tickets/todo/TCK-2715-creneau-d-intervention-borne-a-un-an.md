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

**Recommandation de session, à confirmer par le porteur ; si refusée → `obsolete`.**

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

- [ ] Une constante unique de l'horizon (ex. `MaintenanceRequest::SCHEDULING_HORIZON_MONTHS = 12`), lue par les deux
      FormRequests — jamais deux littéraux.
- [ ] `AcceptMaintenanceRequestRequest::rules()` et `UpdateMaintenanceRequestRequest::rules()` : règle de borne haute sur
      l'instant converti.
- [ ] Message de validation dans `lang/{fr,en,wo}/validation.php` ou le domaine maintenance (wo = texte français, wolof en
      pause).
- [ ] Tests : `MaintenanceSchedulingHorizonTest` — les deux routes, chacune des deux côtés de la borne.
- [ ] Relire les tests existants qui postent une date d'intervention lointaine (accept et `PATCH`) : ceux qui dépassent
      un an sont à ramener sous la borne, sans changer ce qu'ils éprouvent.

## Critères d'acceptation

- [ ] AC1 — `POST …/accept {scheduled_at: <maintenant + 1 an − 1 jour>}` par le prestataire assigné rend 200 et pose
      l'heure ; `{scheduled_at: <maintenant + 1 an + 1 jour>}` rend 422 sur `scheduled_at`, et une relecture montre
      `accepted_at` toujours nul.
- [ ] AC2 — `PATCH …/{id} {scheduled_at: <maintenant + 1 an + 1 jour>}` par l'agent qui gère l'intervention rend 422 sur
      `scheduled_at` ; `<maintenant + 1 an − 1 jour>` rend 200.
- [ ] AC3 — Une valeur juste sous la borne mais portant un décalage qui la ferait passer au-delà une fois convertie rend
      422 (et l'inverse rend 200) : la borne lit l'instant, pas la chaîne.
- [ ] AC4 — Un compte qui n'est pas le prestataire assigné, postant une date au-delà de la borne sur `…/accept`, prend
      403 (pas 422).

## Hors périmètre

- `after:now` sur le `PATCH` de l'agence (une heure passée peut servir à consigner un passage déjà fait : à décider à
  part).
- Les créneaux de visite (`PropertyVisit`), qui ont leurs propres règles (`CreneauDeVisite`).
- L'écran : le sélecteur de date du front peut déjà limiter la saisie ; ce ticket ne garde que l'API.

## Notes d'implémentation

_(à remplir par implementing-specs)_
