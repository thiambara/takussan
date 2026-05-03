---
id: TCK-134
title: "/admin/finances — Vue comptable de l'agence (revenus, payouts, factures)"
status: done
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

- **Pas de nouveau proxy** : `/admin/finances` réutilise les hooks
  `useInvoices`, `usePayouts`, `usePaymentsHistory` (`src/lib/queries/payments.ts`,
  TCK-063). Ces hooks passent par `apiRequest` qui appelle directement le
  backend avec le bearer token de l'`AuthContext` — l'agence visible est
  scoppée côté API par `$user->agency_id` (devenu accessor TCK-141/142
  qui lit le profil actif).
- **KPIs sans somme client** : 4 tuiles, 2 sources :
  1. `revenue_month`, `overdue_amount`, `overdue_count` viennent de
     `/api/dashboard/agency` (déjà existant, voir
     `src/lib/queries/dashboard-agency.ts`).
  2. `pending_payouts_count` et `draft_invoices_count` sont obtenus en
     interrogeant `/api/payouts?filter[status]=pending&per_page=1` et
     `/api/invoices?filter[status]=draft&per_page=1` puis en lisant
     `meta.total` (la page de données est ignorée — `per_page=1` la
     borne au minimum). Aucune somme JS n'est faite côté frontend
     (cf. AC "Aucun montant n'est calculé côté frontend").
- **4 onglets, pas 3** : on étend la composition de TCK-063
  (`PaymentsTabs` → 3 onglets) en ajoutant un 4ᵉ onglet "Impayés"
  alimenté par `OverduePaymentsTable` qui hard-pin
  `filter[status]=late` sur `/api/payments/history`. La table est
  read-only — l'action "marquer payé" reste sur les pages de détail
  bail/réservation (cf. "Hors périmètre"). Le `PaymentsTabs` du
  user-facing `/app/payments` (TCK-063) n'est **pas** modifié — les
  deux pages cohabitent avec leur propre composition d'onglets.
- **Bascule de profil → invalidation locale** : `useSwitchActiveProfile`
  (TCK-143) n'invalide aujourd'hui que `['auth', 'me']` et
  `['me', 'profiles']`. Pour AC8, `AdminFinancesClient` watch
  `active_profile_id` et invalide localement les caches
  `['payments']`, `['invoices']`, `['payouts']`,
  `['admin-finances']`, `['dashboard-agency']` à chaque changement.
  Choix scopé volontairement à la page : élargir l'invalidation au
  niveau de `useSwitchActiveProfile` aurait été cross-cutting et
  hors périmètre TCK-134 — à filer comme amélioration séparée si
  d'autres pages agence-scopées (CRM, baux, propriétés) en ont besoin.
- **Permission gate sur le client** : aujourd'hui, la matrice
  `agency_admin/admin/super_admin → permissions finance` est dérivée
  via `isAdmin(roles)` côté `page.tsx`. Le composant client porte un
  flag `canViewFinances` pour préserver la possibilité de durcir le
  contrôle (lecture des permissions spatie côté `/auth/me`) sans
  refondre le composant. État dégradé visible si flag faux.
- **Super_admin sans agence → `/super-admin`** : redirect côté serveur
  via `redirect()` dans `page.tsx`. Cohérent avec `/admin/properties`
  qui fait pareil (TCK-145).
- **Tests (8 verts)** :
  - `src/lib/queries/__tests__/admin-finances.test.tsx` — pin sparse
    fields + filter status + per_page=1 + absence agency_id.
  - `src/components/admin/finances/__tests__/OverduePaymentsTable.test.tsx`
    — hardcoded `filter[status]=late`, empty state, ligne late
    rendering.
  - `src/app/(dashboard)/admin/finances/__tests__/AdminFinancesClient.test.tsx`
    — degraded state, mount KPIs+tabs, hide actions sans `canEmit`.
- **Échecs vitesse pré-existants** : 9 tests
  (`RecentlyViewedCarousel.test.tsx` + `PropertyVisitDialog.test.tsx`)
  liés à `@testing-library/user-event` `namespaceURI` issue, présents
  sur `dev` tip — non régressés.
- **Vérification UI navigateur non effectuée** : type-check passe
  (baseline 18 erreurs pré-existantes, identique à `dev`),
  lint clean, tests verts. Walk-through manuel à faire en review
  avec un agency_admin (4 tuiles + 4 onglets + drawer factures + drawer
  payouts + bascule de profil sans rechargement).
