<?php

namespace App\Services\Notifications\Sms;

use App\Jobs\SendDeferredSmsJob;
use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Support\Logging\SafeExceptionContext;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * TCK-102 / TCK-110 — Composite SMS driver. Groups recipients by
 * operator and walks the configured fallback chain for each group,
 * recording per-recipient attempts as
 * {@see NotificationDeliveryAttempt} rows (the legacy JSON column
 * `app_notifications.delivery_attempts` is no longer written to —
 * see TCK-110 for the migration).
 *
 * - ARTP quiet-hours window → defers non-critical sends until 06h via
 *   {@see SendDeferredSmsJob}.
 * - Orange 3/day/MSISDN cap → pre-filtered: numbers over quota skip
 *   Orange and roll directly to the next driver with status
 *   `deferred_to_fallback` and reason `orange_daily_cap_reached`.
 * - Missing Integration → silently skipped, router moves to next driver.
 * - TCK-766 (P27.02) — an AMBIGUOUS failure (timeout, 5xx: the provider may
 *   have accepted the message) ends the chain for that number, so it is not
 *   sent twice; a one-time code (`is_otp`) keeps the fallback.
 * - TCK-842 (P27.04) — the whole walk shares one time budget
 *   ({@see SmsTimeBudget}): no driver starts once it is spent, and the numbers
 *   left end with `time_budget_exhausted`.
 * - P72.03 (TCK-1093) — a one-time code skips, for 15 minutes and per number,
 *   the provider whose DLR came back `failed` ({@see OtpLateFailureMemory}),
 *   unless that would skip the whole chain.
 * - P72.04 (TCK-1354) — the same DLR lifts the code's resend cooldown, named by
 *   the sender in `otp_resend_key`.
 */
class SmsRouterDriver implements SmsDriverInterface
{
    /**
     * @param  array<string, SmsDriverInterface>  $drivers  map driver-id → instance
     */
    public function __construct(
        private readonly array $drivers,
        private readonly OperatorResolver $operators,
        private readonly QuietHoursGuard $quietHours,
        private readonly OrangeDailyCapTracker $orangeCap,
        private readonly IntegrationLocator $integrations,
        private readonly ConfigRepository $config,
        // P72.03 (TCK-1093) — sans liaison propre : `AppServiceProvider` construit le routeur
        // argument par argument, et la mémoire n'a d'autre dépendance que le cache.
        private readonly OtpLateFailureMemory $otpFailures = new OtpLateFailureMemory,
    ) {}

    public function id(): string
    {
        return 'router';
    }

    public function send(array|string $to, string $message, array $context = []): array
    {
        $recipients = $this->normalizeRecipients(is_array($to) ? $to : [$to]);
        if (empty($recipients)) {
            return [];
        }

        $isCritical = (bool) ($context['is_critical'] ?? false);
        $bypassQuiet = (bool) ($context['bypass_quiet_hours'] ?? false);

        if (! $bypassQuiet && $this->quietHours->shouldDefer($isCritical)) {
            return $this->deferAll($recipients, $message, $context);
        }

        $context = SmsTimeBudget::start($context);
        $results = [];
        $groups = $this->operators->groupByOperator($recipients);
        foreach ($groups as $operator => $numbers) {
            $chain = $this->resolveChain((string) $operator);
            $results = array_merge($results, $this->walkChain($chain, $numbers, $message, $context));
        }

        return $results;
    }

    /**
     * @param  list<string>  $rawRecipients
     * @return list<string>
     */
    private function normalizeRecipients(array $rawRecipients): array
    {
        $clean = [];
        foreach ($rawRecipients as $raw) {
            try {
                $clean[] = PhoneNumber::normalize($raw);
            } catch (\InvalidArgumentException $e) {
                throw new \InvalidArgumentException("Invalid recipient: {$raw}", previous: $e);
            }
        }

        return array_values(array_unique($clean));
    }

    /**
     * @return list<string>
     */
    private function resolveChain(string $operator): array
    {
        $chain = $this->config->get("sms.fallback_chains.{$operator}");
        if (! is_array($chain) || empty($chain)) {
            $chain = (array) $this->config->get('sms.fallback_chains.default', []);
        }

        return array_values($chain);
    }

