---
id: TCK-084
title: "Devise configurable par agence (XOF / EUR / USD)"
status: done
phase: P2
family: applicatif
estimate: M
wave: 11
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-015, TCK-017, TCK-064]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#29-administration--configuration
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#3-property
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#28-payout-
tags: [back, front, i18n, currency, agency]
---

## Objectif utilisateur

Permettre à l'admin d'agence de choisir la devise par défaut de son agence
(XOF, EUR, USD) et voir tous les montants (prix bien, loyer, paiement, facture,
payout) s'afficher avec la devise et le format local (séparateurs, symbole,
position). Un locataire voyant un bien affiche la devise de l'agence
propriétaire du bien — pas de conversion (P3).

## Contrat de données

**Backend — Migrations additives** :

- `add_currency_to_agencies_table` : `currency char(3) not null default 'XOF'`
- **Pas** d'ajout sur Property/Booking/Lease/Invoice — la devise est dérivée de
  l'agence (via `property.agency_id` ou `booking.property.agency_id`…). Si le
  métier demande une devise par entité (rare), ticket séparé.

**Enum** `Currency` (XOF, EUR, USD) avec métadonnées :
- symbol (F CFA, €, $)
- decimal_places (0 pour XOF, 2 pour EUR/USD)
- locale de formatage (fr_SN, fr_FR, en_US)

**Endpoints** :

- `GET /api/agencies/{id}` — retourne `currency` dans la resource (déjà exposée
  via include ou fieldset).
- `PATCH /api/agencies/{id}` body `{ currency }` — ability `update` existante
  suffit ; admin agence uniquement.

**Frontend** :
- Helper `formatCurrency(amount, currency)` centralisé (à placer dans
  `src/lib/format/currency.ts`) qui remplace toute occurrence inline de
  formatage monétaire (le cleanup dette TCK-078 flagge déjà ce besoin).
- Hook `useAgencyCurrency(agencyId)` renvoie `{ currency, symbol, formatter }`.
- Composant `Money` : `<Money value={loyer} agencyId={property.agency_id} />`
  ou `<Money value={loyer} currency="XOF" />`.

## Direction UX / Artistique

**Cohérence visuelle** : le même bien affiche la même devise partout (liste
résultats, fiche bien, dashboard agent, réservation, facture, PDF). Jamais de
montant sans devise à côté.

**Format** :
- XOF : `150 000 F CFA` (espace insécable entre chiffres, symbole après)
- EUR : `150 000,00 €` (virgule décimale, symbole après)
- USD : `$150,000.00` (virgule séparateur, symbole avant)

**Settings agence UI** (déjà couvert par TCK-064) : ajouter un `<Select>`
"Devise" avec les 3 options + preview inline "100 000 sera affiché : {format}".

**Public / découverte** : si un visiteur parcourt des biens de différentes
agences (donc différentes devises), chaque `PropertyCard` affiche SA devise
(pas de conversion côté client). Un micro-label "EUR" / "USD" apparaît à côté
du prix pour éviter toute confusion.

## Contraintes strictes (métier)

- **Aucune conversion de taux en V1** — si une agence en EUR loue un bien, le
  loyer reste en EUR pour tout le cycle de vie (booking, paiement, facture,
  payout). Conversion auto = P3 (ticket séparé).
- **Change de devise post-création** : si une agence modifie sa `currency`,
  **les biens/baux/paiements déjà créés ne sont pas recalculés**. Nouveau
  comportement s'applique uniquement aux entités futures. Afficher un warning
  explicite à l'admin dans la modal de changement.
- **Format côté serveur** : le backend continue de stocker en smallest unit
  (centimes pour EUR/USD, unités pour XOF). Les helpers front gèrent le
  rendu. Si le champ est `decimal(10,2)`, continuer à stocker la valeur
  décimale ; la locale gère l'affichage.
- **Arrondi XOF** : XOF n'a pas de subdivision ; les totaux calculés (prorata
  de loyer…) sont arrondis à l'entier. Laisser `round(…)` dans les services
  quand la devise `currency = XOF`.
- **PDF** : les templates Blade livrés par TCK-077 doivent accepter la devise
  en param et utiliser `formatCurrency` côté backend (helper Blade équivalent
  `@currency($amount, $currency)`).
