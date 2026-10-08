<?php

namespace App\Services\Payments;

use App\Contracts\Payments\PaymentDriverContract;
use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Payments\LeasePaymentSettledOnline;
use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Invoice\InvoiceNumberAllocator;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Payments\Drivers\LemonSqueezyDriver;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use App\Services\Payments\Drivers\WaveDriver;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as PaymentDriverStatus;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Webhooks\WebhookJournal;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\InputBag;

/**
 * Orchestrator: picks the right driver, runs business validations, mutates
 * the local payment row consistently with the webhook contract.
 */
class PaymentGatewayService
{
    /** Passe 2, N4 — la valeur de `gateway.settled_by` d'un règlement manuel. */
    public const SETTLED_MANUALLY = 'manual';

    /**
     * Les payables qu'un événement de paiement peut rapprocher — et rien d'autre : TCK-293 ferme
     * l'appariement par `custom_data.payment_type`, qui acceptait n'importe quelle classe.
     *
     * @var list<class-string<Model>>
     */
    private const PAYABLES = [BookingPayment::class, LeasePayment::class, Invoice::class];

    /**
     * Resolve the active `Integration` for `(provider, agency)`. Falls back
     * to a global integration (`agency_id = null`) when no agency-specific
     * record exists.
     */
    public function resolveIntegration(PaymentProvider $provider, ?int $agencyId): ?Integration
    {
        $query = Integration::query()
            ->where('provider', $provider->value)
            ->where('is_active', true);

        if ($agencyId === null) {
            return $query->whereNull('agency_id')->first();
        }

        return $query->where(function ($q) use ($agencyId): void {
            $q->where('agency_id', $agencyId)->orWhereNull('agency_id');
        })->orderByRaw('agency_id IS NULL')->first();
    }

    /**
     * Le pilote qui sert chaque fournisseur. TCK-602 (ADR-0051 §3) — lue aussi par
     * {@see availableProviders()}, qui y trouve les identifiants que le pilote lit
     * (`CREDENTIAL_KEYS`).
     *
     * @var array<string, class-string<PaymentDriverContract>>
     */
    public const DRIVERS = [
        'wave' => WaveDriver::class,
        'orange_money' => OrangeMoneyDriver::class,
        'lemon_squeezy' => LemonSqueezyDriver::class,
    ];

    public function driverFor(Integration $integration): PaymentDriverContract
    {
        $driver = self::DRIVERS[(string) $integration->provider] ?? null;
        abort_code_if($driver === null, 422, 'payment.provider_unsupported', ['provider' => (string) $integration->provider]);

        return new $driver($integration);
    }

    /**
     * TCK-602 (ADR-0051 §3) — les fournisseurs que `initiate()` ACCEPTERA pour ce payable, et
     * la seule règle : une intégration active couvre l'agence du payable (repli global compris),
     * un pilote la sert et ses identifiants sont remplis, et le fournisseur accepte la devise.
     * L'écran authentifié, la page publique du lien et `initiate()` la lisent.
     *
     * @return list<PaymentProvider>
     */
    public function availableProviders(Model $payment): array
    {
        $agencyId = $this->paymentAgencyId($payment);
        $currency = $this->paymentCurrency($payment);
        $available = [];

        foreach (PaymentProvider::cases() as $provider) {
            $driver = self::DRIVERS[$provider->value] ?? null;
            if ($driver === null || ! $provider->supportsCurrency($currency)) {
                continue;
            }
            $integration = $this->resolveIntegration($provider, $agencyId);
            if ($integration === null || ! $this->hasCredentials($integration, $driver::CREDENTIAL_KEYS)) {
                continue;
            }
            $available[] = $provider;
        }

        return $available;
    }

    /** @param  list<string>  $keys */
    private function hasCredentials(Integration $integration, array $keys): bool
    {
        $credentials = is_array($integration->credentials) ? $integration->credentials : [];
        foreach ($keys as $key) {
            if (! is_scalar($credentials[$key] ?? null) || trim((string) $credentials[$key]) === '') {
                return false;
            }
        }

        return true;
    }

    /**
     * Initiate a checkout for `$payment` using `$provider`.
     *
     * @param  array<string,mixed>  $meta
     */
    public function initiate(Model $payment, PaymentProvider $provider, array $meta = []): CheckoutSession
    {
        // TCK-593 (vérification adverse, V2) — sous verrou de la ligne : deux requêtes simultanées
        // (double clic, deux onglets) ouvraient deux checkouts, et le second écrasait le
        // `transaction_id` du premier — dont le webhook ne retrouvait plus rien.
        return DB::transaction(function () use ($payment, $provider, $meta): CheckoutSession {
            $payment->newQuery()->whereKey($payment->getKey())->lockForUpdate()->first();
            $payment->refresh();

            return $this->initiateLocked($payment, $provider, $meta);
        });
    }

    /**
     * @param  array<string,mixed>  $meta
     */
    protected function initiateLocked(Model $payment, PaymentProvider $provider, array $meta): CheckoutSession
    {
        // TCK-588 / TCK-593 — un montant qu'on ne sait pas résoudre se juge EN PREMIER : rien ne
        // peut être encaissé, et ce n'est ni « déjà payé » ni « en cours ». Le message nommait la
        // classe du paiement (`App\Models\LeasePayment`).
        $amount = $this->amountDue($payment);
        abort_code_if($amount === null, 422, 'payment.amount_unresolved');

        // TCK-593 — on ne paie pas deux fois. La garde vit ici, AVANT la résolution de
        // l'intégration et tout appel au pilote : le bouton masqué du front n'empêchait rien.
        abort_code_unless($this->isPayable($payment), 409, 'payment.not_payable');

        // V2 — un checkout encore ouvert est RENDU, pas doublé. Chez un autre fournisseur, il est
        // refusé : deux checkouts ouverts, c'est deux encaissements possibles.
        $open = $this->openCheckout($payment);
        if ($open !== null) {
            // Passe 2, N2 — rendu seulement s'il demande ce que l'écran annonce : un réglage
            // d'agence changé, ou une pénalité tombée pendant que le checkout vit, changent
            // `amountDue()` sans changer le montant figé du checkout.
            $sameAmount = abs(($this->openCheckoutAmount($payment, $open) ?? -1.0) - ($this->amountDue($payment) ?? -2.0)) < 0.005;
            if (($open['provider'] ?? null) !== $provider->value || ! $sameAmount) {
                $this->refuseOpenCheckout($payment, $open);
            }

            return new CheckoutSession((string) $open['checkout_url'], (string) $open['transaction_id'], $provider->value);
        }

        $agencyId = $this->paymentAgencyId($payment);
        $currency = $this->paymentCurrency($payment);
        if (! $provider->supportsCurrency($currency)) {
            // Le seul refus qui appelle un conseil : le XOF se paie par un prestataire local.
            abort_code_if(
                $provider === PaymentProvider::LemonSqueezy && strtoupper($currency) === 'XOF',
                422,
                'payment.xof_requires_local_provider',
            );
            abort_code(422, 'payment.currency_unsupported', [
                'provider' => $provider->value,
                'currency' => strtoupper($currency),
            ]);
        }

        // TCK-602 (ADR-0051 §3) — la règle que l'écran a lue : un fournisseur qu'il n'a pas
        // proposé rend 422 AVANT tout appel au fournisseur (intégration absente, inactive, ou aux
        // identifiants incomplets — elle cassait au clic).
        abort_code_unless(in_array($provider, $this->availableProviders($payment), true), 422, 'payment.provider_not_available', ['provider' => $provider->value]);
        $integration = $this->resolveIntegration($provider, $agencyId);

        // Règle n°3 du CLAUDE.md : le montant est décimal en base et entier ×100 à la
        // frontière du driver. XOF n'a pas de sous-unité — chaque driver local re-divise.
        $amountCents = (int) round($amount * 100);
        // TCK-593 — un montant dû nul n'est pas une donnée invalide, c'est une échéance soldée.
        abort_code_if($amountCents <= 0, 409, 'payment.not_payable');

        $driver = $this->driverFor($integration);
        $session = $driver->initiate($payment, $amountCents, $currency, $meta);

        // Persist the gateway hint on the payment so the verify endpoint
        // and the webhook can find this row again.
        $this->recordInitiation($payment, $provider, $session, $amount, $integration);

        // Bump `last_used_at` for the integration UI surface.
        $integration->forceFill(['last_used_at' => now()])->save();

        return $session;
    }