    /**
     * Walk the fallback chain for a homogeneous group of recipients.
     * Each recipient maintains its own `attempt` counter — a number
     * which trips the Orange cap is recorded as attempt #1
     * `deferred_to_fallback` and continues the chain at attempt #2.
     *
     * @param  list<string>  $chain
     * @param  list<string>  $numbers
     * @param  array<string,mixed>  $context
     * @return array<string,SmsResult>
     */
    private function walkChain(array $chain, array $numbers, string $message, array $context): array
    {
        $finalResults = [];
        $isOtp = (bool) ($context['is_otp'] ?? false);
        $attemptIndex = array_fill_keys($numbers, 0);
        $remaining = $numbers;
        $skipProviders = $isOtp ? $this->otpSkips($chain, $numbers) : [];

        foreach ($chain as $driverId) {
            if (empty($remaining)) {
                break;
            }
            $driver = $this->drivers[$driverId] ?? null;
            if (! $driver) {
                continue;
            }

            // Orange-specific upstream cap pre-filter. Numbers over
            // quota record a `deferred_to_fallback` attempt then roll
            // forward to the next driver in the chain — they must NOT
            // exit the loop with the rest of $remaining.
            $callable = $remaining;
            $skippedDueToCap = [];
            // P72.03 (TCK-1093) — un code dont l'accusé est revenu `failed` chez ce fournisseur
            // passe au suivant, sans tentative écrite : il n'a pas été appelé.
            $skippedAfterFailure = array_values(array_filter(
                $callable,
                fn (string $number): bool => in_array($driverId, $skipProviders[$number] ?? [], true),
            ));
            if ($skippedAfterFailure !== []) {
                $callable = array_values(array_diff($callable, $skippedAfterFailure));
            }
            if ($driverId === 'orange') {
                $eligible = $callable;
                $callable = [];
                foreach ($eligible as $number) {
                    if (! $this->orangeCap->hasCapacity($number)) {
                        $attemptIndex[$number]++;
                        $deferred = SmsResult::deferred($number, 'orange', 'orange_daily_cap_reached');
                        $this->appendAttempt($context, $attemptIndex[$number], $deferred);
                        $finalResults[$number] = $deferred;
                        $skippedDueToCap[] = $number;
                    } else {
                        $callable[] = $number;
                    }
                }
            }

            // Skip provider silently if the agency has no active
            // Integration for it (AC8: numéro Orange routé sur LAM
            // si pas d'Integration sms_orange). The numbers stay in
            // $remaining (plus any cap-skipped ones) so the next
            // driver in the chain gets a chance.
            if (! $this->hasIntegrationFor($driverId, $context['agency_id'] ?? null)) {
                $remaining = array_values(array_unique(array_merge($skippedAfterFailure, $skippedDueToCap, $callable)));

                continue;
            }

            if (empty($callable)) {
                // Cap drained the batch; deferred numbers continue.
                $remaining = array_values(array_unique(array_merge($skippedAfterFailure, $skippedDueToCap)));

                continue;
            }

            if (SmsTimeBudget::exhausted($context)) {
                $this->endOnSpentBudget($remaining, $driverId, $attemptIndex, $finalResults, $context);
                $remaining = [];

                break;
            }

            // TCK-2326 (P203.05) — l'intégration que le fournisseur va prendre, la même instance
            // (`IntegrationLocator` garde son cache le temps de la requête ou du job).
            $integrationId = $this->integrationFor($driverId, $context['agency_id'] ?? null)?->id;
            try {
                $batch = $driver->send($callable, $message, $context);
            } catch (\Throwable $e) {
                $batch = [];
                foreach ($callable as $n) {
                    $batch[$n] = SmsResult::failed($n, $driverId, 'driver_exception_'.class_basename($e), AmbiguousDelivery::fromThrowable($e));
                }
            }

            $next = array_merge($skippedAfterFailure, $skippedDueToCap);
            foreach ($callable as $n) {
                $result = $batch[$n] ?? SmsResult::failed($n, $driverId, 'driver_no_result');
                $attemptIndex[$n]++;
                $this->appendAttempt($context, $attemptIndex[$n], $result, $integrationId);
                $finalResults[$n] = $result;
                if ($result->isTerminalSuccess()) {
                    if ($driverId === 'orange') {
                        $this->orangeCap->increment($n);
                    }
                    if ($isOtp && $result->providerMessageId) {
                        $resendKey = $context['otp_resend_key'] ?? null;
                        $this->otpFailures->rememberSent($driverId, $result->providerMessageId, $n, is_string($resendKey) ? $resendKey : null);
                    }
                } elseif (! $result->ambiguous || $isOtp) {
                    $next[] = $n;
                }
            }
            $remaining = array_values(array_unique($next));
        }

        // Whatever is left after the full chain has no provider that
        // could deliver — finalize with a `no_provider_available`
        // reason. Nothing falls back to email on its own: TCK-799 (P11.05)
        // logs a warning, the caller decides what to tell the user.
        foreach ($remaining as $n) {
            if (! isset($finalResults[$n])) {
                $attemptIndex[$n]++;
                $finalResults[$n] = SmsResult::failed($n, $this->id(), 'no_provider_available');
                $this->appendAttempt($context, $attemptIndex[$n], $finalResults[$n]);
                Log::warning('[sms.router] aucun fournisseur disponible', [
                    'phone_suffix' => substr($n, -4),
                    'chain' => $chain,
                    'agency_id' => $context['agency_id'] ?? null,
                    'event_type' => $context['event_type'] ?? null,
                    'is_critical' => (bool) ($context['is_critical'] ?? false),
                    'notification_id' => $context['notification_id'] ?? null,
                ]);
            }
        }

        return $finalResults;
    }

