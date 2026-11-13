---
id: TCK-2776
title: "La démo sème l'hôte d'une agence individuelle comme le bailleur de ses biens"
status: todo
phase: P2
family: technique
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
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

- [ ] `database/seeders/Core/UserSeeder.php` : pour une agence `individual`, pas de boucle de bailleurs ;
  l'admin reçoit son `OwnerProfile` (statut actif) à la création, comme le fait
  `HostIndividualOnboardingService` pour un hôte réel.
- [ ] `database/seeders/Catalog/PropertySeeder.php` (et tout seeder qui tire un bailleur de l'agence :
  baux, échéances, reversements) : dans l'agence `individual`, le titulaire est l'admin.
- [ ] `scripts/fidelite/personas.json` : rien à changer si l'email de l'hôte reste `admin@studio-aminata.sn`
  (à vérifier, la persona `hote` le désigne).
- [ ] Test : `tests/Feature/Seeders/AgenceIndividuelleSemeeTest.php` — après le seeder, dans chaque agence
  `individual` : un seul `OwnerProfile`, celui de l'admin, et chaque bien a pour `user_id` l'admin.

## Critères d'acceptation

- [ ] AC1 — Après `migrate:fresh --seed` (lancé par le porteur, jamais par un agent), `GET /api/dashboard/me`
  de l'hôte rend `role: owner` et `portfolio_total` égal au nombre de biens hors portefeuille-sorti de
  l'agence 4 (différent de 0).
- [ ] AC2 — `AgenceIndividuelleSemeeTest` est rouge si l'on rétablit la boucle de bailleurs pour l'agence
  `individual` (vérification par ablation).
- [ ] AC3 — L'accueil `/app` de la persona `hote` : « Ce mois » compte les mêmes biens que ceux dont
  l'accueil montre les visites (relevé de fidélité, lecture seule).
- [ ] AC4 — Les comptes des agences `standard` (biens, bailleurs, baux) sont inchangés à la graine près.

## Hors périmètre

- La vue « bailleur » de l'hôte elle-même (TCK-595) et toute vue « agence » pour l'hôte (question b, non
  remontée : voir le relevé ci-dessus).
- Les bandeaux de mise en service de l'hôte et le reste de l'accueil (TCK-2622, TCK-2624).

## Notes d'implémentation

_(à remplir par implementing-specs)_
