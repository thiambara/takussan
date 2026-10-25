---
id: TCK-2377
title: "Le seed suit le parcours d'un client — visite, réservation, bail, échéances, sortie — au lieu de tirer chaque table au hasard"
status: todo
phase: P2
family: technique
estimate: L
wave: null
created: 2026-10-25
updated: 2026-10-25
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

- [ ] Service de seed `Database\Seeders\Support\Parcours` (ou équivalent) qui, par client, enchaîne
      visites → réservation éventuelle → bail éventuel sur un bien **libre** à cette date.
- [ ] `LeaseSeeder` / `LeasePaymentSeeder` réécrits sur ce parcours : loyer tiré autour du `price`
      du bien, garant rattaché par `lease_guarantor` sur une part des baux, impayés qui se
      régularisent, se relancent ou mènent à une résiliation.
- [ ] `PropertySeeder` : statut final dérivé des baux et des ventes.
- [ ] `CustomerSeeder` : stade CRM dérivé de l'activité semée.
- [ ] `ReviewSeeder`, `MaintenanceRequestSeeder`, `InventorySeeder` : auteur, bien et pièces
      cohérents (contraintes ci-dessus).
- [ ] `SeedingInvariantsTest` (TCK-2376) étendu à chaque contrainte de ce ticket.

## Critères d'acceptation

- [ ] AC1 — Zéro bien à ≥ 2 baux actifs qui se chevauchent.
- [ ] AC2 — Zéro visite, réservation ou bail daté avant la création de son bien.
- [ ] AC3 — Zéro bail `expired` à fin future, zéro `active` à fin passée ; chaque `renewed` a un
      successeur.
- [ ] AC4 — Chaque locataire d'un bail actif est `converted` ; aucun `lead` n'a de bail.
- [ ] AC5 — Zéro avis dont l'auteur est agent, admin d'agence ou bailleur du bien.
- [ ] AC6 — Zéro impayé de plus de 90 jours sur un bail encore `active` sans relance ni
      résiliation ; au moins un impayé régularisé en retard existe.
- [ ] AC7 — Au moins 20 % des baux signés ont un garant dans `lease_guarantor`.
- [ ] AC8 — Ablation : chaque AC est rouge quand on rétablit le tirage indépendant correspondant.

## Hors périmètre

- La courbe de croissance des agences et des équipes : TCK-2378.
- Les tables des fonctionnalités vides (signatures, commissions…) : TCK-2379.
- Le texte des messages, tâches et avis : TCK-2380.

## Notes d'implémentation

_(à remplir par implementing-specs)_