    /**
     * Verify a payment with the provider (force-pull).
     */
    public function verify(Model $payment): ?PaymentDriverStatus
    {
        $providerValue = $this->extractProvider($payment);
        $transactionId = (string) ($payment->transaction_id ?? '');
        if ($providerValue === null || $transactionId === '') {
            return null;
        }

        $provider = PaymentProvider::tryFrom($providerValue);
        if ($provider === null) {
            return null;
        }

        $integration = $this->resolveIntegration($provider, $this->paymentAgencyId($payment));
        if ($integration === null) {
            return null;
        }

        $driver = $this->driverFor($integration);
        $status = $driver->verify($transactionId);

        // VERIF-594 m-4 — l'appel au prestataire reste hors transaction ; l'état et le numéro de la
        // facture soldée (`InvoiceNumberAllocator`) s'écrivent ensemble, comme sur le chemin webhook.
        // VERIF-596 passe 7 (M-H) — et sur la ligne RELUE sous verrou après l'appel : `$payment` a
        // été lu avant, et un renouvellement a pu annuler l'échéance pendant la latence du
        // fournisseur. Jugé sur l'instance périmée, le règlement réécrivait `paid` sur une échéance
        // annulée au lieu de la marquer doublon. Même règle que `paymentsForEvent` et `markPaid`.
        DB::transaction(function () use ($payment, $status, $transactionId): void {
            $locked = $payment->newQuery()->whereKey($payment->getKey())->lockForUpdate()->first();
            if ($locked !== null) {
                $this->applyStatusToPayment($locked, $status->status, [], $transactionId);
            }
        });

        return $status;
    }

    /**
     * TCK-293 (ADR-0046 §3.1) — l'intégration que désigne une URL de webhook, ou `null`.
     *
     * Une seule requête, quel que soit `$provider` : l'empreinte du jeton est cherchée d'abord, puis
     * recomparée en temps constant, et c'est seulement ensuite que l'on juge l'intégration —
     * active, de paiement, du fournisseur de l'URL. Rien n'est écrit ici : un `null` n'a rien
     * muté, et l'appelant rend le même 404 dans tous les cas.
     */
    public function resolveWebhookIntegration(string $provider, string $token): ?Integration
    {
        $hash = Integration::hashWebhookToken($token);
        $integration = Integration::query()->where('webhook_token_hash', $hash)->first();

        if ($integration === null || ! hash_equals((string) $integration->webhook_token_hash, $hash)) {
            return null;
        }

        $expected = PaymentProvider::tryFrom($provider);
        if ($expected === null || ! $integration->is_active || $integration->provider !== $expected->value) {
            return null;
        }

        return $integration;
    }

    /**
     * Process an inbound webhook received on the URL of `$integration`. Idempotent on
     * `(provider, transaction_id, type)`.
     *
     * TCK-293 (ADR-0046 §3) — l'intégration vient du jeton de l'URL, plus d'une recherche « la
     * première active du fournisseur ». Le pilote vérifie la signature avec SES identifiants avant
     * de lire le corps ; l'événement porte ensuite cette intégration comme autorité, et le
     * rapprochement ne sort pas de son périmètre.
     */
    public function handleWebhook(Integration $integration, Request $request): PaymentEvent
    {
        $event = $this->driverFor($integration)
            ->handleWebhook($request)
            ->authenticatedBy(WebhookAuthority::of($integration));

        // TCK-602 (ADR-0051 §4) — la signature a passé : le journal le sait, et se rattache à
        // l'intégration QUI l'a validée (ADR-0046), plus à l'intégration globale du fournisseur.
        $journal = app(WebhookJournal::class);
        $journal->authenticated($integration);
        $journal->annotate(['external_id' => $event->transactionId, 'event_type' => $event->type]);

        $journal->annotate(['matched_count' => $this->applyEventToMatchingPayment($event)]);

        return $event;
    }

    /**
     * Bridge for the lemonsqueezy/laravel package events. Receives the
     * raw payload (signature already validated upstream) and mutates the
     * matching `BookingPayment` / `LeasePayment` / `Invoice`.
     *
     * @param  array<string,mixed>  $payload
     */
    public function handleWebhookEvent(string $eventName, array $payload): ?PaymentEvent
    {
        $integration = Integration::query()
            ->where('provider', PaymentProvider::LemonSqueezy->value)
            ->where('is_active', true)
            ->orderByRaw('agency_id IS NULL')
            ->first();
        if ($integration === null) {
            return null;
        }

        // TCK-293 (ADR-0046 §6) — ce chemin est authentifié par le secret de signature de la
        // CONFIGURATION, qui appartient à la plateforme : l'événement porte l'autorité de la
        // plateforme, jamais celle d'une agence dont l'intégration se trouverait ici en premier.
        $platform = Integration::query()
            ->where('provider', PaymentProvider::LemonSqueezy->value)
            ->where('is_active', true)
            ->whereNull('agency_id')
            ->first();

        $driver = new LemonSqueezyDriver($platform ?? $integration);
        $request = Request::create('/webhooks/payments/lemon_squeezy', 'POST', [], [], [], [], json_encode($payload));
        $request->setJson(new InputBag($payload));
        $request->headers->set('Content-Type', 'application/json');

        // Map LS event name to our normalised type without invoking the
        // public webhook surface (signature has already been verified by
        // the package).
        $type = match ($eventName) {
            'order_created' => PaymentEvent::TYPE_PAID,
            'order_refunded' => PaymentEvent::TYPE_REFUNDED,
            'subscription_payment_failed' => PaymentEvent::TYPE_FAILED,
            default => PaymentEvent::TYPE_PENDING,
        };

        $attributes = $payload['data']['attributes'] ?? [];
        $transactionId = (string) ($payload['data']['id'] ?? $attributes['identifier'] ?? '');
        if ($transactionId === '') {
            return null;
        }

        $event = new PaymentEvent(
            PaymentProvider::LemonSqueezy->value,
            $type,
            $transactionId,
            array_merge($driver->extractFees($attributes), [
                'lemon_squeezy_event' => $eventName,
                'custom_data' => $attributes['first_order_item']['custom_data'] ?? $payload['meta']['custom_data'] ?? [],
            ]),
            authority: WebhookAuthority::platform($platform),
        );

        $journal = app(WebhookJournal::class);
        $journal->annotate(['external_id' => $event->transactionId, 'event_type' => $event->type]);
        $journal->annotate(['matched_count' => $this->applyEventToMatchingPayment($event)]);

        return $event;
    }

