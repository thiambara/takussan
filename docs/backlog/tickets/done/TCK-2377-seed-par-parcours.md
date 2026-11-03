---
id: TCK-2377
title: "Le seed suit le parcours d'un client — visite, réservation, bail, échéances, sortie — au lieu de tirer chaque table au hasard"
status: done
phase: P2
family: technique
estimate: L
wave: null
created: 2026-10-25
updated: 2026-10-26
depends_on: [TCK-2376]
blocks: [TCK-2378, TCK-2379]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#11-review"
    - "docs/models-spec.md#24-inventory-"
tags: [api, seed, données, baux, crm]
---

## Objectif utilisateur

Un agent, un bailleur ou un locataire qui parcourt une base semée y retrouve des histoires
plausibles : le locataire d'un bail a visité le bien avant de le signer, son stade CRM le dit, ses
impayés ont une suite, et le bien est libre ou loué selon ses baux.

## Contexte

Audit du seeding du 2026-10-25 (base `takussan_seed_audit`, configuration par défaut). Chaque
seeder tire bien, client et dates indépendamment :

| Mesure | Valeur |
|---|---|
| Biens avec ≥ 2 baux actifs simultanés | 76 |
| Baux `residential_rent` sur terrain/garage/entrepôt/bureau/boutique | 243 |
| Baux `expired` dont la fin est future / `active` dont la fin est passée | 30 sur 36 / 25 |
| Visites antérieures à la création du bien / baux antérieurs au bien | 1 123 / 273 |
| Clients `lead` ayant un bail actif | 92 sur 161 |
| Avis écrits par le personnel de l'agence / propriétaires sur leurs biens | 286 sur 386 / 25 |
| Maintenances sur terrain ou garage | 40 |
| Baux actifs à ≥ 3 impayés, sans relance ni résiliation | 9 |
| Impayés jamais régularisés, quelle que soit leur ancienneté | 273 |
| Garants en base / rattachés à un bail (`lease_guarantor`) | 137 / 0 |
| États des lieux : pièces | toujours les 4 mêmes, tous signés |

## Contraintes strictes (métier)

- Le parcours se construit **dans l'ordre du temps** : un objet n'est jamais daté avant ceux dont il
  dépend (bien → visite → réservation → bail → échéances → paiement → reversement).
- Un bien n'a jamais deux baux actifs qui se chevauchent ; son statut se **déduit** de ses baux.
- Un bail `expired` a une fin passée ; un bail `active` a une fin future ; un `renewed` a son
  successeur (`renewed_from_lease_id`).
- Le stade CRM d'un client se **déduit** de son activité (bail actif ⇒ `converted`).
- Un avis est écrit par un client qui a visité ou loué le bien, jamais par le personnel de
  l'agence ni par le bailleur.
- Une maintenance porte sur un bien bâti, et son demandeur est le locataire d'un bail actif ou le
  bailleur.
- Un état des lieux décrit les pièces du type de bien (un studio n'a pas de « chambre
  principale » distincte, un bureau pas de cuisine).
- Les montants suivent la règle du décimal en base (principe 3 de `CLAUDE.md`).

## Delta à produire

- [x] Service de seed `Database\Seeders\Support\Parcours` (ou équivalent) qui, par client, enchaîne
      visites → réservation éventuelle → bail éventuel sur un bien **libre** à cette date.
      *(équivalent : la chaîne d'occupation par bien de `LeaseSeeder`, cf. notes)*
- [x] `LeaseSeeder` / `LeasePaymentSeeder` réécrits sur ce parcours : loyer tiré autour du `price`
      du bien, garant rattaché par `lease_guarantor` sur une part des baux, impayés qui se
      régularisent, se relancent ou mènent à une résiliation.
- [x] `PropertySeeder` : statut final dérivé des baux et des ventes.
- [x] `CustomerSeeder` : stade CRM dérivé de l'activité semée.
- [x] `ReviewSeeder`, `MaintenanceRequestSeeder`, `InventorySeeder` : auteur, bien et pièces
      cohérents (contraintes ci-dessus).
- [x] `SeedingInvariantsTest` (TCK-2376) étendu à chaque contrainte de ce ticket.

## Critères d'acceptation

- [x] AC1 — Zéro bien à ≥ 2 baux actifs qui se chevauchent.
- [x] AC2 — Zéro visite, réservation ou bail daté avant la création de son bien.
- [x] AC3 — Zéro bail `expired` à fin future, zéro `active` à fin passée ; chaque `renewed` a un
      successeur.
- [x] AC4 — Chaque locataire d'un bail actif est `converted` ; aucun `lead` n'a de bail.
- [x] AC5 — Zéro avis dont l'auteur est agent, admin d'agence ou bailleur du bien.
- [x] AC6 — Zéro impayé de plus de 90 jours sur un bail encore `active` sans relance ni
      résiliation ; au moins un impayé régularisé en retard existe.
- [x] AC7 — Au moins 20 % des baux signés ont un garant dans `lease_guarantor`.
- [x] AC8 — Ablation : chaque AC est rouge quand on rétablit le tirage indépendant correspondant.

## Hors périmètre

- La courbe de croissance des agences et des équipes : TCK-2378.
- Les tables des fonctionnalités vides (signatures, commissions…) : TCK-2379.
- Le texte des messages, tâches et avis : TCK-2380.

## Notes d'implémentation

- **Dépendance** : TCK-2376 est en `review`, non fusionné ; la branche est empilée sur celles de
  TCK-2376 et TCK-2380, à la demande du porteur (« puis enchaîne »).
- **Le parcours se construit par BIEN, pas par client** (`LeaseSeeder`) : chaque bien en location
  reçoit une chaîne d'occupation — délai de mise en location, visites du futur locataire, réservation
  pour un tiers des premiers baux (`booking_id`, `completed`), bail, issue (expiré, renouvelé avec le
  même locataire et `renewed_from_lease_id`, résilié), vacance, locataire suivant. C'est ce qui rend
  le chevauchement impossible par construction ; un client n'occupe qu'une chaîne. Les baux commencent
  le premier du mois, pour que les loyers de deux baux successifs ne se recouvrent pas.
- **Le stade CRM se déduit** dans `CustomerPipelineStageSeeder`, placé après visites, réservations et
  baux ; `CustomerSeeder` crée tout client en `lead`.
- **Un renouvellement naît sans garant ni caution**, comme dans l'application (`LeaseRenewalService`,
  TCK-2316). Le garant se rattache au premier bail (40 %) ; `GuarantorSeeder` renseigne désormais
  `agency_id`.
