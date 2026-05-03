---
id: TCK-134
title: "/admin/finances — Vue comptable de l'agence (revenus, payouts, factures)"
status: todo
phase: P1
family: front
estimate: L
created: 2026-05-02
updated: 2026-05-03
depends_on: [TCK-141]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#25-reporting--tableaux-de-bord
  models:
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#28-payout-
tags: [front, admin, finances, payments, p1]
---

## Objectif utilisateur

Un agency_admin accède à `/admin/finances` pour visualiser la situation comptable de **son agence courante (profil actif)** : encaissements, factures émises, reversements aux bailleurs, impayés en cours, sans page « En cours de développement ».

## Impact TCK-138 → TCK-146

- **Profil actif comme contexte** : l'agence visualisée n'est plus dérivée de `users.agency_id` (colonne supprimée TCK-142) mais du **profil actif** résolu par `ResolveActiveProfile` (TCK-141). Le `team_id` spatie est posé automatiquement — aucun `agency_id` n'a besoin d'être passé en filtre côté client (l'API scope déjà). Si un filtre `agency_id` reste utile pour cohérence avec d'autres pages, il peut être passé mais doit matcher le profil actif.
- **Super_admin** : un super_admin sans profil actif (cas par défaut des admins purs) **ne doit pas atterrir ici**. La vue plateforme cross-tenant existe sous `/super-admin/system` (KPIs) et `/super-admin/audit` (TCK-145, endpoints `/api/admin/system/metrics` et `/api/admin/audit` livrés par TCK-144). Si un super_admin a basculé sur un profil agence (Owner/Agent), il voit les finances de cette agence comme un agency_admin — pas de mode "dual".
- **Détection super_admin** : via `roles` array (probe `team_id=null` côté backend = `User::isSuperAdmin()`). Ne **jamais** dériver depuis le profil actif.
- **`NoAgencyState`** : déclenché si `request().activeProfile()` est `null` ET le user n'a pas de rôle global → afficher l'état dégradé. Pour un super_admin sans profil, rediriger vers `/super-admin` plutôt qu'afficher `NoAgencyState` (cohérence TCK-145).

## Contrat de données

Endpoints existants côté backend (livrés en Vagues 4-9 : LeasePayments, BookingPayments, Invoices, Payouts) :
- `GET /api/lease-payments?include=lease,tenant`
- `GET /api/booking-payments`
- `GET /api/invoices`
- `GET /api/payouts?include=landlord`

Le scope est imposé par le `team_id` du profil actif (TCK-141). Frontend obligatoire : `filter[]`, `include=`, `fields[]`, `sort=` (conventions Spatie). Agréger via plusieurs requêtes parallèles ; ne **pas** créer un nouvel endpoint d'agrégat sans ticket backend dédié.

## Direction UX / Artistique

- Tonalité **back-office comptable** : sobre, structuré, dense en chiffres.
- Bandeau supérieur : 4 KPIs (encaissements du mois, impayés en cours, reversements en attente, factures à émettre).
- Onglets ou sections : *Encaissements* / *Factures* / *Reversements* / *Impayés* — chacun avec sa table filtrable.
- Tables avec tri/pagination ; actions inline (marquer payé, générer facture, lancer reversement) si exposées par le backend.
- Cohérent avec le style des autres pages admin (table dense, filtres au-dessus).
- Aucun StubPlaceholder.

## Contraintes strictes (métier)

- Permissions strictes : `payments.view_in_agency`, `invoices.view_in_agency`, `payouts.view_in_agency`. Sans permission → état dégradé.
- Toujours scopé via le **profil actif** ; un user sans profil agence-scoped (et sans rôle global) → `NoAgencyState`. Un super_admin sans profil → redirect vers `/super-admin` (pas de leak des finances cross-tenant ici).
- Aucun montant n'est calculé côté frontend à partir de listes paginées : les KPIs viennent soit d'un endpoint dédié, soit d'agrégats déjà retournés par l'API (pas de somme JS sur une page de résultats).
- Devises : afficher la devise de l'agence (`Agency.currency`) résolue depuis le profil actif, pas de conversion silencieuse.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/finances/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composants `FinanceKpiTile`, `PaymentsTable`, `InvoicesTable`, `PayoutsTable`, `OverdueTable`
- [ ] Hooks React Query par section (parallèles, indépendants)
- [ ] Filtres communs (période, statut, bien/bail, contrepartie)
- [ ] États vides explicites par section
- [ ] Tests UI : permissions, super_admin sans agence, scope agence

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] Les 4 KPIs affichent des chiffres réels (ou `—` pendant le chargement)
- [ ] Les 4 sections (encaissements/factures/reversements/impayés) listent les enregistrements de l'**agence du profil actif**
- [ ] Un user sans profil agence-scoped et sans rôle global voit `NoAgencyState`
- [ ] Un super_admin sans profil actif est redirigé vers `/super-admin` (pas de `NoAgencyState`)
- [ ] Un user sans permission finance voit un état dégradé clair
- [ ] Aucune donnée d'autre agence n'est visible dans les listes (scope imposé par `team_id` du profil actif)
- [ ] Bascule de profil (TCK-143) : la page se reactualise et reflète l'agence du nouveau profil sans rechargement
- [ ] Toutes les requêtes utilisent sparse fieldsets et pagination

## Hors périmètre

- Création de facture / déclenchement de payout (formulaires existent ailleurs ou sont des tickets backend)
- Graphiques temporels avancés (P2 dédié)
- Rapprochement bancaire (TCK-109)
- Export comptable FEC (P3)
- Endpoint d'agrégat dédié (ouvrir un ticket backend si nécessaire)

## Notes d'implémentation

_(à remplir par implementing-specs)_
