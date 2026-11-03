---
id: TCK-2225
title: "L'escalade d'une intervention urgente rejuge la demande sous verrou et écrit `escalated_at` sur la `metadata` relue"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-229--tâches-planifiées-qui-transitent-une-ligne-chargée-en-lot-face-au-geste-joué-pendant-leur-passage"
tags: [back, maintenance, concurrence, pistes]
---

## Objectif utilisateur

Une demande annulée ou remise en priorité normale pendant le passage d'`EscalateUrgentMaintenanceJob`
n'est pas escaladée, et la `metadata` écrite entre-temps n'est pas écrasée.

## Contexte

Réf : **P229.03** du fichier de pistes, `retenu · autonome` (A1 : la sélection du job et
l'effacement d'`urgent_since`/`escalated_at` par `MaintenanceRequestController::update` fixent le
contrat).

Avant (mesuré, geste joué dans l'écouteur `retrieved` après la lecture du job) : demande passée en
base à `normal`, `cancelled`, `metadata = {autre: y}` → un avis d'escalade, et `metadata` finale
`{autre: x, urgent_since, escalated_at}`.

## Hypothèses (mode sans humain)

- La demande est réclamée (relue sous verrou, sélection et délai d'urgence rejugés, `escalated_at`
  écrit) dans une transaction, et l'avis part après le commit. Un avis qui échoue laisse donc
  `escalated_at` posé, comme l'absence de destinataire depuis TCK-2185 : pas de second avis au
  passage suivant.

## Delta à produire

- [x] `EscalateUrgentMaintenanceJob` : sélection et délai écrits une fois, rejoués sous verrou par
  demande ; `escalated_at` écrit sur la ligne relue ; avis après le commit.
- [x] Test : `tests/Feature/Maintenance/EscaladeFaceAuGesteConcurrentTest.php`.

## Critères d'acceptation

- [x] AC1 — Demande annulée et remise en normal après la lecture du job → aucun avis, `metadata`
  intacte.
- [x] AC2 — `metadata` modifiée après la lecture → un avis, la valeur neuve gardée, `escalated_at`
  ajouté.
- [x] AC3 — Sans geste concurrent, un avis, et un second passage n'en envoie pas d'autre.

## Notes d'implémentation

- **Ablation** : job remis à `origin/pre-dev` → 2 rouges sur 3 (AC3 est le témoin) ; correctif
  remis → 3 verts. `UrgenceTardiveDInterventionTest`, `UrgenceSansAdministrateurPrincipalJoignableTest`
  et `MaintenancePriorityTest` restent verts.
