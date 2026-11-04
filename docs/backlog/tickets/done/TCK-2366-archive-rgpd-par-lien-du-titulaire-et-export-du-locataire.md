---
id: TCK-2366
title: "L'archive RGPD rend chaque ligne selon le lien du titulaire avec elle, et l'export du locataire prend toutes ses fiches client"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  adr:
    - "docs/adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md#amendement-du-2026-10-25--ce-que-larchive-rend-dune-ligne-selon-le-lien-du-titulaire"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-247--archive-rgpd-dataexportbuilderpayloads--clauses-par-colonne-dauteur-ou-dencaisseur"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-250--hasone-et--first-sans-ordre-là-où-plusieurs-lignes-par-parent-sont-possibles"
tags: [api, privacy, rgpd, export, pistes]
---

## Contexte

Réfs : **P247.01, P247.02, P247.03, P250.01** du fichier de pistes, `validé` par le porteur le
2026-10-25 (second tour, V3 accordé). La mesure du mesureur (2026-10-25, db3e25230) en tient lieu
de re-vérification ; elle a été rejouée sur cet arbre par les tests de garde ci-dessous, rouges
avant correctif.

- `DataExportBuilder::payloads` (archive du droit d'accès) prenait les réservations par
  `created_by_id`, les encaissements par `collector_id` et les pièces par `uploaded_by`, et les
  sérialisait par `toArray()` entier : l'archive d'un agent, actif ou retiré, contenait le client,
  le payeur, les notes et les pièces des clients qu'il avait saisis (P247.01).
- `leases.json` rendait `commission_amount`, que `LeaseResource` retire à qui n'est pas du personnel
  (P247.02).
- `documents.json` ne contenait pas les pièces posées par un autre sur la fiche client ou le bail du
  titulaire (P247.03).
- `ExportDataService::scopeToActor` bornait l'export du locataire à **une** fiche client prise par
  `->first()` sans ordre : un locataire de deux agences n'exportait les baux et paiements que de
  l'une (P250.01).

Précédent : TCK-1017 — une ligne dont le titulaire n'est que le causeur décrit un tiers, et l'archive
n'en rend que l'acte.

## Décision du porteur

- **P247.01** :
  > validation du porteur (2026-10-25) : pour une ligne dont le titulaire n'est que l'auteur ou l'encaisseur, l'archive ne rend que l'acte (identifiant, type, date, montant), sans client, payeur, notes, metadata ni nom de pièce, comme TCK-1017 ; `messages.json` reste tel que TCK-592 l'a décidé
- **P247.02** :
  > validation du porteur (2026-10-25) : le bail de l'archive du locataire et du bailleur porte les mêmes colonnes que `LeaseResource` pour un lecteur hors personnel : sans `commission_amount`
- **P247.03** :
  > validation du porteur (2026-10-25) : l'archive du titulaire ajoute en métadonnées (type, nom, date), sans le fichier, les pièces de ses fiches client liées et de ses baux de locataire
- **P250.01** :
  > validation du porteur (2026-10-25) : l'export du locataire prend toutes les fiches client du compte, comme `DashboardTenantService`

## Objectif

L'archive du droit d'accès rend chaque ligne selon le lien du titulaire avec elle (partie, ou seul
auteur), sans terme de commission ; elle porte les pièces qui le décrivent ; l'export CSV du
locataire couvre toutes ses agences.

## Delta à produire

- [x] `DataExportBuilder` : `bookings.json` et `payments.json.lease_payments` rendent la ligne
      entière au client, au payeur et au bailleur (`BailleurDuBien`) du bien ou du bail, l'acte seul
      à qui n'en est que l'auteur ou l'encaisseur.
- [x] `DataExportBuilder` : `leases.json` sans `commission_amount`.
- [x] `DataExportBuilder::documents()` : trois formes — entière, métadonnées, acte — selon le
      porteur et l'auteur de la pièce.
- [x] `ExportDataService::scopeToActor` : branche du locataire par `whereIn` sur toutes ses fiches.
- [x] Amendement du 2026-10-25 d'ADR-0070, et sa ligne de `docs/adr/README.md`.
- [x] `tests/Feature/Privacy/ArchiveDuTitulaireTest.php`,
      `ExportScopingTest::test_a_tenant_of_two_agencies_exports_the_leases_and_payments_of_both`.

## Critères d'acceptation

- [x] AC1 (P247.01) — Agent actif, puis retiré : son archive ne contient ni « Moussa » ni « Fatou »
      dans les réservations, encaissements et pièces ; la réservation porte exactement `id`,
      `total_amount`, `currency`, `created_at` ; l'encaissement `id`, `amount`, `currency`,
      `payment_type`, `paid_at` ; la CNI et le contrat `id`, `type`, `created_at`. La pièce posée
      sur son propre profil d'agent garde son nom.
- [x] AC2 (P247.01) — Le client et le locataire gardent ces lignes entières (`notes`,
      `customer_id`, `payer_id`). Le bailleur qui saisit la réservation de son bien ou encaisse le
      loyer de son bail les garde entières aussi.
- [x] AC3 (P247.02) — `leases.json` du locataire et du bailleur : pas de `commission_amount` ;
      `commission_rate` et `agent_id` présents, comme `LeaseResource` hors personnel.
- [x] AC4 (P247.03) — L'archive du locataire porte la CNI de sa fiche et le contrat de son bail,
      déposés par l'agent, avec exactement `id`, `type`, `name`, `created_at` ; la pièce d'une autre
      fiche n'y est pas.
- [x] AC5 (P250.01) — Locataire lié à deux fiches dans deux agences : l'export des paiements porte
      les deux montants (et aucun d'autrui), celui des baux deux lignes.

## Hypothèses (choix non tranchés par la décision, pris au plus conservateur)

- **« N'est que l'auteur »** : le titulaire est partie à la ligne quand il en est le client ou le
  payeur, ou le bailleur (`BailleurDuBien`) du bien de la réservation ou du bail de l'encaissement.
  Le particulier qui saisit une réservation sur son propre bien garde donc la ligne entière.
- **Une pièce le décrit** quand son porteur est son compte, un de ses profils (supprimés compris),
  une de ses fiches client, un bail de son archive, un bien dont il est le bailleur, une
  intervention qu'il a demandée ou une demande de passage qu'il a déposée. Une pièce qu'il a
  déposée sur un tel porteur reste entière, comme avant ; sur un autre (fiche d'autrui, bail
  d'autrui, caution, profil d'autrui…), l'acte seul.
- **« Type » de l'acte** : `payment_type` pour l'encaissement, `type` pour la pièce. La réservation
  n'a pas de colonne de type : son acte n'en porte pas. **« Montant »** porte sa devise. **« Date »**
  : `created_at` pour la réservation et la pièce, `paid_at` pour l'encaissement.
- **P247.02** : « les mêmes colonnes que `LeaseResource` » est lu par sa précision, « sans
  `commission_amount` » : seule cette colonne sort. Les colonnes de la ligne que `LeaseResource`
  ne rend pas (`terms`, `special_conditions`, `guarantor_id`, `metadata`…) restent dans l'archive,
  qui est le droit d'accès entier.
- **P247.03** : seules les pièces des fiches client et des baux **de locataire** entrent ; celles
  des baux dont il est le bailleur, posées par un autre, n'y entrent pas (la décision ne les nomme
  pas). L'identifiant de la pièce accompagne type, nom et date.
- **P250.01** : la branche `customer` du locataire (refusée en amont par la policy d'export) suit
  la même règle, toutes ses fiches.

## Hors périmètre

- `messages.json`, laissé tel que TCK-592 l'a décidé (P247.01).

## Notes d'implémentation

- Rouges avant correctif (2026-10-25) : AC1 (« Moussa » dans `bookings.json`, actif et retiré),
  AC3 (`commission_amount` présent), AC4 (CNI absente), AC5 (montant de B absent).
- Piège : `AgencyMemberRemovalService::remove` supprime (soft delete) le profil d'agent. Lus sans
  `withTrashed()`, les profils du retiré ne le « décrivaient » plus, et la pièce de son propre
  profil tombait à l'acte. Le cas « agent retiré » d'AC1 le garde.
- Ablations : voir le rapport du lot (`ArchiveDuTitulaireTest`, `ExportScopingTest`).
