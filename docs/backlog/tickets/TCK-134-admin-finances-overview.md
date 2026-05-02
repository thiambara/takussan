---
id: TCK-134
title: "/admin/finances — Vue comptable de l'agence (revenus, payouts, factures)"
status: todo
phase: P1
family: front
estimate: L
created: 2026-05-02
updated: 2026-05-02
depends_on: []
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

Un agency_admin (ou super_admin) accède à `/admin/finances` pour visualiser la situation comptable de l'agence : encaissements, factures émises, reversements aux bailleurs, impayés en cours, sans page « En cours de développement ».

## Contrat de données

Endpoints existants côté backend (livrés en Vagues 4-9 : LeasePayments, BookingPayments, Invoices, Payouts) :
- `GET /api/lease-payments?filter[agency_id]=...&include=lease,tenant`
- `GET /api/booking-payments?filter[agency_id]=...`
- `GET /api/invoices?filter[agency_id]=...`
- `GET /api/payouts?filter[agency_id]=...&include=landlord`

Le frontend doit utiliser `filter[]`, `include=`, `fields[]`, `sort=` (conventions Spatie). Agréger via plusieurs requêtes parallèles ; ne **pas** créer un nouvel endpoint d'agrégat sans ticket backend dédié.

## Direction UX / Artistique

- Tonalité **back-office comptable** : sobre, structuré, dense en chiffres.
- Bandeau supérieur : 4 KPIs (encaissements du mois, impayés en cours, reversements en attente, factures à émettre).
- Onglets ou sections : *Encaissements* / *Factures* / *Reversements* / *Impayés* — chacun avec sa table filtrable.
- Tables avec tri/pagination ; actions inline (marquer payé, générer facture, lancer reversement) si exposées par le backend.
- Cohérent avec le style des autres pages admin (table dense, filtres au-dessus).
- Aucun StubPlaceholder.

## Contraintes strictes (métier)

- Permissions strictes : `payments.view_in_agency`, `invoices.view_in_agency`, `payouts.view_in_agency`. Sans permission → état dégradé.
- Toujours scopé à l'agence courante ; super_admin sans agence → `NoAgencyState`.
- Aucun montant n'est calculé côté frontend à partir de listes paginées : les KPIs viennent soit d'un endpoint dédié, soit d'agrégats déjà retournés par l'API (pas de somme JS sur une page de résultats).
- Devises : afficher la devise de l'agence (`Agency.currency`), pas de conversion silencieuse.

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
- [ ] Les 4 sections (encaissements/factures/reversements/impayés) listent les enregistrements de l'agence courante
- [ ] Un super_admin sans `agency_id` voit `NoAgencyState`
- [ ] Un user sans permission finance voit un état dégradé clair
- [ ] Aucune donnée d'autre agence n'est visible dans les listes
- [ ] Toutes les requêtes utilisent sparse fieldsets et pagination

## Hors périmètre

- Création de facture / déclenchement de payout (formulaires existent ailleurs ou sont des tickets backend)
- Graphiques temporels avancés (P2 dédié)
- Rapprochement bancaire (TCK-109)
- Export comptable FEC (P3)
- Endpoint d'agrégat dédié (ouvrir un ticket backend si nécessaire)

## Notes d'implémentation

_(à remplir par implementing-specs)_
