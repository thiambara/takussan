---
id: TCK-223
title: "Super-admin — Reversement plateforme → agences (payout périodique)"
status: review
phase: P2
family: applicatif
estimate: L
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-222]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#45-platformpayout-
    - docs/models-spec.md#44-agencysubscription-
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment-
tags: [back, front, super_admin, payments, p2]
---

## Contexte

La spec étend §1.5 avec le reversement plateforme → agence : la plateforme retient une commission (`platform_fee_pct` du plan / override) sur chaque transaction encaissée et reverse périodiquement le **net** à chaque agence. Aujourd'hui aucune logique ne calcule ces sommes ni ne pilote leur exécution. Distinct du `Payout` (#28) qui est le reversement métier agence → bailleur.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/payouts`, voit les périodes ouvertes / approuvées / payées par agence, peut clôturer une période (calcul agrégé), approuver et marquer comme payée — chaque opération est journalisée.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/payouts?filter[agency_id]=...&filter[status]=...&filter[period_end_min]=...&sort=-period_end` — liste paginée
- `GET /api/admin/payouts/{id}` — détail (breakdown : nb transactions, gross, fees, net)
- `POST /api/admin/payouts/close-period` — body `{ agency_id?, period_end }` ; calcule et crée les payouts en `pending` pour la période close (toutes agences si `agency_id` omis)
- `POST /api/admin/payouts/{id}/approve` — `{}`
- `POST /api/admin/payouts/{id}/mark-paid` — `{ processed_at, metadata?: { bank_ref?, batch_id? } }`
- `POST /api/admin/payouts/{id}/cancel` — `{ reason }`

Endpoint agence :

- `GET /api/me/payouts` — l'`agency_admin` voit les payouts de son agence en lecture seule

## Direction UX / Artistique

Page `/super-admin/payouts` avec table dense, filtres (agence, statut, période). Détail expandable : breakdown par type de transaction. Bandeau "fenêtre courante" en haut : période en cours, gross/fees/net agrégés en temps réel. Action panel : approve / mark-paid / cancel avec champ raison ou références. Côté agence : page `/admin/agency/billing` (dans le scope de TCK-222) inclut un onglet "Reversements".

## Contraintes strictes (métier)

- Endpoints super-admin-only (sauf `GET /api/me/payouts` agence-side, lecture seule).
- Le calcul `close-period` est **idempotent** : ré-exécuter pour la même `(agency_id, period_end)` ne crée pas de doublon (renvoie 409 si un payout existe déjà pour le tuple).
- La fermeture de période ne touche que les paiements `paid` dont `paid_at <= period_end` et qui ne sont pas déjà rattachés à un payout antérieur.
- Le `platform_fee_pct` utilisé est **figé** à la date d'encaissement de chaque transaction (pas la valeur courante du plan). Le service capture la valeur effective au moment du `paid_at`.
- Transitions valides : `pending → approved → processing → paid` (ou `cancelled` depuis `pending|approved`). Toute autre transition retourne 422.
- Activity log obligatoire (`super_admin_payout_*`).
- Le détail breakdown ne doit pas charger N+1 : l'agrégation se fait en SQL.
- Toujours utiliser `fields[...]`, `filter[...]`, `include=`.

## Delta à produire

- [ ] Migration : table `platform_payouts` + ajout d'une colonne `platform_fee_pct_at_payment` (decimal(5,2), null) sur `booking_payments` et `lease_payments` (figeage du taux à l'encaissement)
- [ ] Modèle `PlatformPayout` (casts, scopes, LogsActivity)
- [ ] Service `App\Services\Billing\PlatformPayoutService` (close-period idempotent, transitions, breakdown)
- [ ] Listener / observer : à chaque transition de paiement vers `paid`, capturer `platform_fee_pct_at_payment` depuis la souscription active de l'agence (TCK-222 `QuotaResolver` étendu pour exposer le fee)
- [ ] Backfill (commande artisan) : peupler `platform_fee_pct_at_payment` pour les paiements existants `paid` à 0 (pas de commission rétroactive — décision conservatrice)
- [ ] Controller `Admin\PlatformPayoutController` (`index`, `show`, `closePeriod`, `approve`, `markPaid`, `cancel`)
- [ ] Controller `Api\Me\PlatformPayoutController` (lecture)
- [ ] FormRequests, Resources
- [ ] Activity log événements
- [ ] Frontend : page `/super-admin/payouts` + onglet "Reversements" sur `/admin/agency/billing`
- [ ] Composants : `PayoutTable`, `PayoutCloseDialog`, `PayoutDetailPanel`
- [ ] Tests backend : idempotence close, transitions invalides refusées, fee figé à `paid_at`, 403 hors super-admin (sauf lecture agence)
- [ ] Tests UI : close période, approve, mark-paid

## Critères d'acceptation

- [ ] `POST /api/admin/payouts/close-period` deux fois pour le même tuple n'engendre pas de doublon (test concurrentiel)
- [ ] Le `net_amount` d'un payout = somme des paiements `paid` de la période × (1 - fee figé) — assert exact en test
- [ ] Une transition invalide (`paid → approved`) retourne 422
- [ ] Un agency_admin reçoit 403 sur tous les endpoints `/api/admin/payouts/*`
- [ ] Un agency_admin voit ses propres payouts via `GET /api/me/payouts`
- [ ] Chaque mutation produit une entrée d'audit
- [ ] Le breakdown détail tient en une requête SQL (test d'inspection requêtes : ≤ 2)

## Hors périmètre

- Exécution effective du virement (intégration banque / Wave / OM) — out of scope, marquage manuel `paid` avec référence externe
- Génération automatique d'une facture plateforme accompagnant le payout — out of scope, ticket dédié possible
- Réconciliation entre payouts émis et relevés bancaires — réutilisera TCK-109 / BankStatementLine après livraison
- Multi-devises (XOF only au démarrage)

## Notes d'implémentation

- Idempotence cablée à deux niveaux : check applicatif (`SELECT … FOR UPDATE`) + index unique partiel `platform_payouts_unique_open_period (agency_id, period_end) WHERE status <> 'cancelled'` sur PG/SQLite. La race condition retombe sur 409 via le rattrapage `QueryException`.
- Capture du fee à `paid_at` via `PaymentPlatformFeeObserver` partagé entre `BookingPayment` et `LeasePayment`. Le stamping est idempotent (la colonne ne se réécrit jamais une fois posée).
- Le `cancel` détache les paiements (`platform_payout_id = NULL`) pour qu'une nouvelle clôture les ré-aggrège — sinon les paiements seraient orphelins et invisibles à un retry.
- Backfill conservatoire : `php artisan platform:backfill-payment-fees` pose 0% sur les paiements `paid` antérieurs à TCK-223. Pas de commission rétroactive (décision business confirmée par la spec).
- Breakdown : agrégation SQL pure, vérifiée par test (≤ 2 requêtes `COUNT(*) … platform_fee_pct_at_payment` au total).
