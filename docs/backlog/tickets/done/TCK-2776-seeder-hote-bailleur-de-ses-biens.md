---
id: TCK-2776
title: "La démo sème l'hôte d'une agence individuelle comme le bailleur de ses biens"
status: done
phase: P2
family: technique
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [back, seeders, demo, hote, individual, accueil]
---

## Objectif utilisateur

L'hôte de la démo voit sur son accueil les chiffres de SES biens — ceux que ses visites, ses réservations et
ses avis montrent déjà —, et non « Biens 0 · Baux 0 · Encaissé 0 F ».

## Contrat de données

Aucun endpoint touché. `GET /api/dashboard/me` envoie l'admin d'une agence `individual` sur la vue bailleur
(`DashboardRoleResolver`, TCK-595), qui compte les biens dont il est le bailleur au sens de `BailleurDuBien`
(`user_id` = lui, dans une agence où il tient un `OwnerProfile`). La spec pose l'hôte « simultanément
`agency_admin` + `owner` » de son agence, sans autre bailleur (spec_refs).

Mesuré le 2026-11-13, en lecture seule (TCK-2624, relevé de l'accueil de l'hôte ; `GET /api/dashboard/me` par
le jeton de fidélité, `tinker --execute` sur des requêtes de lecture) :

| Agence 4 « Studio de Aminata » (`individual`) | Relevé |
|---|---|
| admin (`admin@studio-aminata.sn`, user 50) | rôles `agency_admin`, `customer` ; **0** `OwnerProfile` |
| biens de l'agence | **82** : 72 à user 51, 6 à user 52, 4 à user 70 |
| `OwnerProfile` de l'agence | users 51, 52, 70 |
| `GET /api/dashboard/me` de l'hôte | 200, `role: owner`, `portfolio_total` 0, `leases_active` 0, `cashflow_month` 0 |