- **Default** : toute nouvelle agence créée sans `currency` explicite prend
  `XOF` (cohérent avec l'hypothèse Sénégal-first).

## Delta à produire

- [ ] Migration `add_currency_to_agencies_table` (char(3), default XOF)
- [ ] Enum `App\Models\Enums\Currency` (XOF, EUR, USD)
- [ ] Helper Blade `@currency($amount, $currency)` via `Blade::directive`
- [ ] Service `App\Services\Formatting\CurrencyFormatter` (format / parse)
- [ ] Mise à jour `AgencyResource` pour exposer `currency`
- [ ] Mise à jour `AgencyRequest` (FormRequest update) pour valider `in:XOF,EUR,USD`
- [ ] Mise à jour templates Blade `pdf/invoices/default`, `pdf/leases/contract`, `pdf/receipts/rent` : utiliser `@currency`
- [ ] Tests `CurrencyFormatterTest` (3 devises × format + parse)
- [ ] Tests `AgencyCurrencyUpdateTest` (admin peut changer, agent ne peut pas)
- [ ] Tests de régression PDF : confirmer que les 3 templates rendent correctement pour chaque devise
- [ ] Frontend helper `src/lib/format/currency.ts` — `formatCurrency(amount, currency, locale?)`
- [ ] Frontend composant `<Money>` avec props `value` + (`currency` | `agencyId`)
- [ ] Hook `useAgencyCurrency(agencyId)`
- [ ] Refactor systématique des formats monétaires inline (listés par le cleanup TCK-078 — `grep -rE "F CFA|XOF|₣" takussan-web/src`)
- [ ] Select devise dans UI Settings agence (complément à TCK-064)
- [ ] i18n fr/en/wo (`agency.currency.*`)
- [ ] Tests Vitest `formatCurrency` + `<Money>`

## Critères d'acceptation

- [ ] AC1 — migration ajoute `currency` avec default XOF ; les agences existantes ont `XOF` après migrate
- [ ] AC2 — `GET /agencies/{id}` renvoie `"currency": "XOF"`
- [ ] AC3 — `PATCH /agencies/{id}` avec `currency: EUR` + admin → 200 ; agent non admin → 403
- [ ] AC4 — `formatCurrency(150000, 'XOF')` → `"150 000 F CFA"`
- [ ] AC5 — `formatCurrency(150000.50, 'EUR')` → `"150 000,50 €"`
- [ ] AC6 — `formatCurrency(150000, 'USD')` → `"$150,000.00"`
- [ ] AC7 — `<Money value={loyer} agencyId={agency.id} />` affiche le loyer avec la devise de l'agence (via hook)
- [ ] AC8 — PDF factures pour une agence EUR affichent `€` et séparateur décimal virgule
- [ ] AC9 — les montants inline hardcodés "F CFA" identifiés par TCK-078 sont remplacés par `<Money>` ou `formatCurrency`
- [ ] AC10 — changer la devise d'une agence n'affecte pas les baux/paiements existants (test dédié)

## Hors périmètre

- Conversion multi-devises avec taux de change (P3 — spec §2.8, ticket dédié).
- Traduction automatique des contenus utilisateurs (P3).
- Devise par **bien** (override agency) — pas demandé, ticket dédié si besoin émerge.
- Intégration API taux de change (Fixer / ExchangeRate) — P3 avec la conversion.
- Rapport financier consolidé multi-devises — P3.

## Notes d'implémentation

- **Migration** additive `add_currency_to_agencies_table` (char(3) default `XOF`). Idempotente via `Schema::hasColumn`.
- **Backend** : `Currency` enum (XOF/EUR/USD) avec metadata (symbol, decimals, locale, position). `CurrencyFormatter` (`format`/`parse`) basé sur `NumberFormatter` (ext-intl). Blade directive `@currency($amount, $currency)` enregistrée via `CurrencyDirective::register()` dans `AppServiceProvider::boot()`.
- **Frontend** : `formatCurrency` étendu (héritage TCK-078) avec metadata `{symbol, decimals, locale}`. Hook `useAgencyCurrency` lit l'agency via React Query (sparse fields `id,currency`). `<Money>` accepte `currency` direct OU `agencyId` (auto-resolve). 8+ callsites refactorés (BookingPaymentDialog, CreateLeaseForm, MaintenanceCompleteForm, payments/constants, overview agent/owner pages).
- **PDF templates** : `pdf/invoices/default.blade.php`, `pdf/leases/contract.blade.php`, `pdf/receipts/rent.blade.php` consomment `@currency($amount, $currency)`. Devise propagée au template via le builder du `DocumentPdfService` (le contexte fournit `$currency` ou `'XOF'` par défaut).
- **Hors périmètre** : aucune conversion temps réel, devise par bien override (TCK-099+ ou ticket dédié si besoin émerge), arrondi XOF géré dans `CurrencyFormatter` (decimals=0).
- **Tests** : 22 backend (`AgencyCurrencyUpdateTest` 6 + `CurrencyFormatterTest` 6 + `CurrencyPdfRegressionTest` 10) + Vitest 353/353 verts (Money/useAgencyCurrency/formatCurrency).
- **PR** : feat/tck-084-multi-currency → dev (à ouvrir).