    /**
     * Apply an event to the matching local payment row (idempotent).
     *
     * TCK-602 (ADR-0051 §4) — rend le nombre de payables appariés : `0` est un « non apparié »,
     * que le journal distingue d'un succès.
     */
    public function applyEventToMatchingPayment(PaymentEvent $event): int
    {
        return DB::transaction(function () use ($event): int {
            $candidates = $this->paymentsForEvent($event);

            // TCK-593 (V2) — un événement qui ne retrouve aucun payable est de l'argent peut-être
            // encaissé et rattaché à rien : il laisse une trace. Identifiants seulement, aucune
            // donnée personnelle.
            if ($candidates === []) {
                // TCK-293 — un événement hors du périmètre de son autorité finit ici aussi : la trace
                // dit quelle intégration l'a authentifié.
                Log::warning('payment_webhook_unmatched', [
                    'provider' => $event->provider,
                    'transaction_id' => $event->transactionId,
                    'type' => $event->type,
                    'integration_id' => $event->authority?->integration?->id,
                    'agency_id' => $event->authority?->agencyId,
                ]);

                return 0;
            }

            foreach ($candidates as $payment) {
                if ($this->isAlreadyProcessed($payment, $event)) {
                    continue;
                }

                $this->applyStatusToPayment($payment, $this->mapEventTypeToDriverStatus($event->type), $event->metadata, $event->transactionId);
                $this->markAsProcessed($payment, $event);
            }

            return count($candidates);
        });
    }

    protected function mapEventTypeToDriverStatus(string $type): string
    {
        return match ($type) {
            PaymentEvent::TYPE_PAID => PaymentDriverStatus::SUCCESS,
            PaymentEvent::TYPE_FAILED => PaymentDriverStatus::FAILED,
            PaymentEvent::TYPE_REFUNDED => PaymentDriverStatus::REFUNDED,
            default => PaymentDriverStatus::PENDING,
        };
    }

    /**
     * Translate a provider status into a domain `PaymentStatus` and write
     * it on the payment row. Honors the existing `HasPaymentAttributes`
     * transition matrix — invalid transitions throw 422 from the model.
     *
     * @param  array<string,mixed>  $metadata
     */
    protected function applyStatusToPayment(Model $payment, string $providerStatus, array $metadata = [], ?string $transactionId = null): void
    {
        $existingMeta = is_array($payment->metadata ?? null) ? $payment->metadata : [];

        $current = $this->currentPaymentStatus($payment);

        // Already paid / refunded — never regress to pending. We still log
        // the late event in metadata for traceability.
        if ($current === PaymentStatus::Paid && $providerStatus === PaymentDriverStatus::PENDING) {
            $payment->metadata = array_merge($existingMeta, ['gateway_late_event' => array_merge($existingMeta['gateway_late_event'] ?? [], [now()->toIso8601String()])]);
            $payment->save();

            return;
        }

        switch ($providerStatus) {
            case PaymentDriverStatus::SUCCESS:
                // TCK-593 (vérification adverse, V3) — un encaissement en ligne sur un payable DÉJÀ
                // réglé (espèces enregistrées pendant qu'un checkout était ouvert, second checkout)
                // ne solde rien : il est marqué comme double encaissement, et l'agence prévenue
                // pour rembourser. Un rejeu du MÊME règlement (vérification forcée) n'est pas un
                // doublon. VERIF-596 passe 5 (M-E) — de même sur une échéance ANNULÉE par un
                // renouvellement (checkout ouvert avant, confirmé après) : elle n'est plus due,
                // l'encaissement est à rembourser, et la matrice refuserait `cancelled → paid`.
                if ($current === PaymentStatus::Paid || $current === PaymentStatus::Cancelled) {
                    // Rien n'a soldé une échéance annulée : seul un doublon déjà marqué pour CE
                    // règlement (rejeu) n'est pas recompté.
                    $counted = $current === PaymentStatus::Paid
                        ? $this->isSettledBy($existingMeta, $transactionId)
                        : in_array($transactionId, array_column(
                            is_array($existingMeta['gateway_duplicate_payment'] ?? null) ? $existingMeta['gateway_duplicate_payment'] : [],
                            'transaction_id',
                        ), true);
                    if (! $counted) {
                        $existingMeta['gateway_duplicate_payment'] = array_merge(
                            is_array($existingMeta['gateway_duplicate_payment'] ?? null) ? $existingMeta['gateway_duplicate_payment'] : [],
                            [[
                                'transaction_id' => $transactionId,
                                'amount' => is_numeric($metadata['amount'] ?? null) ? (float) $metadata['amount'] : null,
                                'at' => now()->toIso8601String(),
                            ]],
                        );
                        $this->notifyDuplicatePayment($payment, $metadata);
                    }
                    break;
                }

                $initiation = $this->initiationFor($existingMeta, $transactionId);
                $this->assertReportedAmountCoversPayment($payment, $metadata, $initiation['amount']);
                $this->writeStatus($payment, PaymentStatus::Paid);
                // TCK-593 — loyer et pénalité réglés ensemble : la pénalité est acquittée dans la
                // MÊME sauvegarde que le loyer. `late_fee_included` a été figé à l'initiation DE CE
                // CHECKOUT ; un réglage d'agence changé depuis ne décide rien ici.
                if ($payment instanceof LeasePayment && $initiation['late_fee_included'] === true) {
                    if ($payment->late_fee_paid_at === null) {
                        $payment->late_fee_paid_at = now();
                    } else {
                        // Passe 2 (observation retenue) — la pénalité de ce checkout a été réglée
                        // ENTRE-TEMPS à l'agence (session du fournisseur plus longue que la fenêtre de
                        // réutilisation, ou passage outre du personnel) : sa part est encaissée deux
                        // fois. Marquée et signalée comme en V3, au montant de la pénalité. Repli
                        // (entrée sans `late_fee_amount`) : la pénalité de l'échéance, celle-là même
                        // qui a été réglée — jamais `remaining_amount`, déjà nul après `writeStatus`.
                        $feePart = $initiation['late_fee_amount']
                            ?? $this->roundToCurrencyUnit((float) $payment->late_fee_amount, $payment);
                        $existingMeta['gateway_duplicate_payment'] = array_merge(
                            is_array($existingMeta['gateway_duplicate_payment'] ?? null) ? $existingMeta['gateway_duplicate_payment'] : [],
                            [[
                                'transaction_id' => $transactionId,
                                'amount' => $feePart,
                                'at' => now()->toIso8601String(),
                                'kind' => 'late_fee',
                            ]],
                        );
                        $this->notifyDuplicatePayment($payment, ['amount' => $feePart], 'late_fee');
                    }
                }
                if ($transactionId !== null) {
                    $existingMeta['gateway'] = array_merge(
                        is_array($existingMeta['gateway'] ?? null) ? $existingMeta['gateway'] : [],
                        ['settled_by' => $transactionId],
                    );
                }
                // `invoices` n'a pas de colonne `paid_at` : l'écrire y ajouterait un attribut
                // inconnu et ferait échouer le `save()` — `SQLSTATE[42703] column … does not
                // exist` sur PostgreSQL. (Ce commentaire opposait « MySQL lève / SQLite
                // accepte » : c'est l'écart qui a coûté D-51, et il n'existe PLUS depuis
                // ADR-0020 — la suite tourne sur le moteur de la production. La garde reste
                // nécessaire, c'est sa JUSTIFICATION qui a changé.)
                if ($this->hasColumn($payment, 'paid_at')) {
                    $payment->paid_at ??= now();
                }
                break;
            case PaymentDriverStatus::FAILED:
                // TCK-593 — un échec de paiement en ligne ne change pas l'état du LOYER. Écrire
                // `failed` sortait l'échéance de tous les circuits (pénalités, relances,
                // `mark-paid` manuel) : un checkout Wave expiré suffisait à la figer. L'échec
                // reste tracé, sur l'échéance qui garde son statut ouvert.
                if ($payment instanceof LeasePayment) {
                    $gateway = is_array($existingMeta['gateway'] ?? null) ? $existingMeta['gateway'] : [];
                    // TCK-593 (passe 2, N1) — seul l'échec du checkout COURANT le ferme. L'échec
                    // d'un checkout de l'historique (abandonné, puis expiré chez le fournisseur) se
                    // trace sur SON entrée : écrit dans `last_failed_at`, il fermait le checkout
                    // vivant, et le clic suivant en ouvrait un troisième.
                    if ($transactionId === null || $transactionId === ($gateway['transaction_id'] ?? null)) {
                        $gateway['last_failed_at'] = now()->toIso8601String();
                    } elseif (is_array($gateway['transactions'] ?? null)) {
                        foreach ($gateway['transactions'] as $i => $entry) {
                            if (($entry['transaction_id'] ?? null) === $transactionId) {
                                $gateway['transactions'][$i]['failed_at'] = now()->toIso8601String();
                            }
                        }
                    }
                    $existingMeta['gateway'] = $gateway;
                } elseif ($current !== PaymentStatus::Paid && $current !== PaymentStatus::Refunded) {
                    $this->writeStatus($payment, PaymentStatus::Failed);
                }
                break;
            case PaymentDriverStatus::REFUNDED:
                if ($current === PaymentStatus::Paid) {
                    $this->writeStatus($payment, PaymentStatus::Refunded);
                }
                break;
            case PaymentDriverStatus::PENDING:
            default:
                if ($current === null || $current === PaymentStatus::Pending) {
                    $this->writeStatus($payment, PaymentStatus::Pending);
                }
        }

        $payment->metadata = array_merge($existingMeta, $metadata);
        $payment->save();

        // TCK-602 (ADR-0051 §2) — UNE quittance par échéance : l'événement part à la seule
        // transition vers `paid` (webhook, rejeu ou `verify()`), jamais sur un événement rejoué
        // d'une échéance déjà soldée. Distribué après la validation de la transaction.
        if ($payment instanceof LeasePayment && $current !== PaymentStatus::Paid && $this->currentPaymentStatus($payment) === PaymentStatus::Paid) {
            event(new LeasePaymentSettledOnline((int) $payment->getKey()));
        }

        // TCK-594 (ADR-0039 §7) — une facture soldée par la passerelle est émise : un brouillon
        // payé ainsi reçoit son numéro comme par `InvoiceService::markPaid`.
        if ($payment instanceof Invoice && $this->currentPaymentStatus($payment) === PaymentStatus::Paid) {
            app(InvoiceNumberAllocator::class)->allocate($payment);
        }
    }

