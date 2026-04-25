---
id: TCK-079
title: "Passerelle de paiement Wave / Orange Money / Lemon Squeezy"
status: review
phase: P2
family: applicatif
estimate: XL
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-028, TCK-068]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#31-integration-
tags: [back, front, payments, integration, gateway, wave, orange-money, lemon-squeezy]
---

> **Note spec** — `features.md` §1.5 mentionne « Wave, Orange Money, Stripe » comme
> exemples. Le choix technique pour la carte internationale est **Lemon Squeezy**
> (merchant of record : VAT/tax collection incluses). Ouvrir une PR sur
> `features.md` pour ajuster la formulation ("ex. Wave, Orange Money, Lemon Squeezy")
> avant le merge de l'implémentation de ce ticket.

## Objectif utilisateur

Permettre à un agent/admin de déclencher un paiement (réservation, bail, facture)
directement depuis la plateforme via une passerelle mobile money (Wave, Orange
Money) ou carte bancaire internationale (Lemon Squeezy, merchant of record avec
collecte de TVA incluse), et de voir le paiement se réconcilier automatiquement
avec les `BookingPayment` / `LeasePayment` / `Invoice` existants lorsque le
fournisseur renvoie un webhook de confirmation.

## Contrat de données

**Backend — Service `App\Services\Payments\PaymentGatewayService`** (orchestrateur)
+ drivers :

