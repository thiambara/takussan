---
id: TCK-063
title: "Paiements — Frontend historique, factures, payouts"
status: review
phase: P1
family: front
estimate: M
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-028, TCK-057, TCK-054, TCK-055]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features-by-actor.md
  models:
    - docs/models-spec.md#15-invoice
    - docs/models-spec.md#16-payout
    - docs/models-spec.md#13-booking-payment
    - docs/models-spec.md#14-lease-payment
tags: [payments, invoice, payout, front, dashboard]
---

## Contexte

Le backend Transactions & Paiements (TCK-028) est `review` : `PaymentController`, `InvoiceController`, `PayoutController`, enregistrement paiements, factures, reversements bailleurs, historique. Le frontend expose uniquement `src/app/(dashboard)/app/payments/page.tsx` en stub. Aucune UI pour consulter l'historique, générer une facture ou un payout.

## Objectif utilisateur

Un admin ou bailleur doit pouvoir consulter l'ensemble des paiements (réservation + bail) avec leur statut, générer une facture à un Customer, et déclencher un reversement (payout) vers un bailleur après commission.

## Contrat de données

Endpoints à consommer (existants, TCK-028) :

- `GET /api/payments/history` — vue unifiée booking_payments + lease_payments (filter[status], filter[type], filter[property_id], filter[customer_id], sort=-paid_at)
- `POST /api/payments` — enregistrer un paiement manuel
- `GET /api/invoices`, `POST /api/invoices`, `GET /api/invoices/{id}` — CRUD factures
- `GET /api/payouts`, `POST /api/payouts`, `PATCH /api/payouts/{id}` — CRUD reversements
- `GET /api/invoices/{id}/pdf` (si exposé) ou `GET /api/documents/{id}` pour le PDF attaché

Sparse fieldsets : `fields[payments]=id,type,amount,status,paid_at,method,reference`.

## Direction UX / Artistique

Tableau financier dense, à la Stripe Dashboard / Pennylane. Ligne = paiement ; colonnes compactes avec statut coloré (pending / paid / refunded / failed). Filtres persistés en URL. Onglets : Historique · Factures · Payouts. Pas de décoration inutile ; le chiffre parle.

## Contraintes strictes (métier)

- Seuls `admin`, `agency_admin`, `super_admin` voient tous les paiements ; `owner` voit uniquement ceux liés à ses biens ; `agent` voit ceux de son portefeuille (policies backend déjà en place).
- Montants formatés via `formatCurrency` (XOF par défaut, §2.8).
- Les transitions de statut restent protégées backend — la UI ne propose que les actions légales pour l'utilisateur courant.
- Export CSV/PDF depuis cette vue utilise les endpoints de TCK-032 (`/api/exports/*`).

## Delta à produire

- [ ] Page `/app/payments` avec 3 onglets : Historique · Factures · Payouts
- [ ] Table historique filtrable (statut, type, bien, période), URL-synced
- [ ] Formulaire "Générer une facture" : sélection Customer + items + échéance + lien vers bail ou réservation
- [ ] Formulaire "Créer un payout" : bailleur, période, montant net (commission calculée), paiement lié
- [ ] Détail facture/payout avec timeline de statut + bouton télécharger PDF si dispo
- [ ] Intégration lien vers `/app/payments?property={id}` depuis fiche bien et fiche bail
- [ ] Tests Vitest : rendu table, formulaire facture, calcul commission payout

## Critères d'acceptation

- [ ] AC1 — Un admin voit l'historique complet paginé, filtrable par statut et type, avec filtres persistés dans l'URL
- [ ] AC2 — Un owner ne voit que les paiements liés à ses biens (vérification via mock API)
- [ ] AC3 — Le formulaire "Générer facture" valide les champs requis, affiche les erreurs 422 mappées, et redirige vers le détail après succès
- [ ] AC4 — Le formulaire "Créer payout" calcule automatiquement le montant net après commission et bloque le submit si montant ≤ 0
- [ ] AC5 — Les montants s'affichent avec `formatCurrency` (XOF par défaut), le statut avec une pastille colorée cohérente avec le design system
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Passerelle de paiement Wave/Orange/Stripe (P2, ticket séparé)
- Rapprochement bancaire automatique (P2)
- Relances automatiques factures en retard (P2 — partiellement backend TCK-028)

## Notes d'implémentation

- **PR** : https://github.com/thiambara/takussan/pull/43 (groupe V4-C — avec TCK-062).
- **Page** `src/app/(dashboard)/app/payments/page.tsx` — stub remplacé, délègue à `<PaymentsTabs>`.
- **Composants** `src/components/payments/` :
  - `PaymentsTabs` — 3 onglets Historique / Factures / Payouts, onglet courant persisté en URL (`?tab=...`), toolbar "Générer facture" / "Créer reversement".
  - `PaymentsHistoryTable` — table dense, statuts colorés via Badge, montants via `formatCurrency` (XOF par défaut §2.8), lien vers Bail/Réservation, totaux depuis `meta.totals`, mention "plafond" si `meta.truncated`.
  - `PaymentsHistoryFilters` — statut, type d'entité, ID entité, plage de dates ; tout persisté en URL (AC1).
  - `InvoicesTable` / `PayoutsTable` — tables compactes avec transition vers `InvoiceDetailDialog` / `PayoutDetailDialog`.
  - `CreateInvoiceDialog` — formulaire RHF+Zod avec `useFieldArray` pour les lignes, calcul sous-total → TVA → total en live, envoie `subtotal` au backend (conforme à `InvoiceController::store`).
  - `CreatePayoutDialog` — commission auto-calculée depuis `commission_rate` × gross, montant net affiché en live, bloque submit si net ≤ 0 (AC4).
  - `InvoiceDetailDialog` / `PayoutDetailDialog` — timeline statut + boutons d'action contextuels (send / mark-paid / mark-processed / cancel), respecte les transitions légales côté backend.
- **Hooks** `src/lib/queries/payments.ts` — `usePaymentsHistory`, `useInvoices`/`useInvoice`/`useCreateInvoice`/`useInvoiceSend`/`useInvoiceMarkPaid`/`useInvoiceCancel`, `usePayouts`/`usePayout`/`useCreatePayout`/`usePayoutMarkProcessed`/`usePayoutMarkFailed`/`usePayoutCancel`. Sparse fieldsets + filtres spatie systématiques.
- **Types** `src/types/invoice.ts` — `Invoice`, `Payout`, `PaymentHistoryRow`, `PaymentHistoryTotals`, statuts typés.
- **Schémas** `src/lib/schemas/payment.ts` — `createInvoiceSchema` (items, due ≥ issue, invoiceable pair), `createPayoutSchema` (net > 0, période cohérente).
- **Constantes** `src/components/payments/constants.ts` — labels FR + variants Badge pour 3 familles de statuts + helpers `computePayoutNet` / `commissionFromRate` (testés).
- **Tests** : `src/components/payments/__tests__/constants.test.ts` + `src/lib/schemas/__tests__/payment.test.ts`. Tous verts.
- **Hors périmètre** : passerelles Wave/Orange/Stripe, rapprochement bancaire, relances auto.