    /**
     * Guard against under-payment: a `paid` webhook must not settle an invoice
     * for less than it was issued. We only compare when the gateway reported a
     * numeric amount in the SAME currency/unit as our stored `amount` (true for
     * Wave/OM in XOF, which report the integer major-unit amount 1:1). When the
     * basis is unknown (e.g. Lemon Squeezy reports cents/USD) we skip rather
     * than risk rejecting a legitimate settlement. Over-payment is allowed.
     *
     * @param  array<string,mixed>  $metadata
     */
    protected function assertReportedAmountCoversPayment(Model $payment, array $metadata, ?float $frozenAmount = null): void
    {
        $reported = $metadata['amount'] ?? null;
        $reportedCurrency = isset($metadata['currency']) ? strtoupper((string) $metadata['currency']) : null;
        if (! is_numeric($reported) || $reportedCurrency === null) {
            return;
        }

        $currency = $payment->currency ?? null;
        $expectedCurrency = is_object($currency) && property_exists($currency, 'value')
            ? strtoupper((string) $currency->value)
            : (is_string($currency) ? strtoupper($currency) : null);

        // Only enforce on a same-currency basis — a differing currency means a
        // different unit we can't safely compare here.
        if ($expectedCurrency === null || $reportedCurrency !== $expectedCurrency) {
            return;
        }

        // TCK-593 — la comparaison porte sur le montant FIGÉ à l'initiation. Une pénalité
        // appliquée — ou un réglage d'agence changé — entre l'ouverture du checkout et le webhook
        // ferait sinon refuser un paiement légitime.
        $frozen = $frozenAmount ?? (is_array($payment->metadata ?? null) ? ($payment->metadata['gateway_expected_amount'] ?? null) : null);
        $expected = is_numeric($frozen) ? (float) $frozen : $this->amountDue($payment);
        if ($expected === null) {
            return;
        }

        $paid = (float) $reported;

        // 0.01 tolerance absorbs float/rounding noise; anything materially below
        // the issued amount is an under-payment and must not settle.
        abort_code_if(
            $paid + 0.01 < $expected,
            422,
            'payment.amount_short',
        );
    }

