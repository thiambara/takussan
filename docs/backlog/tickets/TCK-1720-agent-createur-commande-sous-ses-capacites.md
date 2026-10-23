---
id: TCK-1720
title: "L'agent qui a saisi un bien d'agence commande, clôt et tranche les devis de ses interventions sous `maintenance.assign` et `maintenance.close`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1718]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-160--propertiesuser_id-lu-comme-le-bailleur-dans-une-décision-métier"
tags: [api, autorisation, maintenance, pistes]
---

## Contexte

Réf : **P160.02** du fichier de pistes (🔴, `validé`). `MaintenanceRequestPolicy::isPrincipalFor`
rendait vrai à `properties.user_id` sans autre condition, et `isTeamPrincipalFor` excluait ce même
`user_id` : les capacités de l'équipe (`maintenance.assign` pour commander et trancher un devis,
`maintenance.close` pour clore) n'étaient jamais jugées pour l'agent qui a saisi le bien. Mesuré :
un agent à rôle personnalisé sans ces deux capacités commandait, clôturait et approuvait le devis
des interventions de « son » bien.

**Décision du porteur** : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Le critère accordé est V2 (et V1 pour le devis approuvé).

## Objectif utilisateur

L'agent qui a saisi un bien d'agence est donneur d'ordre de ses interventions au titre de l'équipe,
et ses capacités `maintenance.*` décident de ses gestes.

## Delta à produire

- [x] `MaintenanceRequestPolicy` : `isPrincipalFor`, `isTeamPrincipalFor`, `principalWrites` et la
  branche `awaiting_owner` de `decideQuote` lisent `BailleurDuBien::est()` (TCK-1718) au lieu de
  `properties.user_id` seul.
- [x] `tests/Feature/Maintenance/AgentCreateurDonneurDOrdreTest.php`.

**Choix de l'implémenteur** : le même prédicat que TCK-1718 (profil propriétaire dans l'agence, de
tout statut). L'agent créateur reste donneur d'ordre par la branche du personnel (profil actif dans
l'agence du bien) : il garde la lecture et les gestes que son rôle lui donne.

## Critères d'acceptation

- [x] AC1 — agent créateur sans `maintenance.assign` : `PATCH …` de `assigned_to` 403 ; avec : 200.
- [x] AC2 — agent créateur sans `maintenance.close` : passage à `closed` 403 ; avec : 200.
- [x] AC3 — agent créateur sans `maintenance.assign` : `POST …/quote/approve` 403 ; avec : 200.
- [x] AC4 — le bailleur du bien clôt toujours sans capacité d'agence.

## Hors périmètre

- `OwnerApprovalThreshold::isLandlord` compare encore `user_id` seul. Sans effet mesurable ici : un
  bien saisi par un agent n'a pas de plafond (pas d'`OwnerProfile` du créateur, `of()` rend `null`),
  donc ni `awaiting_owner` ni refus de `actual_cost`. Reste noté par P160.06.
- Le membre **retiré** de l'agence (P153.03, PR #1200) : couvert de fait par le même prédicat
  (sans profil propriétaire, il n'est plus bailleur), mais la PR #1200 modifie les mêmes lignes ;
  la seconde fusionnée se réconcilie.

## Notes d'implémentation

- Ablation : `MaintenanceRequestPolicy.php` rendu à `origin/pre-dev` → les trois refus (AC1 à AC3)
  rouges, « Expected 403 but received 200 » ; correctif remis → 7 verts.
- Les 53 classes qui citent la policy ou `/maintenance-requests`, jouées une à une : trois rouges,
  tous du même jeu d'essai — un « propriétaire » sans aucun profil dans l'agence du bien
  (`MaintenancePrincipalFieldsTest` ×2, `MaintenancePriorityTest`, `MigratedAuthorizationRulesTest`).
  Il n'était bailleur que par `user_id`, ce que la piste écarte ; il reçoit un profil de bailleur.
  Dans `MaintenancePrincipalFieldsTest` et `MigratedAuthorizationRulesTest`, la ligne est celle que
  la PR #1200 (TCK-1709) écrit au même endroit, à l'identique, pour que les deux fusionnent sans
  conflit sur ces lignes.