    /**
     * P72.03 (TCK-1093) — par numéro, les fournisseurs de la chaîne à sauter pour un code. Quand ils
     * le seraient tous, aucun ne l'est : mieux vaut retenter un fournisseur qui a échoué que ne rien
     * envoyer.
     *
     * @param  list<string>  $chain
     * @param  list<string>  $numbers
     * @return array<string, list<string>>
     */
    private function otpSkips(array $chain, array $numbers): array
    {
        $skips = [];
        foreach ($numbers as $number) {
            $failed = array_values(array_intersect($chain, $this->otpFailures->failedProviders($number)));
            $usable = array_diff(array_intersect($chain, array_keys($this->drivers)), $failed);
            if ($failed !== [] && $usable !== []) {
                $skips[$number] = $failed;
            }
        }

        return $skips;
    }

    /**
     * TCK-842 (P27.04) — the budget is spent before `$driverId` could be tried:
     * nothing more is sent, and the reason is written, not `no_provider_available`.
     *
     * @param  list<string>  $numbers
     * @param  array<string,int>  $attemptIndex
     * @param  array<string,SmsResult>  $finalResults
     * @param  array<string,mixed>  $context
     */
    private function endOnSpentBudget(array $numbers, string $driverId, array &$attemptIndex, array &$finalResults, array $context): void
    {
        foreach ($numbers as $n) {
            $attemptIndex[$n]++;
            $finalResults[$n] = SmsResult::failed($n, $this->id(), 'time_budget_exhausted');
            $this->appendAttempt($context, $attemptIndex[$n], $finalResults[$n]);
        }
        Log::warning('[sms.router] budget de temps épuisé, chaîne arrêtée', [
            'next_driver' => $driverId,
            'numbers' => count($numbers),
            'budget_seconds' => SmsTimeBudget::CHAIN_SECONDS,
            'agency_id' => $context['agency_id'] ?? null,
            'notification_id' => $context['notification_id'] ?? null,
        ]);
    }

    /**
     * @param  list<string>  $recipients
     * @param  array<string,mixed>  $context
     * @return array<string,SmsResult>
     */
    private function deferAll(array $recipients, string $message, array $context): array
    {
        $delay = $this->quietHours->nextWindowEnd();
        SendDeferredSmsJob::dispatch($recipients, $message, $context)
            ->delay(CarbonImmutable::now()->diffInSeconds($delay, true));
        $results = [];
        foreach ($recipients as $r) {
            $deferred = SmsResult::deferred($r, $this->id(), SmsResult::REASON_QUIET_HOURS);
            $this->appendAttempt($context, 1, $deferred);
            $results[$r] = $deferred;
        }

        return $results;
    }