    protected function recordInitiation(Model $payment, PaymentProvider $provider, CheckoutSession $session, float $amount, ?Integration $integration = null): void
    {
        $existingMeta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $lateFeeIncluded = $payment instanceof LeasePayment && $this->lateFeeIncluded($payment);

        // TCK-593 (V2) — l'historique des checkouts émis : le webhook d'un checkout antérieur
        // retrouve encore son payable, et le montant figé DE CE CHECKOUT.
        $previous = is_array($existingMeta['gateway'] ?? null) ? $existingMeta['gateway'] : [];
        $transactions = is_array($previous['transactions'] ?? null) ? $previous['transactions'] : [];
        $transactions[] = [
            'transaction_id' => $session->transactionId,
            'provider' => $provider->value,
            // TCK-293 (ADR-0046 §5) — l'intégration qui initie : seul son propriétaire (son agence,
            // ou la plateforme) pourra solder CE checkout par webhook.
            'integration_id' => $integration?->id,
            'amount' => $amount,
            'late_fee_included' => $lateFeeIncluded,
            // La part de pénalité de CE montant : un webhook tardif sur une pénalité réglée entre-temps
            // à l'agence la marque en double, à ce montant.
            'late_fee_amount' => $lateFeeIncluded ? $this->roundToCurrencyUnit($payment->lateFeeOutstanding(), $payment) : 0.0,
            'initiated_at' => now()->toIso8601String(),
        ];

        $payment->fill([
            'transaction_id' => $session->transactionId,
            'metadata' => array_merge($existingMeta, [
                // TCK-593 — le montant demandé est FIGÉ ici : la garde de sous-paiement compare le
                // webhook à lui, et le rapprochement bancaire le cherche sur la ligne de relevé.
                'gateway_expected_amount' => $amount,
                'late_fee_included' => $lateFeeIncluded,
                'gateway' => array_filter([
                    'provider' => $provider->value,
                    'transaction_id' => $session->transactionId,
                    'integration_id' => $integration?->id,
                    'checkout_url' => $session->checkoutUrl,
                    'initiated_at' => now()->toIso8601String(),
                    'transactions' => $transactions,
                    // TCK-602 — l'échec du checkout précédent survit à la nouvelle tentative : la
                    // console des paiements le compte (`PaymentSupervisionService`).
                    'last_failed_at' => $previous['last_failed_at'] ?? null,
                ], fn ($value) => $value !== null),
            ]),
        ]);

        // Stamp the payment_method field so the consolidated history
        // surfaces the right channel without requiring a join.
        if (in_array('payment_method', $payment->getFillable(), true)) {
            $payment->payment_method = $provider->paymentMethod()->value;
        }

        $payment->save();
    }

    /**
     * Les payables que rapproche cet événement, verrouillés.
     *
     * TCK-293 (ADR-0046 §5) — dans le périmètre de l'autorité de l'événement, sur LES TROIS chemins
     * d'appariement : l'agence de l'intégration qui a validé (la plateforme n'est pas bornée par
     * agence), puis le propriétaire de l'intégration qui a initié le checkout, quand il est
     * enregistré. Sans autorité, rien.
     *
     * @return array<int, Model>
     */
    protected function paymentsForEvent(PaymentEvent $event): array
    {
        $authority = $event->authority;
        if ($authority === null) {
            return [];
        }

        $matches = [];
        foreach (self::PAYABLES as $class) {
            $rows = $this->withinAuthority($class::query(), $class, $authority)
                ->where('transaction_id', $event->transactionId)
                ->lockForUpdate()
                ->get();
            foreach ($rows as $row) {
                $matches[] = $row;
            }
        }

        // TCK-593 (V2) — le webhook d'un checkout ANTÉRIEUR : son identifiant n'est plus dans
        // `transaction_id`, il est dans l'historique.
        if ($matches === []) {
            foreach (self::PAYABLES as $class) {
                $rows = $this->withinAuthority($class::query(), $class, $authority)
                    ->whereJsonContains('metadata->gateway->transactions', [['transaction_id' => $event->transactionId]])
                    ->lockForUpdate()
                    ->get();
                foreach ($rows as $row) {
                    $matches[] = $row;
                }
            }
        }

        // Lemon Squeezy embeds our payment hint in custom_data — fall
        // back to that when the transaction id matching missed.
        if ($matches === [] && ! empty($event->metadata['custom_data']['payment_id'])) {
            $paymentId = (int) $event->metadata['custom_data']['payment_id'];
            $type = (string) ($event->metadata['custom_data']['payment_type'] ?? '');
            if ($paymentId > 0 && in_array($type, self::PAYABLES, true)) {
                $row = $this->withinAuthority($type::query(), $type, $authority)
                    ->whereKey($paymentId)
                    ->lockForUpdate()
                    ->first();
                // TCK-602 (ADR-0051, conséquence M-1) — un payable dont le checkout COURANT a été
                // ouvert chez un autre fournisseur (une échéance initiée par son lien, en Wave ou
                // en Orange Money) n'est pas soldé par ce chemin : seul un payable jamais initié,
                // ou initié chez ce fournisseur, l'est encore (limite M-1, inchangée).
                $current = $row !== null && is_array($row->metadata['gateway'] ?? null) ? ($row->metadata['gateway']['provider'] ?? null) : null;
                if ($row !== null && ($current === null || $current === $event->provider)) {
                    $matches[] = $row;
                }
            }
        }

        return array_values(array_filter(
            $matches,
            fn (Model $row): bool => $this->initiatedWithinAuthority($row, $event->transactionId, $authority),
        ));
    }

    /**
     * TCK-293 (ADR-0046 §5, AC3) — une intégration d'agence ne voit que les payables de son agence :
     * l'acompte par sa réservation, l'échéance par son bail, la facture par son agence.
     *
     * @param  Builder<Model>  $query
     * @param  class-string<Model>  $class
     * @return Builder<Model>
     */
    private function withinAuthority(Builder $query, string $class, WebhookAuthority $authority): Builder
    {
        if ($authority->isPlatform()) {
            return $query;
        }

        $agencyId = $authority->agencyId;

        return match ($class) {
            BookingPayment::class => $query->whereHas('booking', fn (Builder $q) => $q->where('agency_id', $agencyId)),
            LeasePayment::class => $query->whereHas('lease', fn (Builder $q) => $q->where('agency_id', $agencyId)),
            default => $query->where('agency_id', $agencyId),
        };
    }

    /**
     * TCK-293 (ADR-0046 §5) — si le checkout de cette transaction a enregistré l'intégration qui l'a
     * initié, son propriétaire (une agence, ou la plateforme) doit être celui de l'autorité. Un
     * checkout encaissé sur le compte de la plateforme ne se solde pas avec le secret d'une agence,
     * ni l'inverse. Un payable antérieur à l'enregistrement (aucune intégration notée) n'est borné
     * que par l'agence. Une intégration notée mais introuvable ne donne rien.
     */
    private function initiatedWithinAuthority(Model $payment, string $transactionId, WebhookAuthority $authority): bool
    {
        $integrationId = $this->initiatingIntegrationId(is_array($payment->metadata ?? null) ? $payment->metadata : [], $transactionId);
        if ($integrationId === null) {
            return true;
        }

        $initiator = Integration::withTrashed()->whereKey($integrationId)->first(['id', 'agency_id']);
        if ($initiator === null) {
            return false;
        }

        return ($initiator->agency_id !== null ? (int) $initiator->agency_id : null) === $authority->agencyId;
    }

    /**
     * L'intégration qui a initié le checkout `$transactionId` : son entrée de l'historique si elle
     * existe (même sans intégration notée), sinon celle du checkout courant.
     *
     * @param  array<string,mixed>  $meta
     */
    private function initiatingIntegrationId(array $meta, string $transactionId): ?int
    {
        $gateway = is_array($meta['gateway'] ?? null) ? $meta['gateway'] : [];

        foreach (is_array($gateway['transactions'] ?? null) ? $gateway['transactions'] : [] as $entry) {
            if (is_array($entry) && ($entry['transaction_id'] ?? null) === $transactionId) {
                return is_numeric($entry['integration_id'] ?? null) ? (int) $entry['integration_id'] : null;
            }
        }

        return is_numeric($gateway['integration_id'] ?? null) ? (int) $gateway['integration_id'] : null;
    }

