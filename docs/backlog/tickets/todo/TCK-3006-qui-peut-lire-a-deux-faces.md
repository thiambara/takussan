---
id: TCK-3006
title: "« Qui peut lire » à deux faces : un module par modèle pour la liste et la fiche, un test de parité, et trois divergences corrigées (caution, état des lieux, visite)"
status: todo
phase: P2
family: back
estimate: L
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: [TCK-3005, TCK-3007]
blocks: [TCK-3011]
spec_refs:
  features: []
  models: []
tags: [back, autorisation, agence, lecture, architecture, adr-0138]
---

## Objectif utilisateur

Ce qu'un membre d'une agence voit dans une liste est exactement ce qu'il peut ouvrir en fiche, ni plus ni moins.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7). La règle de lecture est écrite deux fois, en SQL pour la liste et en PHP dans `XPolicy::view` (inventaire complet dans [ADR-0138](../../../adr/0138-qui-peut-lire-s-ecrit-une-fois-pour-la-liste-et-la-fiche.md) § Contexte). Divergences vérifiées :

1. **Caution** : `GuarantorController::index:28` (`where('added_by_id', …)`) contre `GuarantorPolicy::view:31-33` (auteur ∨ personnel). L'auteur garde aussi la fiche sans condition « encore membre ».
2. **État des lieux** : `Inventory::property()` sans `withTrashed` → `InventoryPolicy::view:34` appelle `auteurEncoreMembre(…, null)`, vrai sans appartenance (`BasePolicy.php:162`) ; la liste (`InventoryController.php:56`) écarte par `whereHas('property')`.
3. **Visite** : même défaut dans `PropertyVisitPolicy::view:46-47` contre `VisitesLisibles`.

Formes actuelles : scope (Lease:178, Customer:467, MaintenanceRequest:329), module (`VisitesLisibles`), contrôleur (Invoice :25-38, Payout :31-45, Booking `visibleTo` :107, Inventory :49-71, Task, Guarantor).

## Contraintes strictes (métier)

- ADR-0138 : un module `<Modèle>Lisibles` par modèle, deux faces écrites côte à côte (`restreindre(Builder, User)`, `peut(User, Model)`), `XPolicy::view` délègue, `index()` applique `restreindre` en base de `buildQuery` (ADR-0006).
- L'agence est celle du profil actif (`staffAgencyId()`), sauf exception écrite (Task, ADR-0035).
- Un parent supprimé en douceur se juge sur son agence (`withTrashed`).
- Les jugements préchargés (`MembershipCapabilityResolver::primed`) restent possibles : `peut()` ne fait pas de requête par ligne quand l'amorce est posée.
- `scripts/check-agency-scope-clause.mjs` reste vert (pas de comparaison `agency_id` brute).

## Delta à produire

- [ ] Services : `app/Services/Lecture/{Inventaires,Cautions,Factures,Reversements,Reservations,Taches,Baux,Clients,Interventions}Lisibles.php` ; `app/Services/Visit/VisitesLisibles.php` reçoit sa face `peut()`
- [ ] Policies `view` des modèles migrés : délèguent au module
- [ ] Contrôleurs `index` et scopes `visibleTo` : passent par `restreindre` (les scopes restent comme raccourcis qui appellent le module, ou disparaissent si plus aucun appelant)
- [ ] Corrections des trois divergences (caution, état des lieux, visite)
- [ ] Test : `tests/Feature/Lecture/ListeEtFicheParityTest.php` (jeu d'acteurs, deux sens, tous les modèles migrés)

## Critères d'acceptation

- [ ] AC1 — Le personnel actif voit dans `GET /api/guarantors` les cautions de son agence ajoutées par un collègue ; un auteur parti ne voit plus ni la liste ni la fiche.
- [ ] AC2 — Un agent parti de l'agence n'ouvre plus un état des lieux ni une visite dont le bien est supprimé en douceur ; le personnel actif les voit en liste et en fiche.
- [ ] AC3 — Le test de parité couvre les dix modèles et échoue si l'on retire une branche d'une seule face (ablation rejouée sur au moins deux modèles).
- [ ] AC4 — Plus aucun commentaire « comme `XPolicy::view` » ne tient seul une règle dupliquée.

## Hors périmètre

- Les règles d'écriture (`update`, `delete`) ; Document (ADR-0099) et CommissionEntry (sans `show`).

## Notes d'implémentation
