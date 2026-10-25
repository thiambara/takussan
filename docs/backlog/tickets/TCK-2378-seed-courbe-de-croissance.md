---
id: TCK-2378
title: "Le seed dessine une vie d'agence : croissance, arrivées et départs, agences de tailles différentes, messages et notifications qui vieillissent"
status: review
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

- [x] `AgencySeeder` : dates de fondation et volumes différents par agence (paramètres par agence
      dans `SeedingConfig`), agence individuelle réduite à son titulaire.
- [x] `UserSeeder` : arrivées étalées sur la fenêtre, quelques départs, `last_login_at` semé.
- [x] Volumes mensuels croissants pour biens, clients et baux (au lieu d'un tirage uniforme).
- [x] `MessageSeeder` : échanges groupés en sessions autour de la création du fil, puis espacés ;
      `last_read_at` des participants semé.
- [x] `AppNotificationSeeder` : probabilité de lecture croissante avec l'âge ; familles « relance
      d'impayé » et « fin de bail proche » si leur code existe au catalogue.
- [x] `ActivityLogBackfillSeeder` : `causer` renseigné pour les actions humaines.
- [x] Assertions ajoutées à `SeedingInvariantsTest`. *(dans `SeedingGrowthTest`, cf. notes)*

## Critères d'acceptation

- [x] AC1 — Pas deux agences avec le même nombre de biens ni la même date de fondation ; l'agence
      `individual` n'a aucun `AgentProfile`.
- [x] AC2 — Les biens créés sur le dernier tiers de la fenêtre dépassent ceux du premier tiers.
- [x] AC3 — Au moins un utilisateur créé dans chacun des 6 derniers mois, et au moins un
      collaborateur parti avec un historique conservé.
- [x] AC4 — Dans les fils de plus de 6 mois, moins de 30 % des messages datent des 30 derniers jours
      (aujourd'hui 87 %).
- [x] AC5 — Le taux de non-lues des notifications de plus de 6 mois est inférieur à 10 % et à celui
      des 7 derniers jours.
- [x] AC6 — Plus de la moitié des lignes du journal d'activité ont un `causer_id`.
- [x] AC7 — Ablation : chaque AC est rouge sur le seeder d'origine.

## Hors périmètre

- Le contenu textuel des messages : TCK-2380.
- Les statistiques de vues publiques détaillées (boosts) : TCK-2379.

## Notes d'implémentation

- **Dépendance** : TCK-2377 est en `review`, non fusionné ; branche empilée, à la demande du porteur.
- **Taille d'agence** : `SeedingConfig::$taillesDAgence` (`[1.0, 0.65, 0.4]`, cyclique sur les
  agences `standard`) et `$tailleIndividuelle` (0,12). Les volumes « par agence » de la configuration
  sont ceux de la plus grande ; chaque seeder lit `SeedingContext::volume()`. Ces deux paramètres ne
  sont pas lus dans l'environnement.
- **Agence individuelle = son titulaire** : ni agent, ni agent de démonstration. Les seeders qui
  tiraient un agent passent par `SeedingContext::equipe()`, qui rend le titulaire faute d'agent — sans
  quoi l'agence n'aurait ni visite ni bail.
- **Un acte revient à un agent présent** : `SeedingContext::agentAu($agence, $date)` ne tire que parmi
  ceux arrivés avant et pas encore partis. Visites, réservations, baux, clients, tâches, états des
  lieux et fils d'équipe en passent par lui ; trois invariants du vérificateur le gardent.
- **Le départ passe par la suspension** (`AgentProfileStatus::Suspended`, le geste de
  `TeamMemberSuspensionService`) : l'application n'a pas d'autre geste de départ. Le profil porte la
  date dans `updated_at`, et le collaborateur garde ses visites et ses baux antérieurs.
- **Fondation** : en mois avant l'arrivée de l'équipe, qui précède le portefeuille (TCK-2377). Les
  utilisateurs de démonstration prennent l'ancienneté de l'équipe (ils étaient créés `now()`).
- **Croissance** : `Timeline::dateCroissante()`, densité linéaire (premier tiers 1/9, dernier 5/9),
  pour les biens et les clients de la fenêtre ; les baux, visites et réservations suivent.
- **Notifications** : la lecture dépend de l'âge (45 % lues à moins de 7 jours, 97 % au-delà de six
  mois). Relance d'impayé semée par `lease_payment.overdue` et `lease_payment.overdue_landlord`, aux
  jours de `SendLeasePaymentReminders::OVERDUE_DAYS`, tant que le loyer reste dû. **Aucun code « fin de
  bail proche »** au catalogue : famille non semée.
