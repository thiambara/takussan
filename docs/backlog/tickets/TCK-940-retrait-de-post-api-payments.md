---
id: TCK-940
title: "`POST /api/payments` est retiré : plus de loyer `paid` hors de `payments.record`, de restitution de caution payée sans reversement, ni de règlement hors des gardes de `mark-paid`"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models: []
tags: [paiements, autorisation, retrait, code-mort, routes, pistes]
---

## Contexte

Pistes P46.01, P46.02 et P46.03 (`docs/plans/2026-10-15-pistes-d-amelioration.md`, angle 46).

`POST /api/payments` (`PaymentController::store`) créait un `LeasePayment` ou un `BookingPayment`
selon `payable_type`. Il n'avait aucun appelant depuis TCK-681 : le front crée par les voies
imbriquées et règle par `mark-paid`. TCK-684 (P13.05) avait gardé la route en forçant `pending` pour
le payeur. Le mesureur a relevé trois défauts qui ne passaient que par elle :

- **P46.01** : l'autorisation (`authorizeLeaseManage`, `authorizeBookingManage`) ne lisait ni
  `payments.record` ni la suspension du bailleur. Un agent privé de `payments.record` et un bailleur
  `blocked` recevaient 403 sur les voies imbriquées, et **201 `paid`** ici.
- **P46.02** : `payment_type=deposit_refund` avec `status=paid` écrivait une restitution de caution
  payée sans `Payout`, que `depositsHeld` déduisait des cautions détenues.
- **P46.03** : une ligne `paid` créée ici échappait au verrou, aux refus, à la trace du règlement
  manuel et aux notifications de `mark-paid`.

Décision du porteur, recopiée de la ligne Statut de P46.01 :

> porteur (2026-10-18) : traité hors agents, en session : retrait de `POST /api/payments`, qui n'a aucun appelant, et de son test ; ferme aussi P46.02 et P46.03

Et de P46.02 et P46.03 :

> porteur (2026-10-18) : traité hors agents, en session : fermée par le retrait de `POST /api/payments` (P46.01)

## Objectif utilisateur

Un loyer ou une caution ne se déclare payé que par une voie qui juge la capacité, la suspension du
bailleur et les gardes de règlement. Il n'existe plus de voie de côté.

## Delta à produire

- `routes/api/payments.php` : la route `payments.store` retirée.
- `PaymentController` : `store()` retiré, ainsi que les helpers qui ne servaient qu'à lui
  (`authorizeBookingManage`, `authorizeLeaseManage`, `refusePaidAtFromPayer`) et les deux services
  injectés pour lui. `history()` reste.
- `app/Http/Requests/PaymentStoreRequest.php` supprimé (seul usage : `store()`).
- `tests/Feature/Api/PaymentRegistrationTest.php` supprimé : chacun de ses cas n'éprouvait que cette
  route (voir les notes).
- `scripts/check-controller-authorization.mjs` : les deux exemptions
  `PaymentController::authorize{Booking,Lease}Manage` retirées. La garde refuse une exemption morte.
- Test neuf : `tests/Feature/Routes/UnifiedPaymentRouteRemovedTest.php`.

## Critères d'acceptation

- [x] **AC1** — Aucun appelant front. *Mesuré : `grep -rnE "['\"\`](/api)?/?payments['\"\`?]" takussan-web/src`
      → aucun chemin d'appel (seulement des catégories, des clés de requête et l'entité d'export) ;
      `grep -rn "payable_type\|payable_id" takussan-web/src` → 0, alors que le corps de la route
      les exige ; les constructions dynamiques `/api/${…}` (`usePaymentProviders`,
      `useInitiatePayment`, `ressource-de-detail`) ont des segments fermés qui n'atteignent pas
      `payments` ; le relais d'impersonation transmet ce qu'on lui donne, et personne ne lui donne
      ce corps.*
- [x] **AC2** — `POST /api/payments` rend 404 ou 405 et n'écrit rien, avec le corps qui rendait
      201 `paid` au bailleur. *Mesuré : `UnifiedPaymentRouteRemovedTest` vert ; ablation (routes,
      contrôleur et requête de `HEAD` remis) → rouge, « POST /api/payments répond 201 » ;
      restauration par `cp`, `md5` identiques.*
- [x] **AC3** — `GET /api/payments/history` reste servi. *Mesuré : `php artisan route:list
      --path=api/payments` → la seule route `payments.history` ; le second cas du test neuf et
      `PaymentHistoryTest` verts.*
- [x] **AC4** — Ce qui reste vivant garde sa preuve ailleurs. *Mesuré : `BookingPaymentTest` (le
      propriétaire crée un acompte `paid`, le client est forcé à `pending`, 403 et 422) et
      `LeaseTest` (voie imbriquée et `mark-paid`) éprouvent les voies qui restent ;
      `LeasePaymentResourceContractTest` éprouve `remaining_amount`.*
- [x] **AC5** — Gardes et classes voisines vertes. *Mesuré : `node scripts/check-controller-authorization.mjs`
      → 0 après retrait des deux exemptions (1 avant, « l'entrée est morte ») ; les 14 classes de
      test qui lisent `getRoutes()` ou `route:list`, plus `PaymentHistoryTest`, `BookingPaymentTest`,
      `AgingBalanceTest` et `TimestampDayRangeTest`, vertes.*

## Hors périmètre

- La seconde voie de P46.01 (déléguer aux policies) : sans objet, la route n'existe plus.
- P46.04 et P46.05 (`LeasePaymentService::scheduleUnderLock`, `StoreLeasePaymentRequest`,
  `generate-schedule`) : traités ailleurs. Ce ticket ne touche ni `LeasePaymentService` ni
  `BookingPaymentService`, dont `create()` sert encore aux voies imbriquées.
- Les clés d'erreur `booking.not_found` et `lease.not_found`, émises seulement par `store()` : elles
  n'étaient dans aucun dictionnaire (`grep` sur `lang/` et `src/messages/` → 0), rien à retirer.

## Notes d'implémentation

**Ce que `PaymentRegistrationTest` éprouvait, cas par cas** (14 tests, tous sur `POST /api/payments`) :
les règles de `PaymentStoreRequest` (`payable_type`, `payable_id`, dates de période, type de
paiement par source), l'autorisation par les deux helpers, le 404 sur réservation inconnue, et le
forçage `pending` de TCK-684 pour le locataire et le client. Toutes partent avec la route. Les règles
équivalentes des voies imbriquées ont déjà leurs tests (AC4). Rien n'est relogé.

**Ablation** (2026-10-18) : copie des quatre fichiers corrigés dans le dossier d'ablation, puis
`git show HEAD:…` de `routes/api/payments.php`, `routes/api/dashboard.php`, `PaymentController.php`,
`DashboardController.php` et `PaymentStoreRequest.php`. `UnifiedPaymentRouteRemovedTest` rouge
(« POST /api/payments répond 201 »). Restauration par `cp`, `md5 -q` identiques, requête resupprimée,
puis vert.