    /**
     * TCK-593 (V2) — le checkout encore OUVERT sur ce payable : émis il y a moins de
     * `payments.checkout_reuse_minutes`, et sans échec rapporté depuis. `null` sinon.
     *
     * @return array<string,mixed>|null
     */
    public function openCheckout(Model $payment): ?array
    {
        $gateway = is_array($payment->metadata ?? null) ? ($payment->metadata['gateway'] ?? null) : null;
        if (! is_array($gateway) || empty($gateway['initiated_at']) || empty($gateway['checkout_url']) || empty($gateway['transaction_id'])) {
            return null;
        }

        $initiatedAt = Carbon::parse($gateway['initiated_at']);
        if ($initiatedAt->lt(now()->subMinutes((int) config('payments.checkout_reuse_minutes', 30)))) {
            return null;
        }

        if (! empty($gateway['last_failed_at']) && Carbon::parse($gateway['last_failed_at'])->gte($initiatedAt)) {
            return null;
        }

        // Passe 2, M5 — le personnel a passé outre (règlement reçu au guichet) : ce checkout ne
        // bloque plus rien ; payé quand même, il deviendra un double encaissement signalé.
        if (! empty($gateway['superseded_at']) && Carbon::parse($gateway['superseded_at'])->gte($initiatedAt)) {
            return null;
        }

        return $gateway;
    }

    /**
     * Passe 2, M5 — le personnel de l'agence passe outre au checkout ouvert pour enregistrer un
     * règlement reçu hors ligne. Le checkout est marqué `superseded_at` (sur la ligne et sur son
     * entrée de l'historique), avec le motif saisi. Pose l'attribut, la sauvegarde est celle de
     * l'appelant, qui journalise ensuite par `logCheckoutOverride`. Rend le checkout écarté, ou
     * `null` s'il n'y en avait pas.
     *
     * @return array<string,mixed>|null
     */
    public function supersedeOpenCheckout(Model $payment, string $reason): ?array
    {
        $open = $this->openCheckout($payment);
        if ($open === null) {
            return null;
        }

        $now = now()->toIso8601String();
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $gateway = is_array($meta['gateway'] ?? null) ? $meta['gateway'] : [];
        $gateway['superseded_at'] = $now;
        $gateway['superseded_reason'] = $reason;
        foreach (is_array($gateway['transactions'] ?? null) ? $gateway['transactions'] : [] as $i => $entry) {
            if (($entry['transaction_id'] ?? null) === ($open['transaction_id'] ?? null)) {
                $gateway['transactions'][$i]['superseded_at'] = $now;
            }
        }
        $meta['gateway'] = $gateway;
        $payment->metadata = $meta;

        return $open;
    }

    /**
     * Le journal du passage outre : identifiants du checkout et geste, sans donnée personnelle —
     * le motif, texte libre, reste sur la ligne (`gateway.superseded_reason`).
     *
     * @param  array<string,mixed>  $open
     */
    public function logCheckoutOverride(Model $payment, ?User $by, array $open, string $gesture): void
    {
        activity(class_basename($payment))
            ->causedBy($by)
            ->performedOn($payment)
            ->withProperties([
                'gesture' => $gesture,
                'transaction_id' => $open['transaction_id'] ?? null,
                'provider' => $open['provider'] ?? null,
                'checkout_amount' => $this->openCheckoutAmount($payment, $open),
            ])
            ->event('open_checkout_overridden')
            ->log('open_checkout_overridden');
    }

