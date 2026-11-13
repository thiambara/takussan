<?php

namespace App\Services\Payments;

use App\Contracts\Payments\PaymentDriverContract;
use App\Exceptions\ApiError;
use App\Models\Enums\PaymentProvider;
use App\Models\Integration;
use App\Models\LeasePayment;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentStatus as PaymentDriverStatus;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2778 — la pénalité de retard SEULE, restée due sur une échéance dont le loyer est payé
 * (`LeasePayment::lateFeeAloneOutstanding()`), payée en ligne par un lien `subject: late_fee`.
 *
 * Le loyer est déjà réglé : son règlement (`transaction_id`, `payment_method`,
 * `gateway_expected_amount`, `late_fee_included`, `gateway.settled_by`, `gateway.provider`…) est ce que
 * lisent la quittance, le rapprochement bancaire et les reversements. Ce checkout n'y écrit RIEN :
 *
 * - il vit dans son propre emplacement, `metadata.gateway.late_fee_checkout` (le checkout ouvert, à
 *   réutiliser ou à refuser comme celui du loyer), et dans une entrée marquée `subject: late_fee` de
 *   `metadata.gateway.transactions` (le montant figé, l'intégration qui l'a initié : le webhook
 *   retrouve l'échéance par cet historique, `paymentsForEvent`) ;
 * - son succès pose `late_fee_paid_at` et `gateway.late_fee_settled_by`, jamais `status`, `paid_at`
 *   ni `amount` ; une pénalité déjà réglée ou plus due en fait un double encaissement (`kind:
 *   late_fee`), signalé comme ceux d'aujourd'hui ;
 * - son remboursement s'impute à la pénalité (`late_fee_refund_amount`), jamais au loyer.
 *
 * Utilisé par {@see PaymentGatewayService}, dont il emprunte les gardes (réservation, fournisseur,
 * garde de sous-paiement, signalement des doublons).
 */
trait LateFeeAloneCheckout
{
    /** La marque d'une entrée de `gateway.transactions` ouverte pour la pénalité seule. */
    public const SUBJECT_LATE_FEE = 'late_fee';

    /**
     * La pénalité seule se paie-t-elle en ligne ? Elle reste due sur un loyer payé, l'agence du bail
     * encaisse ses pénalités en ligne (`Agency::collectsLateFeesOnline()`, réglage lu maintenant), et
     * un fournisseur au moins l'encaisse sur une intégration DE L'AGENCE ({@see lateFeeAloneProviders()}).
     * Le lien, la page publique, la ressource et l'initiation lisent cette seule réponse.
     */
    public function lateFeeAloneCollectibleOnline(LeasePayment $payment): bool
    {
        return $this->lateFeeAloneProviders($payment) !== [];
    }

    /** Le montant que demande le lien de la pénalité seule ; `0` quand elle ne se paie pas en ligne. */
    public function lateFeeAloneDue(LeasePayment $payment): float
    {
        return $this->lateFeeAloneCollectibleOnline($payment)
            ? $this->roundToCurrencyUnit($payment->lateFeeOutstanding(), $payment)
            : 0.0;
    }

    /**
     * Les fournisseurs que {@see initiateLateFeeAlone()} acceptera : ceux de `availableProviders()`
     * dont l'intégration résolue appartient à l'agence du bail. Décision du porteur (TCK-2778, 1a,
     * 2026-11-13) — une intégration GLOBALE encaisserait la pénalité sur le compte de la plateforme,
     * que ni le rapprochement de l'agence ni les reversements ne savent rendre à qui elle revient : le
     * repli global n'est pas proposé ici (ticket de suite, comptabilité). Aucun quand la pénalité seule
     * n'est pas due, ou que l'agence ne l'encaisse pas en ligne.
     *
     * @return list<PaymentProvider>
     */
    public function lateFeeAloneProviders(LeasePayment $payment): array
    {
        $agencyId = $payment->lease?->agency_id;
        if ($agencyId === null || ! $payment->lateFeeAloneOutstanding()
            || ! ($payment->lease?->agency?->collectsLateFeesOnline() ?? false)) {
            return [];
        }

        return array_values(array_filter(
            $this->availableProviders($payment),
            fn (PaymentProvider $provider): bool => (int) ($this->resolveIntegration($provider, (int) $agencyId)?->agency_id ?? 0) === (int) $agencyId,
        ));
    }

    /**
     * Initie le checkout de la pénalité seule. Les trois temps de {@see initiate()} : sous verrou la
     * réservation, hors transaction l'appel au fournisseur, sous verrou l'enregistrement.
     *
     * @param  array<string,mixed>  $meta
     */
    public function initiateLateFeeAlone(LeasePayment $payment, PaymentProvider $provider, array $meta = []): CheckoutSession
    {
        return $this->initiateWith(
            $payment,
            $meta,
            fn (): CheckoutSession|array => $this->reserveLateFeeAloneInitiation($payment, $provider),
            fn (CheckoutSession $session, array $reservation): CheckoutSession|ApiError => $this->recordReservedLateFeeAloneInitiation($payment, $provider, $session, $reservation),
        );
    }

    /** Le checkout de la pénalité seule encore OUVERT, aux règles de {@see openCheckout()} ; `null` sinon. */
    public function openLateFeeAloneCheckout(LeasePayment $payment): ?array
    {
        $gateway = is_array($payment->metadata['gateway'] ?? null) ? $payment->metadata['gateway'] : [];

        return $this->liveCheckout($gateway['late_fee_checkout'] ?? null);
    }

    /**
     * Passe outre au checkout ouvert de la pénalité seule, comme {@see supersedeOpenCheckout()} pour
     * celui du loyer : « Marquer la pénalité réglée » l'écarte, et payé quand même, il devient un
     * double encaissement signalé. Pose l'attribut ; la sauvegarde est celle de l'appelant.
     *
     * @return array<string,mixed>|null
     */
    public function supersedeLateFeeAloneCheckout(LeasePayment $payment, string $reason): ?array
    {
        $open = $this->openLateFeeAloneCheckout($payment);
        if ($open === null) {
            return null;
        }

        $now = now()->toIso8601String();
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $meta['gateway']['late_fee_checkout']['superseded_at'] = $now;
        $meta['gateway']['late_fee_checkout']['superseded_reason'] = $reason;
        foreach (is_array($meta['gateway']['transactions'] ?? null) ? $meta['gateway']['transactions'] : [] as $i => $entry) {
            if (($entry['transaction_id'] ?? null) === ($open['transaction_id'] ?? null)) {
                $meta['gateway']['transactions'][$i]['superseded_at'] = $now;
            }
        }
        $payment->metadata = $meta;

        return $open;
    }

    /**
     * La vérification forcée du DERNIER checkout de la pénalité seule (la page publique d'un lien
     * `late_fee`, au retour du fournisseur) ; `null` sans checkout.
     */
    public function verifyLateFeeAlone(LeasePayment $payment): ?PaymentDriverStatus
    {
        $checkout = $payment->metadata['gateway']['late_fee_checkout'] ?? null;
        $transactionId = is_array($checkout) ? (string) ($checkout['transaction_id'] ?? '') : '';
        $provider = is_array($checkout) ? (string) ($checkout['provider'] ?? '') : '';
        if ($transactionId === '' || $provider === '') {
            return null;
        }

        return $this->verifyTransaction($payment, $provider, $transactionId);
    }

    /**
     * Cette transaction est-elle un checkout de la pénalité seule ? Son entrée de
     * `gateway.transactions` le dit (`subject: late_fee`).
     *
     * @param  array<string,mixed>  $meta
     */
    protected function isLateFeeAloneTransaction(array $meta, ?string $transactionId): bool
    {
        if ($transactionId === null || $transactionId === '') {
            return false;
        }

        return $this->lateFeeAloneEntry($meta, $transactionId) !== null;
    }

    /**
     * @param  array<string,mixed>  $meta
     * @return array<string,mixed>|null
     */
    private function lateFeeAloneEntry(array $meta, string $transactionId): ?array
    {
        foreach (is_array($meta['gateway']['transactions'] ?? null) ? $meta['gateway']['transactions'] : [] as $entry) {
            if (is_array($entry) && ($entry['transaction_id'] ?? null) === $transactionId
                && ($entry['subject'] ?? null) === self::SUBJECT_LATE_FEE) {
                return $entry;
            }
        }

        return null;
    }

    /**
     * L'étape 1, sous verrou : rend le checkout ouvert à réutiliser, ou la réservation posée.
     *
     * @return CheckoutSession|array{token: string, driver: PaymentDriverContract, integration: Integration, amount: float, amount_cents: int, currency: string}
     */
    private function reserveLateFeeAloneInitiation(LeasePayment $payment, PaymentProvider $provider): CheckoutSession|array
    {
        // Rien à payer seul : le loyer est dû (son lien le fait payer, pénalité comprise), ou la
        // pénalité est réglée, nulle, ou l'échéance annulée, remboursée, caution rendue.
        abort_code_unless($payment->lateFeeAloneOutstanding(), 409, 'payment.not_payable');
        abort_code_unless($this->lateFeeAloneCollectibleOnline($payment), 409, 'payment.late_fee_not_collected_online');

        // Le montant est la pénalité restante, FIGÉE ici — jamais le loyer.
        $amount = $this->lateFeeAloneDue($payment);

        $open = $this->openLateFeeAloneCheckout($payment);
        if ($open !== null) {
            $sameAmount = abs((float) ($open['amount'] ?? -1.0) - $amount) < 0.005;
            if (($open['provider'] ?? null) !== $provider->value || ! $sameAmount) {
                $this->refuseOpenCheckout($payment, $open);
            }

            return new CheckoutSession((string) $open['checkout_url'], (string) $open['transaction_id'], $provider->value);
        }

        $pending = $this->pendingReservation($payment);
        if ($pending !== null) {
            $this->refuseReservation($payment, $pending);
        }

        $integration = $this->usableIntegration($payment, $provider);
        // Décision 1a — jamais l'intégration globale : le fournisseur doit être servi par l'agence.
        abort_code_unless(in_array($provider, $this->lateFeeAloneProviders($payment), true), 422, 'payment.provider_not_available', ['provider' => $provider->value]);

        // Règle n°3 du CLAUDE.md : entier ×100 à la frontière du driver, que le driver local re-divise.
        $amountCents = (int) round($amount * 100);
        abort_code_if($amountCents <= 0, 409, 'payment.not_payable');

        return [
            'token' => $this->reserve($payment, $provider, $amount),
            'driver' => $this->driverFor($integration),
            'integration' => $integration,
            'amount' => $amount,
            'amount_cents' => $amountCents,
            'currency' => $this->paymentCurrency($payment),
        ];
    }

    /**
     * L'étape 3, sous verrou, sur la ligne relue : l'enregistrement, ou le refus à lever après la
     * transaction.
     *
     * @param  array{token: string, integration: Integration, amount: float}  $reservation
     */
    private function recordReservedLateFeeAloneInitiation(LeasePayment $payment, PaymentProvider $provider, CheckoutSession $session, array $reservation): CheckoutSession|ApiError
    {
        $ours = ($this->reservationOn($payment)['token'] ?? null) === $reservation['token'];
        if (! $ours) {
            $open = $this->openLateFeeAloneCheckout($payment);
            $pending = $this->pendingReservation($payment);
            if ($open !== null || $pending !== null) {
                $this->logUnrecordedCheckout($payment, $provider, $session, 'reservation_taken');

                try {
                    $open !== null ? $this->refuseOpenCheckout($payment, $open) : $this->refuseReservation($payment, $pending);
                } catch (ApiError $refusal) {
                    return $refusal;
                }
            }
        }

        // Réglée à l'agence (ou plus due) pendant l'appel : le checkout n'est ni enregistré ni rendu.
        if (! $this->lateFeeAloneCollectibleOnline($payment)) {
            $this->clearReservation($payment, $reservation['token']);
            $this->logUnrecordedCheckout($payment, $provider, $session, 'not_payable');

            return new ApiError(409, 'payment.not_payable');
        }

        $now = now()->toIso8601String();
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $gateway = is_array($meta['gateway'] ?? null) ? $meta['gateway'] : [];
        unset($gateway['initiating']);
        $gateway['transactions'] = [
            ...(is_array($gateway['transactions'] ?? null) ? $gateway['transactions'] : []),
            [
                'transaction_id' => $session->transactionId,
                'provider' => $provider->value,
                'integration_id' => $reservation['integration']->id,
                'amount' => $reservation['amount'],
                // Le checkout ne porte QUE la pénalité : toute sa part en est.
                'late_fee_included' => true,
                'late_fee_amount' => $reservation['amount'],
                'subject' => self::SUBJECT_LATE_FEE,
                'initiated_at' => $now,
            ],
        ];
        $gateway['late_fee_checkout'] = [
            'transaction_id' => $session->transactionId,
            'provider' => $provider->value,
            'integration_id' => $reservation['integration']->id,
            'checkout_url' => $session->checkoutUrl,
            'amount' => $reservation['amount'],
            'initiated_at' => $now,
        ];
        $meta['gateway'] = $gateway;
        $payment->forceFill(['metadata' => $meta])->save();

        $reservation['integration']->forceFill(['last_used_at' => now()])->save();

        return $session;
    }

    /**
     * Un événement du checkout de la pénalité seule. Le loyer n'en apprend rien.
     *
     * @param  array<string,mixed>  $metadata  ceux de l'événement
     * @param  array<string,mixed>  $meta  ceux de la ligne
     */
    protected function applyLateFeeAloneStatus(LeasePayment $payment, string $providerStatus, array $metadata, string $transactionId, array $meta): void
    {
        $entry = $this->lateFeeAloneEntry($meta, $transactionId) ?? [];
        $amount = is_numeric($entry['amount'] ?? null) ? (float) $entry['amount'] : null;
        $gateway = is_array($meta['gateway'] ?? null) ? $meta['gateway'] : [];
        $settledByIt = ($gateway['late_fee_settled_by'] ?? null) === $transactionId;

        switch ($providerStatus) {
            case PaymentDriverStatus::SUCCESS:
                if ($settledByIt || $this->lateFeeAloneDuplicateIndex($meta, $transactionId) !== null) {
                    // Un rejeu (vérification forcée, webhook relivré) : déjà compté.
                    break;
                }
                if ($payment->lateFeeOutstanding() <= 0) {
                    // Réglée entre-temps à l'agence (ou par un autre checkout), ou plus due
                    // (échéance annulée, remboursée) : encaissée deux fois, à rembourser.
                    $meta['gateway_duplicate_payment'] = [
                        ...(is_array($meta['gateway_duplicate_payment'] ?? null) ? $meta['gateway_duplicate_payment'] : []),
                        ['transaction_id' => $transactionId, 'amount' => $amount, 'at' => now()->toIso8601String(), 'kind' => 'late_fee'],
                    ];
                    $this->notifyDuplicatePayment($payment, ['amount' => $amount], 'late_fee');
                    break;
                }

                $this->assertReportedAmountCoversPayment($payment, $metadata, $amount);
                $payment->late_fee_paid_at = now();
                $provider = PaymentProvider::tryFrom((string) ($entry['provider'] ?? ''));
                if ($provider !== null) {
                    // Le moyen de règlement de la PÉNALITÉ, comme « Marquer la pénalité réglée » :
                    // `payment_method` reste celui du loyer.
                    $meta['late_fee_payment_method'] = $provider->paymentMethod()->value;
                }
                $meta['gateway']['late_fee_settled_by'] = $transactionId;
                $meta = $this->applyPendingLateFeeAloneRefund($payment, $meta, $transactionId, $amount);
                break;

            case PaymentDriverStatus::FAILED:
                if ($settledByIt) {
                    break;
                }
                if (($gateway['late_fee_checkout']['transaction_id'] ?? null) === $transactionId) {
                    $meta['gateway']['late_fee_checkout']['last_failed_at'] = now()->toIso8601String();
                }
                foreach (is_array($gateway['transactions'] ?? null) ? $gateway['transactions'] : [] as $i => $candidate) {
                    if (($candidate['transaction_id'] ?? null) === $transactionId) {
                        $meta['gateway']['transactions'][$i]['failed_at'] = now()->toIso8601String();
                    }
                }
                break;

            case PaymentDriverStatus::REFUNDED:
                $duplicate = $this->lateFeeAloneDuplicateIndex($meta, $transactionId);
                if ($settledByIt) {
                    $this->refundLateFeeAlone($payment, $metadata, $amount);
                } elseif ($duplicate !== null) {
                    $meta['gateway_duplicate_payment'][$duplicate]['refunded_at'] ??= now()->toIso8601String();
                } else {
                    // Reçu avant son `paid` (Wave : « Events may arrive out of order ») : il attend
                    // ce `paid`, qui l'applique (le motif de TCK-889).
                    $meta['gateway']['late_fee_pending_refund'] = [
                        ...(is_array($gateway['late_fee_pending_refund'] ?? null) ? $gateway['late_fee_pending_refund'] : []),
                        ['transaction_id' => $transactionId, 'amount' => $metadata['amount'] ?? null, 'currency' => $metadata['currency'] ?? null, 'at' => now()->toIso8601String()],
                    ];
                    Log::warning('payment_webhook_refund_before_paid', [
                        'payable' => $payment::class,
                        'payable_id' => $payment->getKey(),
                        'transaction_id' => $transactionId,
                    ]);
                }
                break;
        }

        $payment->metadata = $meta;
        $payment->save();
    }

    /**
     * Le remboursement de la pénalité seule : s'impute à la pénalité, jamais au loyer — ni `status`,
     * ni `refund_amount`. Une pénalité rendue est remise : `late_fee_paid_at` garde sa valeur
     * (P206.04, ADR-0039, amendement du 2026-10-24, point 7).
     *
     * @param  array<string,mixed>  $metadata
     */
    private function refundLateFeeAlone(LeasePayment $payment, array $metadata, ?float $amount): void
    {
        $cap = $amount ?? $this->roundToCurrencyUnit((float) $payment->late_fee_amount, $payment);
        $reported = $metadata['amount'] ?? null;
        $currency = isset($metadata['currency']) ? strtoupper((string) $metadata['currency']) : null;
        $refund = is_numeric($reported) && (float) $reported > 0
            && ($currency === null || $currency === strtoupper($this->paymentCurrency($payment)))
            ? min((float) $reported, $cap)
            : $cap;

        $payment->late_fee_refund_amount = min($cap, (float) ($payment->late_fee_refund_amount ?? 0) + $refund);
    }

    /**
     * @param  array<string,mixed>  $meta
     * @return array<string,mixed>
     */
    private function applyPendingLateFeeAloneRefund(LeasePayment $payment, array $meta, string $transactionId, ?float $amount): array
    {
        $pending = is_array($meta['gateway']['late_fee_pending_refund'] ?? null) ? $meta['gateway']['late_fee_pending_refund'] : [];
        $refund = null;
        foreach ($pending as $i => $candidate) {
            if (($candidate['transaction_id'] ?? null) === $transactionId) {
                $refund = $candidate;
                unset($pending[$i]);
            }
        }
        if ($refund === null) {
            return $meta;
        }

        if ($pending === []) {
            unset($meta['gateway']['late_fee_pending_refund']);
        } else {
            $meta['gateway']['late_fee_pending_refund'] = array_values($pending);
        }
        $this->refundLateFeeAlone($payment, $refund, $amount);

        return $meta;
    }

    /**
     * L'entrée `gateway_duplicate_payment` de la pénalité seule qu'a laissée CETTE transaction.
     *
     * @param  array<string,mixed>  $meta
     */
    private function lateFeeAloneDuplicateIndex(array $meta, string $transactionId): ?int
    {
        foreach (is_array($meta['gateway_duplicate_payment'] ?? null) ? $meta['gateway_duplicate_payment'] : [] as $i => $entry) {
            if (($entry['transaction_id'] ?? null) === $transactionId && ($entry['kind'] ?? null) === 'late_fee') {
                return (int) $i;
            }
        }

        return null;
    }
}