- **Impayés** : un retard de plus de 60 jours est régularisé (payé en retard, pénalité de 5 %) ; seuls
  les retards récents restent dus, et un bail résilié pour « Impayés répétés » garde ses deux derniers
  loyers impayés. Les factures et paiements couvrent aussi les baux `renewed` (un an sans facture au
  milieu de chaque chaîne sinon) ; le solde d'une réservation se règle à l'entrée dans les lieux.
- ⚠ **Écart de périmètre, nécessaire** : sur une fenêtre de 13 mois où biens et clients naissent
  tous, aucun bail d'un an ne pouvait expirer ni être renouvelé (mesuré : 0 `expired`). 30 % des biens
  publiés et des clients appartiennent désormais au **portefeuille d'avant la fenêtre**
  (`Timeline::portfolioStart()`, 24 mois avant ; les agences sont fondées 5 ans avant), et l'équipe
  (`UserSeeder::createUser`) arrive juste avant ce portefeuille, pour qu'aucun bail ne soit suivi par
  un agent arrivé après lui. L'étalement des arrivées reste à TCK-2378 — qui comptera ses tiers sur
  la fenêtre, pas sur le portefeuille. Les utilisateurs de démonstration (`DemoUsersSeeder`) restent
  créés `now()` : défaut antérieur, laissé à TCK-2378.
- **Invariants ajoutés au vérificateur** (13) : chevauchement, bail / visite / réservation
  antérieurs à leur bien, `expired` à fin future, `active` à fin passée, `renewed` sans successeur,
  locataire non `converted`, `lead` avec bail, avis du personnel ou du bailleur, impayé de plus de
  90 jours sur bail actif, maintenance sur foncier ou demandée par un tiers.
- **Tests** : `SeedingJourneyTest` (pipeline réel, 60 biens et 60 clients) — invariants à zéro,
  non-vacuité de chaque issue de bail, renouvellement cohérent, AC4, AC6, AC7, pièces des états des
  lieux, ordre du pipeline. Les 45 tests des classes de seed passent (628 s, déterminisme compris).
- **Ablation (AC8), le 2026-10-25** — chaque tirage indépendant rétabli seul, rouge à chaque fois :
  locataire suivant tiré pendant le bail en cours → `bien_occupe_par_deux_baux_qui_se_chevauchent : 18` ;
  visites tirées sur toute la fenêtre → `visite_anterieure_a_son_bien : 556` ; statut tiré sans la
  date de fin → `bail_expire_dont_la_fin_est_a_venir : 68` ; sans `CustomerPipelineStageSeeder` →
  2 tests rouges ; auteur tiré dans l'agence → `avis_ecrit_par_le_personnel_ou_le_bailleur : 28` ;
  impayés jamais régularisés → `impaye_de_plus_de_90_jours_sur_un_bail_actif : 33` ; aucun garant →
  AC7 rouge (0 < 0,2) ; foncier admis en maintenance → `maintenance_sur_un_bien_non_bati : 1` ;
  quatre pièces fixes → test des états des lieux rouge.
- **Seed complet par défaut** (`takussan_seed_audit`, 5 min 36, charge ~2,2/8) : invariants tenus ;
  baux 247 actifs, 38 résiliés, 26 renouvelés, 22 expirés, 12 brouillons ; 33,9 % des baux signés
  avec garant ; 67 loyers encore dus (récents ou menant à résiliation), 708 réglés avec pénalité ;
  114 réservations à l'origine d'un bail ; 198 avis, tous de clients ; 91 interventions sur 200
  signalées pendant un bail ; états des lieux à 11 tailles de pièces.
- ⚠ **Entonnoir CRM haut** : 307 clients `converted` sur 480. Chaque bail d'une chaîne prend un
  locataire distinct, et la configuration par défaut demande 90 baux pour 120 clients par agence. Le
  ratio se règle par `SEED_CUSTOMERS_PER_AGENCY`, pas par le code.