- **Journal d'activité** : l'auteur est l'agent du bail, de la visite ou de la réservation, l'agent qui
  a saisi le client, le demandeur de l'intervention, l'agent qui suit le bien. La création de
  l'échéancier des loyers reste sans auteur (le système l'écrit). Une ligne `updated` est datée de
  la dernière écriture, non plus de la création.
- **Tâches** : elles commençaient à `seedStart()` quel que soit le bien ; elles suivent désormais sa
  mise en ligne.
- ⚠ **Déterminisme** : une exécution du dossier de tests a rendu deux seeds de même graine
  différents, sur la seule table `messages` (le test passait seul). `MessageSeeder` tirait dans
  `$conversation->participants`, relation chargée sans `ORDER BY` ; les participants sont désormais
  triés. Défaut intermittent : le vert qui a suivi (26 tests sur 26) ne PROUVE pas la cause.
- **Deux tests adaptés** : `UserSeederProfilesTest` (7 agents : 5 + 2 arrivées) et
  `ConversationSeederTest` (l'équipe de la fixture est créée avant la fenêtre : un fil d'équipe ne
  réunit que les présents).
- **Ablation (AC7), le 2026-10-25** — chaque comportement d'origine rétabli seul, test rouge à chaque
  fois : fondation commune → AC1 rouge ; même volume partout → « Deux agences ont le même nombre de
  biens » ; agents dans l'agence individuelle → `agence_individuelle_avec_un_agent : 4` ; tirage
  uniforme → 31 biens au dernier tiers pour 23 au premier, sous le double exigé ; aucune arrivée →
  « Aucun agent arrivé dans les six derniers mois » ; aucun départ → aucun profil suspendu ; présence
  ignorée → `visite_menee_par_un_agent_absent : 144`, `bail_… : 19`, `reservation_… : 13` ; messages
  tirés vers maintenant → 201 récents sur 278 (72 %) ; lecture à pile ou face → 49 % de non-lues
  au-delà de six mois ; sans relance → « Aucune relance d'impayé » ; sans auteur → 0 ligne sur 5 121.
  Témoin sans modification : vert.
- ⚠ **Deux assertions ont dû être resserrées après l'ablation** : « dernier tiers > premier tiers »
  restait vert sur un tirage uniforme (le hasard suffit une fois sur deux) — il faut le double ; et
  « un utilisateur créé chacun des 6 derniers mois » était tenu par les seuls comptes clients — il faut
  un agent arrivé dans les six derniers mois. Les AC2 et AC3 tels qu'écrits acceptaient le seeder
  d'origine.
- **Seed complet par défaut** (`takussan_seed_audit`, 2 min 01 — les volumes ont baissé avec la taille
  des agences) : Dakar Immo fondée en 2017, 150 biens, 8 agents ; Thiès 2020, 98, 5 ; Saint-Louis 2022,
  60, 4 ; Studio de Aminata (individuelle) 2023, 18 biens, 0 agent, 9 baux. Biens créés par mois de
  8 (2025-11) à 38 (2026-09). Deux agents partis. Fils de plus de six mois : 0 message sur 1 021 dans
  les 30 derniers jours. Notifications non lues : 2,6 % au-delà de six mois, 40 % à moins de 7 jours ;
  1 741 relances d'impayé. Journal d'activité : 60,2 % des 12 625 lignes ont un auteur.
- ⚠ **Les fils anciens s'éteignent tous** (0 message récent sur 1 021) : l'AC4 est tenu, mais aucun
  fil de longue durée ne reste vivant. Laissé tel quel, à reprendre si une démo en a besoin.