    /**
     * Passe 2, N4 — un règlement MANUEL (espèces, virement saisi) le dit sur la ligne :
     * `metadata.gateway.settled_by = manual`. Sans cette marque, un checkout payé après coup ne se
     * distinguerait pas d'un règlement en ligne antérieur à `settled_by`. Pose l'attribut ; la
     * sauvegarde est celle de l'appelant.
     */
    public function markManualSettlement(Model $payment): void
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $meta['gateway'] = array_merge(
            is_array($meta['gateway'] ?? null) ? $meta['gateway'] : [],
            ['settled_by' => self::SETTLED_MANUALLY],
        );
        $payment->metadata = $meta;
    }

    /**
     * TCK-593 (V3) — un règlement manuel est refusé tant qu'un checkout est ouvert : l'argent
     * pourrait être encaissé deux fois.
     */
    public function assertNoOpenCheckout(Model $payment): void
    {
        $open = $this->openCheckout($payment);
        if ($open !== null) {
            $this->refuseOpenCheckout($payment, $open);
        }
    }

    /**
     * Passe 2, N2 — le 409 `checkout_in_progress` porte, en plus de son message, le checkout en
     * cours : son montant figé, sa devise, son ancienneté, et l'heure à partir de laquelle il ne
     * sera plus réutilisé. Le front l'affiche (« un paiement de X est en cours… ») au lieu d'un
     * refus nu. TCK-588 — une erreur codée (`payment.checkout_in_progress`), son message rendu
     * dans la langue de la requête ; le checkout est une donnée à côté du code.
     *
     * @param  array<string,mixed>  $open
     */
    public function refuseOpenCheckout(Model $payment, array $open): never
    {
        $initiatedAt = Carbon::parse($open['initiated_at']);

        throw (new ApiError(409, 'payment.checkout_in_progress'))->with([
            'checkout' => [
                'amount' => $this->openCheckoutAmount($payment, $open),
                'currency' => $this->paymentCurrency($payment),
                'provider' => $open['provider'] ?? null,
                'initiated_at' => $initiatedAt->toIso8601String(),
                'age_minutes' => max(0, (int) $initiatedAt->diffInMinutes(now())),
                'retry_after' => $initiatedAt->copy()->addMinutes((int) config('payments.checkout_reuse_minutes', 30))->toIso8601String(),
            ],
        ]);
    }

    /**
     * Le montant figé du checkout ouvert : son entrée de l'historique, à défaut le dernier montant
     * figé de la ligne.
     *
     * @param  array<string,mixed>  $open
     */
    protected function openCheckoutAmount(Model $payment, array $open): ?float
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];

        return $this->initiationFor($meta, isset($open['transaction_id']) ? (string) $open['transaction_id'] : null)['amount'];
    }

    /**
     * Le montant figé et l'inclusion de la pénalité DU checkout que rapporte l'événement — repli
     * sur la dernière initiation.
     *
     * @param  array<string,mixed>  $meta
     * @return array{amount: ?float, late_fee_included: bool, late_fee_amount: ?float}
     */
    protected function initiationFor(array $meta, ?string $transactionId): array
    {
        $transactions = $meta['gateway']['transactions'] ?? [];
        foreach (is_array($transactions) ? $transactions : [] as $entry) {
            if ($transactionId !== null && ($entry['transaction_id'] ?? null) === $transactionId) {
                return [
                    'amount' => is_numeric($entry['amount'] ?? null) ? (float) $entry['amount'] : null,
                    'late_fee_included' => ($entry['late_fee_included'] ?? false) === true,
                    'late_fee_amount' => is_numeric($entry['late_fee_amount'] ?? null) ? (float) $entry['late_fee_amount'] : null,
                ];
            }
        }

        return [
            'amount' => is_numeric($meta['gateway_expected_amount'] ?? null) ? (float) $meta['gateway_expected_amount'] : null,
            'late_fee_included' => ($meta['late_fee_included'] ?? false) === true,
            'late_fee_amount' => null,
        ];
    }

    /**
     * Ce payable a-t-il été soldé par CE règlement ? `settled_by`, ou à défaut (règlements
     * antérieurs à TCK-593) un événement `paid` déjà journalisé pour lui.
     *
     * @param  array<string,mixed>  $meta
     */
    protected function isSettledBy(array $meta, ?string $transactionId): bool
    {
        if ($transactionId === null) {
            return false;
        }

        $gateway = is_array($meta['gateway'] ?? null) ? $meta['gateway'] : [];
        if (($gateway['settled_by'] ?? null) === $transactionId) {
            return true;
        }

        // Passe 2, N4 — un règlement ANTÉRIEUR à `settled_by` (vérifié par `verify()`, qui ne
        // journalise aucun événement) n'a ni marque ni événement : la ligne qui porte encore CETTE
        // transaction a été soldée par elle. Un règlement manuel, lui, pose `settled_by = manual`
        // (`markManualSettlement`) : son checkout payé ensuite reste un doublon.
        if (! array_key_exists('settled_by', $gateway) && ($gateway['transaction_id'] ?? null) === $transactionId) {
            return true;
        }

        foreach (is_array($meta['gateway_events'] ?? null) ? $meta['gateway_events'] : [] as $entry) {
            if (($entry['transaction_id'] ?? null) === $transactionId && ($entry['type'] ?? null) === PaymentEvent::TYPE_PAID) {
                return true;
            }
        }

        return false;
    }

    /**
     * Prévient les admins actifs de l'agence (admin principal + profils d'admin actifs) d'un
     * double encaissement à rembourser. TCK-588 — un code et des paramètres bruts, rendus dans la
     * langue de chaque destinataire.
     *
     * @param  array<string,mixed>  $metadata
     */
    protected function notifyDuplicatePayment(Model $payment, array $metadata, string $kind = 'payment'): void
    {
        $agencyId = $this->paymentAgencyId($payment);
        if ($agencyId === null) {
            return;
        }

        $userIds = AgencyAdminProfile::query()->active()->where('agency_id', $agencyId)->pluck('user_id')
            ->push(Agency::query()->whereKey($agencyId)->value('primary_admin_id'))
            ->filter()
            ->unique();

        $code = $kind === 'late_fee' ? NotificationCode::PaymentDuplicateLateFee : NotificationCode::PaymentDuplicate;
        $params = [
            'amount' => NotificationRenderer::money((float) ($metadata['amount'] ?? 0), $this->paymentCurrency($payment)),
            'reference' => (string) ($payment->getAttribute('reference_number') ?? '#'.$payment->getKey()),
        ];
        $target = $payment instanceof LeasePayment && $payment->lease_id !== null
            ? NotificationTarget::of('lease', (int) $payment->lease_id)
            : NotificationTarget::of('payments');

        $notifications = app(NotificationService::class);
        foreach (User::query()->whereIn('id', $userIds)->get() as $admin) {
            $notifications->send($admin, $code, $params, $target);
        }
    }

    protected function isAlreadyProcessed(Model $payment, PaymentEvent $event): bool
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $log = $meta['gateway_events'] ?? [];

        foreach ($log as $entry) {
            if (($entry['provider'] ?? null) === $event->provider
                && ($entry['transaction_id'] ?? null) === $event->transactionId
                && ($entry['type'] ?? null) === $event->type) {
                return true;
            }
        }

        return false;
    }

    protected function markAsProcessed(Model $payment, PaymentEvent $event): void
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $log = $meta['gateway_events'] ?? [];
        $log[] = [
            'provider' => $event->provider,
            'transaction_id' => $event->transactionId,
            'type' => $event->type,
            'received_at' => now()->toIso8601String(),
        ];
        $meta['gateway_events'] = $log;
        $payment->metadata = $meta;
        $payment->save();
    }

    protected function extractProvider(Model $payment): ?string
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        if (! empty($meta['gateway']['provider'])) {
            return (string) $meta['gateway']['provider'];
        }

        if ($payment->payment_method instanceof PaymentMethod) {
            return match ($payment->payment_method) {
                PaymentMethod::Wave => PaymentProvider::Wave->value,
                PaymentMethod::OrangeMoney => PaymentProvider::OrangeMoney->value,
                PaymentMethod::Card => PaymentProvider::LemonSqueezy->value,
                default => null,
            };
        }

        return null;
    }

    protected function paymentAgencyId(Model $payment): ?int
    {
        if ($payment instanceof BookingPayment) {
            return $payment->booking?->agency_id;
        }
        if ($payment instanceof LeasePayment) {
            return $payment->lease?->agency_id;
        }
        if ($payment instanceof Invoice) {
            return $payment->agency_id;
        }

        return null;
    }

    /**
     * Le statut courant d'un payable, ramené au vocabulaire `PaymentStatus`.
     *
     * `BookingPayment` et `LeasePayment` castent leur `status` en `PaymentStatus` ;
     * `Invoice` le caste en `InvoiceStatus`. Le code d'origine faisait
     * `PaymentStatus::tryFrom((string) $payment->status)` — et `(string)` sur un objet enum
     * lève `Object of class InvoiceStatus could not be converted to string`. Mesuré : 500 sur
     * `GET /api/invoices/{id}/verify` (D-51).
     */
    protected function currentPaymentStatus(Model $payment): ?PaymentStatus
    {
        $status = $payment->status;

        if ($status instanceof PaymentStatus) {
            return $status;
        }

        if ($status instanceof \BackedEnum) {
            return PaymentStatus::tryFrom((string) $status->value);
        }

        return is_scalar($status) ? PaymentStatus::tryFrom((string) $status) : null;
    }

    /**
     * Écrit un statut de domaine sur le payable, dans l'enum que CE payable sait porter.
     *
     * `InvoiceStatus` et `PaymentStatus` ne se recouvrent que sur `paid` : une facture n'a ni
     * `pending`, ni `failed`, ni `refunded` (elle a `draft`, `sent`, `overdue`, `cancelled`,
     * `void`). **Quand il n'existe pas d'équivalent, on n'écrit RIEN** — l'événement reste
     * tracé dans `metadata` par l'appelant.
     *
     * Ce n'est pas de la prudence gratuite : décider qu'un paiement Wave échoué laisse la
     * facture en `sent` ou la bascule en `overdue`, ou qu'un remboursement la rend `void`,
     * est un arbitrage MÉTIER. Écrire un statut inventé serait pire que de n'en écrire aucun,
     * parce qu'il aurait l'autorité d'une donnée. Question ouverte consignée en ardoise D-51.
     */
    protected function writeStatus(Model $payment, PaymentStatus $status): void
    {
        $cast = $payment->getCasts()['status'] ?? null;

        // Le payable parle déjà `PaymentStatus` : rien à traduire.
        if (! is_string($cast) || ! enum_exists($cast) || $cast === PaymentStatus::class) {
            $payment->status = $status;

            return;
        }

        // Traduction par VALEUR : `paid` existe des deux côtés, et c'est le seul cas qui
        // compte pour la passerelle. `tryFrom` rend null pour tout le reste — on n'écrit pas.
        $equivalent = $cast::tryFrom($status->value);
        if ($equivalent !== null) {
            $payment->status = $equivalent;
        }
    }

    /**
     * Ce payable porte-t-il réellement cette colonne ?
     *
     * Écrire un attribut inexistant est silencieux jusqu'au `save()`, où la base lève
     * (`SQLSTATE[42703]` sur PostgreSQL).
     *
     * ⚠ Cette ligne disait « où MySQL lève et SQLite pardonne — l'asymétrie exacte qui a caché
     * D-51 ». L'asymétrie a disparu avec ADR-0020 : la suite tourne sur le moteur de la
     * production, donc un test rougirait là où D-51 restait vert. Ce n'est pas une raison de
     * retirer la garde — elle empêche l'erreur au lieu de la constater —, c'en est une de ne
     * plus la justifier par un écart entre moteurs qui n'existe plus.
     */
    protected function hasColumn(Model $payment, string $column): bool
    {
        return in_array($column, $payment->getFillable(), true)
            || Schema::hasColumn($payment->getTable(), $column);
    }

    /**
     * Le montant dû par ce payable, quelle que soit la colonne qui le porte — **la** définition de
     * « combien est dû » (TCK-593 : renommage de `paymentAmount`). L'initiation, la garde de
     * sous-paiement, `amount_due` de `LeasePaymentResource`, l'historique et le sélecteur de
     * fournisseur la lisent tous ; aucun écran ne refait l'addition.
     *
     * `BookingPayment` et `LeasePayment` le stockent dans `amount`, `Invoice` dans
     * `total_amount`. Lire un `$payment->amount` nu sur une facture rend `null`, que
     * `(float)` transforme en `0.0` — un zéro qui n'a pas l'air d'une erreur.
     *
     * Cette divergence était connue et corrigée dans la garde de sous-paiement, avec un
     * commentaire qui la décrivait ; `initiate()`, dix lignes plus haut, la reproduisait
     * quand même et rendait 422 sur toute facture. **Une règle corrigée à un endroit et
     * violée à l'autre n'est pas une règle : c'est un piège documenté.** D'où cette
     * méthode — une seule définition de « combien est dû », comme `AgencyPolicy::update()`
     * est la seule définition de « qui administre cette agence » (TCK-290).
     *
     * Sur une échéance de loyer (TCK-593) : le loyer **restant**, plus la pénalité restant due si
     * l'agence du bail l'encaisse en ligne (`Agency::collectsLateFeesOnline()`, absent = non) ; `0`
     * hors statut payable — une échéance `paid` dont la pénalité reste due ne demande rien en ligne,
     * la pénalité se règle à l'agence.
     *
     * Rend `null` — et jamais `0.0` — quand aucun montant n'est lisible : l'appelant doit
     * pouvoir distinguer « rien à payer » de « je ne sais pas ».
     */
    public function amountDue(Model $payment): ?float
    {
        if ($payment instanceof LeasePayment) {
            // Sans montant, le reste dû (dérivé de `amount`) vaudrait 0 : « soldée » au lieu de
            // « indéterminé ». Même réponse que pour une facture ou un acompte sans montant.
            if (! is_numeric($payment->getAttribute('amount'))) {
                return null;
            }
            if (! $this->isPayable($payment)) {
                return 0.0;
            }

            $fee = $this->lateFeeIncluded($payment) ? $payment->lateFeeOutstanding() : 0.0;

            return $this->roundToCurrencyUnit((float) $payment->remaining_amount + $fee, $payment);
        }

        $amount = $payment->amount ?? $payment->getAttribute('total_amount');

        return is_numeric($amount) ? $this->roundToCurrencyUnit((float) $amount, $payment) : null;
    }

    /**
     * TCK-593 — le montant dû est arrondi à l'UNITÉ de la devise, au plus proche, la moitié vers
     * le haut, AVANT d'être figé et transmis : c'est ce que le fournisseur encaissera (les pilotes
     * Wave et Orange Money demandent un entier pour le XOF). Montant affiché = montant figé =
     * montant encaissé ; sinon le webhook d'un paiement encaissé est refusé pour sous-paiement.
     */
    private function roundToCurrencyUnit(float $amount, Model $payment): float
    {
        return round($amount, Currency::decimalPlacesOf($payment->getAttribute('currency')), PHP_ROUND_HALF_UP);
    }

    /**
     * TCK-593 — la pénalité restant due de cette échéance est-elle INCLUSE dans `amountDue()` ?
     *
     * Vrai seulement si l'échéance est payable, qu'une pénalité reste due, et que l'agence du bail
     * l'encaisse en ligne — réglage lu maintenant. Un bail sans agence vaut « non ». La
     * notification de pénalité et la ressource lisent la même réponse.
     */
    public function lateFeeIncluded(LeasePayment $payment): bool
    {
        return $this->isPayable($payment)
            && $payment->lateFeeOutstanding() > 0
            && ($payment->lease?->agency?->collectsLateFeesOnline() ?? false);
    }

    /**
     * TCK-593 — ce payable peut-il encore être payé en ligne ?
     *
     * Une échéance ou un acompte `paid`/`refunded` non ; une facture hors `sent|overdue` non. Une
     * échéance `failed` (données antérieures à TCK-593) reste payable : réessayer après un échec est
     * le cas nominal. Tout payable dont le montant dû est nul ne l'est pas non plus — c'est
     * `initiate()` qui le vérifie, sur le montant calculé.
     */
    public function isPayable(Model $payment): bool
    {
        if ($payment instanceof Invoice) {
            return in_array($payment->status, [InvoiceStatus::Sent, InvoiceStatus::Overdue], true);
        }

        // TCK-594 (VERIF-594 passe 4, P4-7) — une caution rendue est due AU locataire : il ne la
        // règle pas en ligne.
        if ($payment instanceof LeasePayment && $payment->payment_type === LeasePaymentType::DepositRefund) {
            return false;
        }

        $status = $this->currentPaymentStatus($payment);

        // VERIF-596 passe 5 (M-E) — une échéance annulée par un renouvellement n'est plus due.
        return ! in_array($status, [PaymentStatus::Paid, PaymentStatus::Refunded, PaymentStatus::Cancelled], true);
    }

    protected function paymentCurrency(Model $payment): string
    {
        $currency = $payment->currency ?? null;
        if (is_object($currency) && property_exists($currency, 'value')) {
            return (string) $currency->value;
        }
        if (is_string($currency) && $currency !== '') {
            return $currency;
        }

        // TCK-084 will move agency currency to a top-level column. Until
        // then, fall back to XOF (Senegal default).
        $agencyId = $this->paymentAgencyId($payment);
        if ($agencyId !== null) {
            $agency = Agency::find($agencyId);
            if ($agency) {
                $settings = is_array($agency->settings ?? null) ? $agency->settings : [];
                if (! empty($settings['currency'])) {
                    return strtoupper((string) $settings['currency']);
                }
                $columnCurrency = $agency->getAttribute('currency');
                if ($columnCurrency) {
                    return strtoupper((string) (is_object($columnCurrency) ? $columnCurrency->value : $columnCurrency));
                }
            }
        }

        return app(PlatformSettingService::class)->getValue('currency.default');
    }
}
