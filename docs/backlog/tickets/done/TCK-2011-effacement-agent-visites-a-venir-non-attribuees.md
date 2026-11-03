---
id: TCK-2011
title: "L'effacement du compte d'un agent rend ses visites à venir « non attribuées »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#56-accountdeletionrequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-175--relations-vers-un-compte-supprimé-en-douceur-par-la-suppression-de-compte"
tags: [api, visites, compte, effacement, pistes]
---

## Objectif utilisateur

Quand un agent efface son compte, ses visites à venir apparaissent à ses collègues comme « non
attribuées », et l'un d'eux peut les prendre en charge depuis l'écran existant.

## Contexte

Réf : **P175.02** du fichier de pistes, `validé`.

Mesuré avant correctif sur `e261b5ef2` : une visite `scheduled` et une `confirmed` dans trois
jours, accompagnées par un agent dont le compte est effacé par `executeDeletion()` ; un collègue
lit `GET /api/property-visits?filter[unassigned]=1` → `[]`. `anonymize()` ne remettait à `null`
que le `visitor_id` (TCK-1014), jamais l'`agent_id`.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : la recommandation du délégué ; tâches, interventions, demandes de contact et baux restent hors de ce lot

La recommandation du délégué (ligne `Mesure` du 2026-10-23, `5f0eac0bf`) : « à l'effacement,
remettre à `null` l'`agent_id` des seules visites `scheduled` et `confirmed` de l'agent, comme le
`visitor_id`, pour qu'elles retombent dans « non attribuées » (écran et badge existants, aucun
texte neuf), en gardant l'`agent_id` des visites passées (`completed`, `cancelled`, `no_show`)
pour l'historique ».

## Hypothèses (mode sans humain)

- « À venir » se lit par le statut (`scheduled`, `confirmed`), comme le dit la recommandation, et
  non par la date : une visite `scheduled` dont l'heure est passée reste une visite que personne
  n'a close, et la rendre à l'équipe est ce qui permet de la clore.

## Hors périmètre

- Tâches (`assigned_to_id`), interventions (`assigned_to`), demandes de contact
  (`handled_by_id`, `recipient_user_id`) et baux (`agent_id`) : hors de ce lot (décision du
  porteur).
- Le front : la prise en charge et le badge « non attribuée » lisent déjà `agent_id == null`.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` remet à `null` l'`agent_id` des visites `scheduled`
  et `confirmed` du compte.
- [x] Garde : `tests/Feature/Account/EffacementAgentVisitesAVenirTest.php`.

## Critères d'acceptation

- [x] AC1 — Après l'effacement de l'agent, ses visites `scheduled` et `confirmed` sont dans
  `filter[unassigned]=1` pour un collègue.
- [x] AC2 — Ses visites `completed`, `cancelled` et `no_show` gardent son `agent_id`.
- [x] AC3 — Les visites d'un autre agent ne bougent pas.

## Notes d'implémentation

- Ablation : sans la mise à jour, AC1 rouge (`[]` au lieu des deux visites) ; sans le seul
  filtre de statut, AC2 rouge ; rétabli → 3 verts, et `AccountDeletionExecuteTest` vert.
