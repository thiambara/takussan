---
id: TCK-2378
title: "Le seed dessine une vie d'agence : croissance, arrivées et départs, agences de tailles différentes, messages et notifications qui vieillissent"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2377]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#23-notifications"
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#2-agency"
    - "docs/models-spec.md#20-message-"
tags: [api, seed, données, agence, messagerie, notifications]
---

## Objectif utilisateur

Une démo ou un test de tableau de bord montre une plateforme qui a **vécu** : des agences de tailles
et d'âges différents, une activité qui monte, des collaborateurs arrivés et partis, des fils de
discussion étalés dans le temps, des notifications anciennes lues.

## Contexte

Audit du seeding du 2026-10-25 (base `takussan_seed_audit`, configuration par défaut) :

- Les **4 agences** sont créées le même jour (2020-09-25) avec **le même volume** : 214 biens et
  141 clients chacune — y compris « Studio de Aminata », agence `individual`, dotée de 4 agents et
  10 propriétaires.
- Toutes les équipes naissent dans le premier mois de la fenêtre (`UserSeeder::createUser`) ;
  aucune arrivée ni départ ensuite. 302 utilisateurs sur 302 sont `active`, aucun n'a de
  `last_login_at`, aucun bien n'a de vue.
- **Messages** : dans les fils ouverts il y a plus de 6 mois, 1 823 messages sur 2 102 datent des
  30 derniers jours (`MessageSeeder` tire chaque date entre la précédente et maintenant).
- **Notifications** : non lues à 47 % au-delà de 6 mois, à 50 % sur 7 jours ; trois codes seulement
  (aucune relance d'impayé, aucune échéance de bail).
- **Journal d'activité** : 25 415 lignes, `causer_id` toujours nul, événements `created`/`updated`
  seulement.

## Contraintes strictes (métier)

- Une agence `individual` reste à l'échelle d'une personne (pas d'équipe d'agents).
- Un collaborateur parti garde son historique (ses visites, ses tâches) mais n'a plus de profil
  actif ; le seed passe par le statut que l'application emploie pour un départ (spec `User`,
  `Agency` — profils polymorphes, principe 1 de `CLAUDE.md`).
- Une notification semée garde un code du catalogue et l'émetteur réel de son événement
  (contrainte posée par TCK-1324 dans `AppNotificationSeeder`).
- Le journal d'activité nomme un auteur plausible quand l'action a un acteur humain.

## Delta à produire

- [ ] `AgencySeeder` : dates de fondation et volumes différents par agence (paramètres par agence
      dans `SeedingConfig`), agence individuelle réduite à son titulaire.
- [ ] `UserSeeder` : arrivées étalées sur la fenêtre, quelques départs, `last_login_at` semé.
- [ ] Volumes mensuels croissants pour biens, clients et baux (au lieu d'un tirage uniforme).
- [ ] `MessageSeeder` : échanges groupés en sessions autour de la création du fil, puis espacés ;
      `last_read_at` des participants semé.
- [ ] `AppNotificationSeeder` : probabilité de lecture croissante avec l'âge ; familles « relance
      d'impayé » et « fin de bail proche » si leur code existe au catalogue.
- [ ] `ActivityLogBackfillSeeder` : `causer` renseigné pour les actions humaines.
- [ ] Assertions ajoutées à `SeedingInvariantsTest`.

## Critères d'acceptation

- [ ] AC1 — Pas deux agences avec le même nombre de biens ni la même date de fondation ; l'agence
      `individual` n'a aucun `AgentProfile`.
- [ ] AC2 — Les biens créés sur le dernier tiers de la fenêtre dépassent ceux du premier tiers.
- [ ] AC3 — Au moins un utilisateur créé dans chacun des 6 derniers mois, et au moins un
      collaborateur parti avec un historique conservé.
- [ ] AC4 — Dans les fils de plus de 6 mois, moins de 30 % des messages datent des 30 derniers jours
      (aujourd'hui 87 %).
- [ ] AC5 — Le taux de non-lues des notifications de plus de 6 mois est inférieur à 10 % et à celui
      des 7 derniers jours.
- [ ] AC6 — Plus de la moitié des lignes du journal d'activité ont un `causer_id`.
- [ ] AC7 — Ablation : chaque AC est rouge sur le seeder d'origine.

## Hors périmètre

- Le contenu textuel des messages : TCK-2380.
- Les statistiques de vues publiques détaillées (boosts) : TCK-2379.

## Notes d'implémentation

_(à remplir par implementing-specs)_