    private function hasIntegrationFor(string $driverId, ?int $agencyId): bool
    {
        return $driverId === 'log' || $this->integrationFor($driverId, $agencyId) !== null;
    }

    /** L'intégration active du fournisseur pour l'agence, ou celle de la plateforme ; aucune pour `log`. */
    private function integrationFor(string $driverId, ?int $agencyId): ?Integration
    {
        if ($driverId === 'log') {
            return null;
        }
        $providerKey = (string) $this->config->get(
            "sms.integration_providers.{$driverId}",
            "sms_{$driverId}",
        );

        return $this->integrations->find($agencyId, $providerKey);
    }

    /**
     * TCK-767 (P27.03) — never throws: the attempt is written AFTER the provider
     * answered, and an exception here left the router (or rolled the number to
     * the next provider) and made the job resend an SMS already accepted.
     *
     * TCK-799 (P11.05) — an SMS without notification (a contact without an
     * account, a lease signature code) writes its attempt too, unattached.
     *
     * TCK-2326 (P203.05) — the attempt keeps the sending agency (`$context['agency_id']`) and the
     * Integration the provider took; none when no provider was called.
     *
     * @param  array<string,mixed>  $context
     */
    private function appendAttempt(array $context, int $attempt, SmsResult $result, ?int $integrationId = null): void
    {
        $notificationId = $context['notification_id'] ?? null;
        $agencyId = $context['agency_id'] ?? null;
        $trace = ['agency_id' => is_int($agencyId) ? $agencyId : null, 'integration_id' => $integrationId];
        try {
            $this->writeAttempt($notificationId, $attempt, $result, $trace);
        } catch (\Throwable $e) {
            Log::error('[sms.router] tentative non enregistrée', [
                'notification_id' => $notificationId,
                'attempt' => $attempt,
                'provider' => $result->provider,
                'status' => $result->status,
            ] + SafeExceptionContext::of($e));
        }
    }

    /** @param  array{agency_id: ?int, integration_id: ?int}  $trace */
    private function writeAttempt(?int $notificationId, int $attempt, SmsResult $result, array $trace): void
    {
        if (! $notificationId) {
            // Dans sa propre transaction, comme l'autre chemin : imbriquée, c'est un point de
            // sauvegarde, et un échec (identifiant fournisseur en double) n'abandonne pas la
            // transaction de l'appelant (PostgreSQL, 25P02).
            DB::transaction(fn () => NotificationDeliveryAttempt::query()->create(
                ['app_notification_id' => null] + $trace + $this->attemptRow($attempt, $result),
            ));

            return;
        }
        // Insert into the normalised `notification_delivery_attempts`
        // table. The unique index on (provider, provider_message_id)
        // makes DLR webhook lookups O(1) and prevents substring
        // collisions across notifications. Inserting with the
        // notification's row locked guarantees a stable per-notification
        // attempt sequence under concurrent appends.
        DB::transaction(function () use ($notificationId, $attempt, $result, $trace): void {
            $notification = AppNotification::query()->lockForUpdate()->find($notificationId);
            if (! $notification) {
                return;
            }
            NotificationDeliveryAttempt::query()->create(['app_notification_id' => $notification->id] + $trace + $this->attemptRow($attempt, $result));
        });
    }

    /** @return array<string, mixed> */
    private function attemptRow(int $attempt, SmsResult $result): array
    {
        return [
            'attempt' => $attempt,
            'provider' => $result->provider,
            'provider_message_id' => $result->providerMessageId,
            'to' => $result->to,
            'status' => $result->status,
            'failure_reason' => $result->failureReason,
            'cost_estimate' => $result->costEstimate,
            'segments_count' => $result->segmentsCount,
            'sent_at' => $result->sentAt,
            'delivered_at' => $result->deliveredAt,
        ];
    }
}
