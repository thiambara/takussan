---
id: TCK-079
title: "Passerelle de paiement Wave / Orange Money / Stripe"
status: todo
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
tags: [back, front, payments, integration, gateway, wave, orange-money, stripe]
---

## Objectif utilisateur

Permettre à un agent/admin de déclencher un paiement (réservation, bail, facture)
directement depuis la plateforme via une passerelle mobile money (Wave, Orange
Money) ou carte bancaire (Stripe), et de voir le paiement se réconcilier
automatiquement avec les `BookingPayment` / `LeasePayment` / `Invoice` existants
lorsque le fournisseur renvoie un webhook de confirmation.

## Contrat de données

**Backend — Service `App\Services\Payments\PaymentGatewayService`** (orchestrateur)
+ drivers :

- `App\Services\Payments\Drivers\WaveDriver` (API Wave Business — checkout session)
- `App\Services\Payments\Drivers\OrangeMoneyDriver` (API Orange Money Merchant)
- `App\Services\Payments\Drivers\StripeDriver` (PaymentIntent)

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

**Modale de sélection du provider** : logos Wave / Orange Money / Stripe côte à
côte, chaque tuile désactivée si l'intégration n'est pas configurée (tooltip
"Contacter l'admin"). Préférence persistée localement (`localStorage`) — la
prochaine fois, pré-sélection du dernier provider utilisé.

**Page de retour provider** : état de chargement ≥ 800 ms pour laisser le temps
au webhook d'arriver, puis affichage final. Jamais de message définitif de
succès sans confirmation serveur.

## Contraintes strictes (métier)

- **Idempotence webhook obligatoire** — chaque `transaction_id` doit être
  enregistré une seule fois. Un webhook redelivered ne doit jamais créer un
  doublon de transition d'état.
- **Vérification de signature** — chaque webhook doit vérifier HMAC/shared
  secret du provider via le `credentials` chiffré de `Integration`. Pas de
  secret dans le code ou l'env.
- **Transitions d'état garde-fou** — un paiement `paid` ne peut pas repasser
  en `pending`. Les guards du modèle (TCK-028) restent la source de vérité ;
  le webhook ne fait qu'appeler `markAsPaid()` / `markAsFailed()`.
- **Confidentialité credentials** — `Integration.credentials` est chiffré au
  repos (`encrypted:text`) et **jamais** retourné dans les resources API.
  L'admin UI expose uniquement un placeholder `••••••••` + date `last_used_at`.
- **Scope agence** — un paiement ne peut être initié que via une `Integration`
  appartenant à l'agence du bien (ou une intégration globale `agency_id=null`).
- **Devise obligatoire** — `Wave` / `Orange Money` exigent XOF ; `Stripe`
  accepte multi. Si mismatch entre la devise du paiement et celle supportée
  par le driver, refuser 422 avant `initiate`.

## Delta à produire

- [ ] Migration aucune sur payments (réutilise `transaction_id` + `metadata`)
- [ ] Contract `App\Contracts\Payments\PaymentDriverContract`
- [ ] Service `App\Services\Payments\PaymentGatewayService` (sélection driver)
- [ ] Drivers `WaveDriver`, `OrangeMoneyDriver`, `StripeDriver` (3 classes)
- [ ] Controller `App\Http\Controllers\Api\PaymentGatewayController` (initiate / verify)
- [ ] Controller webhook `App\Http\Controllers\Api\Webhooks\PaymentWebhookController`
- [ ] FormRequest `InitiatePaymentRequest` (provider, return_url, cancel_url)
- [ ] Route publique `POST /api/webhooks/payments/{provider}` (sans auth, avec throttle + signature)
- [ ] Routes authentifiées `POST /payments/{payment}/initiate`, `GET /payments/{payment}/verify`
- [ ] Policy update `BookingPaymentPolicy` / `LeasePaymentPolicy` — ability `initiate`
- [ ] Seeder `IntegrationSeeder` (fixtures de test uniquement)
- [ ] Enum `PaymentProvider` (wave, orange_money, stripe) si pas déjà présent
- [ ] Tests `PaymentGatewayInitiateTest` (happy path + 3 providers + scope agence + devise mismatch)
- [ ] Tests `PaymentWebhookTest` (signature OK/KO, idempotence, transition interdite)
- [ ] Tests `StripeDriverTest` / `WaveDriverTest` / `OrangeMoneyDriverTest` (mock HTTP)
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
- [ ] AC7 — tentative Wave/OM avec devise ≠ XOF → 422 avant appel HTTP
- [ ] AC8 — page `/app/payments/return` affiche `pending` ≥ 800 ms puis poll jusqu'à résolution (max 2 min) puis redirige
- [ ] AC9 — bouton "Payer en ligne" masqué si aucun provider configuré pour l'agence

## Hors périmètre

- Rapprochement bancaire semi-automatique (P2 dédié — ticket séparé).
- Relance automatique des factures en retard (P2 dédié).
- Commissions automatiques par agent (P3).
- Comptabilité exportable FEC (P3).
- Remboursement en ligne (le `refund_amount` existe mais le flux `initiateRefund` reste manuel — ticket dédié).
- UI admin configuration des credentials → géré par TCK-068 (Settings / Intégrations) ; ce ticket consomme les integrations déjà configurées.
- Multi-devises conversion temps réel → TCK-084.

## Notes d'implémentation

_(à remplir par implementing-specs)_