L'accueil de l'hôte montre donc « 8 visites à confirmer » (lues à l'échelle de l'agence) au-dessus de
« Biens 0 » (lus à l'échelle du bailleur). Cause : `database/seeders/Core/UserSeeder.php` sème l'agence
`individual` comme une agence standard réduite — un admin, puis `max(2, round(10 × taille))` bailleurs
distincts (`$this->membre(…, 'owner', $i)`) — ; seuls les agents y sont écartés (TCK-2378).

**Question mesurée dans le code (porteur : branche b de la décision de TCK-2624, 2026-11-13)** — un parcours
produit peut-il créer une agence `individual` dont l'admin n'est pas le bailleur de ses biens ? Relevé du
2026-11-13, **non** sur chacune des voies :

- invitation d'un bailleur ou d'un agent : `OwnerInvitationService::assertAgencyCanInvite()` et
  `AgentInvitationService` appellent `AgencyKindGuard::ensureCanFormTeam()` — `standard` seule, **sans**
  passe-droit du super-admin (le passe-droit de `Gate::before` ne vaut que pour la policy) ;
- bien créé au nom d'un autre : `TitulaireALaSaisie::resoudre()` / `bailleurEnAttente()` refusent toute
  désignation de titulaire dans une agence `individual` (`property.owner_designation_forbidden`) — le bien
  naît au nom de son auteur ; la copie (`titulaireDeLaCopie`) garde le titulaire de la source ;
- départ d'un bailleur : `OwnerDepartureService` refuse l'agence `individual` (`owner.departure_individual`) ;
- reversement à un tiers : `PayoutService` refuse (`payout.individual_third_party`) ;
- changement de nature : seule la montée `individual` → `standard` existe (`AgencyUpgradeRequestService`) ;
  la spec exclut la rétrogradation.

⇒ La forme de l'agence 4 n'est atteignable que par le seeder : la question (b) — compter les biens de
l'agence plutôt que ceux du bailleur — **ne remonte pas** au porteur. Si l'implémenteur trouve une voie
que ce relevé a manquée, il s'arrête et la remonte (b) au lieu de corriger le seeder.

## Contraintes strictes (métier)

- L'hôte d'une agence `individual` y tient un `AgencyAdminProfile` **et** un `OwnerProfile` actifs, et il est
  le titulaire (`user_id`) de chacun de ses biens ; aucun autre `OwnerProfile` dans l'agence.
- Les prestataires de l'hôte restent (l'invitation de `ServiceProvider` est ouverte à l'agence `individual`).
- Aucun code produit ne change : ni `DashboardRoleResolver`, ni `BailleurDuBien`, ni le front.
- La graine reste déterministe (`Tirage`, TCK-2380) : les autres agences ne bougent pas.

## Delta à produire

- [x] `database/seeders/Core/UserSeeder.php` : pour une agence `individual`, pas de boucle de bailleurs ;
  l'admin reçoit son `OwnerProfile` (statut actif) à la création, comme le fait
  `HostIndividualOnboardingService` pour un hôte réel.
- [x] `database/seeders/Catalog/PropertySeeder.php` (et tout seeder qui tire un bailleur de l'agence :
  baux, échéances, reversements) : dans l'agence `individual`, le titulaire est l'admin.
- [x] `scripts/fidelite/personas.json` : rien à changer si l'email de l'hôte reste `admin@studio-aminata.sn`
  (à vérifier, la persona `hote` le désigne).
- [x] Test : `tests/Feature/Seeders/AgenceIndividuelleSemeeTest.php` — après le seeder, dans chaque agence
  `individual` : un seul `OwnerProfile`, celui de l'admin, et chaque bien a pour `user_id` l'admin.

## Critères d'acceptation

- [x] AC1 — Après `migrate:fresh --seed` (lancé par le porteur, jamais par un agent), `GET /api/dashboard/me`
  de l'hôte rend `role: owner` et `portfolio_total` égal au nombre de biens hors portefeuille-sorti de
  l'agence 4 (différent de 0).
- [x] AC2 — `AgenceIndividuelleSemeeTest` est rouge si l'on rétablit la boucle de bailleurs pour l'agence
  `individual` (vérification par ablation).
- [x] AC3 — L'accueil `/app` de la persona `hote` : « Ce mois » compte les mêmes biens que ceux dont
  l'accueil montre les visites (relevé de fidélité, lecture seule).
- [x] AC4 — Les comptes des agences `standard` (biens, bailleurs, baux) sont inchangés à la graine près.

**Preuves AC1 et AC3 (session, 2026-11-15, démo remise à zéro par la session — décision 2a du porteur)** :

- SQL, lecture seule : bailleurs de `studio-aminata` = `50` seul, égal à `primary_admin_id` ; biens dont le bailleur
  n'est pas l'admin : 0 ; biens hors archivés et vendus : 80 ; visites sur un bien d'un autre bailleur : 0.
- `GET /api/dashboard/me` (jeton de l'hôte) : 200, `role: owner`, `portfolio_total: 80`, `leases_active: 40`,
  `cashflow_month: 16705000`, `overdue_count: 1`.
- Relevé `/app`, persona `hote`, téléphone 390 et bureau 1280 (`fidelite.mjs releve`) : « Ce mois » affiche Biens 80,
  Baux actifs 40, Encaissé 16,7 M F, En retard 1,6 M F ; les visites à confirmer portent sur ces biens (contrôle SQL
  ci-dessus). La visite guidée du premier passage recouvre l'écran : elle n'altère pas les chiffres lus.

## Hors périmètre

- La vue « bailleur » de l'hôte elle-même (TCK-595) et toute vue « agence » pour l'hôte (question b, non
  remontée : voir le relevé ci-dessus).
- Les bandeaux de mise en service de l'hôte et le reste de l'accueil (TCK-2622, TCK-2624).

## Notes d'implémentation

- Prémisse re-mesurée le 2026-11-14 (démo remise à zéro à 23:10, lecture seule) : agence 4 `studio-aminata`,
  `OwnerProfile` de 51 (`owner1@`), 52 (`owner2@`) et **70 (`owner@agency4.demo.takussan.sn`)** ; biens 72 / 6 / 4 ;
  l'admin 50 n'en tient aucun. Le troisième bailleur venait de `DemoUsersSeeder`, que le ticket ne nommait pas.
- `UserSeeder` : dans une agence `individual`, l'admin reçoit son `OwnerProfile` actif et est rangé parmi les
  bailleurs du contexte (`registerUser(…, 'owner', …)`) ; pas de boucle de bailleurs. `PropertySeeder`,
  `FilterCoverageSeeder`, `EdgeCaseSeeder` et `PropertyCollaboratorSeeder` tirent leur titulaire par
  `usersWithProfile(OwnerProfile)` : aucun changement chez eux. Baux, échéances et reversements suivent le
  titulaire du bien. `InvitationSeeder` saute déjà le titulaire.
- `DemoUsersSeeder` : pas de bailleur de démonstration dans une agence `individual` (comme pour l'agent, TCK-2378).
- `PayoutSeeder` : un reversement ne porte une destination que si elle est vérifiée par l'agence du bail
  (`defaultVerifiedDestination` de `PayoutService`). L'hôte, seul bailleur, ne vérifie pas la sienne
  (`SegregationOfDuties`) : sans ce garde, `reversement_vers_une_destination_non_verifiee : 3` faisait échouer
  le pipeline (mesuré). Ses reversements restent sans destination (`bank_transfer`). Décision de la session, 2026-11-14 :
  écart au delta accepté, cohérent avec `PayoutService`.
- `personas.json` : la persona `hote` désigne toujours `admin@studio-aminata.sn` — rien à changer.
- Le tirage de l'agence `individual` consomme moins d'aléa (plus de bailleurs à nommer) : les valeurs des
  agences semées APRÈS elle bougent, pas leurs comptes (AC4, « à la graine près »).

## Preuves

- `AgenceIndividuelleSemeeTest` : rouge avant le correctif (`[50]` attendu, `[51, 52, 70]` rendus — la forme de
  la démo), vert après (16 assertions).
- Ablations (fichiers restaurés, md5 vérifié) : boucle de bailleurs rétablie pour l'`individual` → rouge ;
  bailleur de démo rétabli → rouge ; garde de `PayoutSeeder` retirée → `SeededAgentDirectoryTest` rouge sur
  `reversement_vers_une_destination_non_verifiee : 3`.
- Pipeline : `SeedingGrowthTest`, `SeedingInvariantsTest`, `SeededAgentDirectoryTest`,
  `SeedingTextAndDeterminismTest`, `SeedingJourneyTest`, `SeedingFeatureTablesTest`,
  `PayoutSeederSansReversementFuturTest`, `UserSeederProfilesTest`, `PropertyCollaboratorSeederTest`,
  `ConversationSeederTest` et `tests/Feature/Seeders/` verts.
- AC4 : le test affirme ≥ 2 bailleurs par agence `standard`, admin exclu.
- AC1 et AC3 : après la remise à zéro de la démo par la session.