- `App\Services\Payments\Drivers\WaveDriver` (API Wave Business — checkout session)
- `App\Services\Payments\Drivers\OrangeMoneyDriver` (API Orange Money Merchant)
- `App\Services\Payments\Drivers\LemonSqueezyDriver` — **utilise obligatoirement le package officiel `lemonsqueezy/laravel`** (`composer require lemonsqueezy/laravel`). Le driver enveloppe la facade `LemonSqueezy` et le trait `Billable` (appliqué sur `User`/`Agency` selon le scope de l'intégration). Checkout créé via `$billable->checkout($variantId)->withCustomPrice($amount)` (amount en cents) ; URL de redirection renvoyée par `->url()`. Les webhooks sont exposés sur la route publique `webhooks/lemon-squeezy` fournie par le package, avec vérification de signature `X-Signature` automatique si `LEMON_SQUEEZY_SIGNING_SECRET` est défini. Les events du package (`OrderCreated`, `SubscriptionCreated`, `PaymentRefunded`…) sont écoutés par un `LemonSqueezyEventListener` qui fait le pont vers `PaymentGatewayService::handleWebhookEvent()`.

Chaque driver implémente `PaymentDriverContract` :
`initiate(Payable $entity, int $amount, string $currency, array $meta): CheckoutSession`
`verify(string $externalId): PaymentStatus`
`handleWebhook(Request $request): PaymentEvent`

Endpoints :

- `POST /api/payments/{payment}/initiate` — démarre le checkout, renvoie `checkout_url` + `transaction_id`.
- `GET /api/payments/{payment}/verify` — force une vérification (fallback si webhook raté).
- `POST /api/webhooks/payments/{provider}` — webhook public avec vérification de signature.

**Frontend** : bouton "Payer en ligne" sur fiche paiement/facture → redirection
vers la checkout page du provider → page de retour `/app/payments/return?status={success|failed|pending}`
qui repoll `GET /payments/{id}`.

La table `Integration` (§31) stocke les credentials chiffrés par `(provider, agency_id)`.
La colonne `BookingPayment.transaction_id` + `metadata` + le champ parent
`payment_method` (déjà enum) sont réutilisés — **aucune nouvelle migration sur
BookingPayment/LeasePayment** : les données passerelle vont dans `metadata` (déjà json).

## Direction UX / Artistique

**Fiche paiement** : bouton "Payer en ligne" visible uniquement si une
`Integration` active existe pour le provider ET l'agence du bien. Si le paiement
est en cours (webhook pas encore reçu), afficher un état `pending` avec
pull-to-refresh manuel et polling léger (15s intervalle, max 2 min).

**Modale de sélection du provider** : logos Wave / Orange Money / Lemon Squeezy
côte à côte, chaque tuile désactivée si l'intégration n'est pas configurée
(tooltip "Contacter l'admin"). Préférence persistée localement (`localStorage`)
— la prochaine fois, pré-sélection du dernier provider utilisé.

**Page de retour provider** : état de chargement ≥ 800 ms pour laisser le temps
au webhook d'arriver, puis affichage final. Jamais de message définitif de
succès sans confirmation serveur.

## Contraintes strictes (métier)

- **Idempotence webhook obligatoire** — chaque `transaction_id` doit être
  enregistré une seule fois. Un webhook redelivered ne doit jamais créer un
  doublon de transition d'état.
- **Vérification de signature** — chaque webhook doit vérifier HMAC/shared
  secret du provider via le `credentials` chiffré de `Integration`. Pas de
  secret dans le code ou l'env. Pour Lemon Squeezy : **la vérification est
  déléguée au package `lemonsqueezy/laravel`** qui valide `X-Signature`
  (HMAC-SHA256, comparaison `hash_equals`) automatiquement via son middleware
  de route. Notre webhook controller local ne re-vérifie pas — il écoute
  uniquement les events Laravel émis par le package.
- **Transitions d'état garde-fou** — un paiement `paid` ne peut pas repasser
  en `pending`. Les guards du modèle (TCK-028) restent la source de vérité ;
  le webhook ne fait qu'appeler `markAsPaid()` / `markAsFailed()`.
- **Confidentialité credentials** — `Integration.credentials` est chiffré au
  repos (`encrypted:text`) et **jamais** retourné dans les resources API.
  L'admin UI expose uniquement un placeholder `••••••••` + date `last_used_at`.
- **Scope agence** — un paiement ne peut être initié que via une `Integration`
  appartenant à l'agence du bien (ou une intégration globale `agency_id=null`).
- **Devise obligatoire** — `Wave` / `Orange Money` exigent XOF ; **Lemon
  Squeezy ne supporte PAS XOF** (ni aucune devise africaine). Supportées : USD,
  EUR, GBP, CAD, AUD + ~20 autres. Si mismatch entre la devise du paiement
  (dérivée de l'agence via TCK-084) et celle supportée par le driver, refuser
  422 avant `initiate` avec un message explicite ("Lemon Squeezy ne supporte
  pas XOF — utilisez Wave ou Orange Money pour un paiement en XOF").
- **Lemon Squeezy : prix dynamique** — LS fonctionne historiquement avec des
  `Variants` pré-configurées. Pour un montant arbitraire (loyer, facture), on
  utilise `custom_price` en cents via le builder du package :
  `$billable->checkout($variantId)->withCustomPrice($amountCents)` (pattern
  "pay what you want" côté LS). Un seul `store_id` + un seul `variant_id`
  "container" suffit par agence. Le `store_id` + `api_key` + `signing_secret`
  de LS sont stockés chiffrés dans `Integration.credentials` (pas en `.env`
  pour supporter plusieurs agences) ; le driver les charge dans la config
  runtime du package avant chaque appel.
- **Lemon Squeezy : merchant of record** — LS collecte la TVA/sales tax et le
  reverse sur un payout mensuel (moins frais ~5% + 0.50$). Le montant net
  reçu ≠ le montant facturé. À réconcilier dans `BookingPayment.metadata` :
  stocker `gross_amount`, `fees_amount`, `net_amount` séparément.

## Delta à produire

- [ ] Migration aucune sur payments (réutilise `transaction_id` + `metadata`)
- [ ] Contract `App\Contracts\Payments\PaymentDriverContract`
- [ ] Service `App\Services\Payments\PaymentGatewayService` (sélection driver)
- [ ] `composer require lemonsqueezy/laravel` + publish config (`config/lemon-squeezy.php`)
- [ ] Appliquer le trait `LemonSqueezy\Laravel\Billable` sur `App\Models\Agency` (scope intégration = agence)
- [ ] Drivers `WaveDriver`, `OrangeMoneyDriver`, `LemonSqueezyDriver` (3 classes) — le `LemonSqueezyDriver` enveloppe le package, ne réimplémente PAS le HTTP client ni la signature webhook
- [ ] Listener `LemonSqueezyEventListener` (écoute `OrderCreated` / `OrderRefunded` / `SubscriptionCreated` du package, route vers `PaymentGatewayService`)
- [ ] `EventServiceProvider` : enregistrer le listener
- [ ] Controller `App\Http\Controllers\Api\PaymentGatewayController` (initiate / verify)
- [ ] Controller webhook `App\Http\Controllers\Api\Webhooks\PaymentWebhookController`
- [ ] FormRequest `InitiatePaymentRequest` (provider, return_url, cancel_url)
- [ ] Route publique `POST /api/webhooks/payments/{provider}` (sans auth, avec throttle + signature)
- [ ] Routes authentifiées `POST /payments/{payment}/initiate`, `GET /payments/{payment}/verify`
- [ ] Policy update `BookingPaymentPolicy` / `LeasePaymentPolicy` — ability `initiate`
- [ ] Seeder `IntegrationSeeder` (fixtures de test uniquement)
- [ ] Enum `PaymentProvider` (wave, orange_money, lemon_squeezy) si pas déjà présent
- [ ] Tests `PaymentGatewayInitiateTest` (happy path + 3 providers + scope agence + devise mismatch XOF ↔ LS)
- [ ] Tests `PaymentWebhookTest` (signature OK/KO, idempotence, transition interdite)
- [ ] Tests `LemonSqueezyDriverTest` / `WaveDriverTest` / `OrangeMoneyDriverTest` (mock HTTP) — pour LS, fake le builder du package via un spy, pas un mock HTTP bas niveau
- [ ] Tests `LemonSqueezyEventListenerTest` (dispatch d'un `OrderCreated` factice → `BookingPayment` transition correcte)
- [ ] Tests `LemonSqueezyFeesReconciliationTest` (extraction `gross/fees/net` depuis webhook `order_created`)
- [ ] Page UI `/app/payments/return` (callback provider)
- [ ] Composant `PaymentProviderPicker` (modale sélection)
- [ ] Bouton "Payer en ligne" intégré dans `BookingDetail`, `LeaseDetail`, `InvoiceDetail`
- [ ] Helper `useInitiatePayment` (mutation + redirect)
- [ ] i18n fr/en/wo (`payments.gateway.*`)

## Critères d'acceptation

- [ ] AC1 — `POST /payments/{id}/initiate` avec `provider=wave` renvoie 200 + `checkout_url` valide quand `Integration(wave, agency)` active existe
- [ ] AC2 — même endpoint renvoie 404 si aucune `Integration` active pour le couple (provider, agence)
- [ ] AC3 — webhook avec signature invalide renvoie 401 et ne mute pas le paiement
- [ ] AC4 — webhook avec `transaction_id` déjà traité renvoie 200 et n'émet pas de double transition (idempotence)
- [ ] AC5 — un paiement `paid` reste `paid` après un webhook `pending` tardif
- [ ] AC6 — `Integration.credentials` n'est jamais exposé dans aucune resource API (même pour admin)
- [ ] AC7 — tentative Wave/OM avec devise ≠ XOF → 422 avant appel HTTP ; tentative Lemon Squeezy avec XOF → 422 avec message explicite
- [ ] AC8 — page `/app/payments/return` affiche `pending` ≥ 800 ms puis poll jusqu'à résolution (max 2 min) puis redirige
- [ ] AC9 — bouton "Payer en ligne" masqué si aucun provider configuré pour l'agence
- [ ] AC10 — webhook LS `order_created` → `BookingPayment.metadata` contient `gross_amount`, `fees_amount`, `net_amount` (cents) extraits de la payload
- [ ] AC11 — le package `lemonsqueezy/laravel` est présent dans `composer.json` (prod), la config est publiée, le trait `Billable` est appliqué sur `Agency`
- [ ] AC12 — un event `LemonSqueezy\Laravel\Events\OrderCreated` dispatché en test déclenche bien le listener et mute l'entité Payment (vérifié avec `Event::fake` + `Event::dispatch`)

## Hors périmètre

- Rapprochement bancaire semi-automatique (P2 dédié — ticket séparé).
- Relance automatique des factures en retard (P2 dédié).
- Commissions automatiques par agent (P3).
- Comptabilité exportable FEC (P3).
- Remboursement en ligne (le `refund_amount` existe mais le flux `initiateRefund` reste manuel — ticket dédié).
- UI admin configuration des credentials → géré par TCK-068 (Settings / Intégrations) ; ce ticket consomme les integrations déjà configurées.
- Multi-devises conversion temps réel → TCK-084.

## Notes d'implémentation

- **Idempotence webhook** : pas de table dédiée — le journal des events est stocké dans `BookingPayment.metadata.gateway_events[]` (json existant). Évite une migration et garde la traçabilité co-localisée avec le paiement.
- **Lemon Squeezy** : driver enveloppe le package `lemonsqueezy/laravel ^1.9` (trait `Billable` appliqué sur `Agency`). Le webhook public `webhooks/lemon-squeezy` est exposé par le package ; nous écoutons uniquement les events Laravel (`OrderCreated`, `OrderRefunded`) via `LemonSqueezyEventListener` qui appelle `PaymentGatewayService::handleLemonSqueezyEvent()`. Aucune re-vérification de signature côté local.
- **Custom price LS** : `$billable->checkout($variantId)->withCustomPrice($amountCents)` — credentials (`store_id`, `api_key`, `signing_secret`, `variant_id`) chargés depuis `Integration.credentials` chiffré et injectés dans la config runtime du package avant chaque appel.
- **Currency guard** : `wave`/`orange_money` n'acceptent que XOF ; `lemon_squeezy` rejette XOF (et toutes devises africaines). 422 retourné AVANT tout appel HTTP via `PaymentGatewayService::guardCurrency()`.
- **PR** : feat/tck-079-payment-gateway → dev (à ouvrir).
- **Tests** : 21 tests verts (4 fichiers : Initiate / Webhook / EventListener / Driver).
- **Hors périmètre** assumé : pas d'UI admin pour configurer les credentials (TCK-068), pas de remboursement en ligne, pas de conversion multi-devises.
