<?php

namespace App\Services\Notifications\Sms;

use App\Jobs\SendDeferredSmsJob;
use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Support\Facades\DB;

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
        $attemptIndex = array_fill_keys($numbers, 0);
        $remaining = $numbers;

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
            if ($driverId === 'orange') {
                $callable = [];
                foreach ($remaining as $number) {
                    if (! $this->orangeCap->hasCapacity($number)) {
                        $attemptIndex[$number]++;
                        $deferred = SmsResult::deferred($number, 'orange', 'orange_daily_cap_reached');
                        $this->appendAttempt($context['notification_id'] ?? null, $attemptIndex[$number], $deferred);
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
                $remaining = array_values(array_unique(array_merge($skippedDueToCap, $callable)));

                continue;
            }

            if (empty($callable)) {
                // Cap drained the batch; deferred numbers continue.
                $remaining = $skippedDueToCap;

                continue;
            }

            try {
                $batch = $driver->send($callable, $message, $context);
            } catch (\Throwable $e) {
                $batch = [];
                foreach ($callable as $n) {
                    $batch[$n] = SmsResult::failed($n, $driverId, 'driver_exception_'.class_basename($e));
                }
            }

            $next = $skippedDueToCap;
            foreach ($callable as $n) {
                $result = $batch[$n] ?? SmsResult::failed($n, $driverId, 'driver_no_result');
                $attemptIndex[$n]++;
                $this->appendAttempt($context['notification_id'] ?? null, $attemptIndex[$n], $result);
                $finalResults[$n] = $result;
                if ($result->isTerminalSuccess()) {
                    if ($driverId === 'orange') {
                        $this->orangeCap->increment($n);
                    }
                } else {
                    $next[] = $n;
                }
            }
            $remaining = array_values(array_unique($next));
        }

        // Whatever is left after the full chain has no provider that
        // could deliver — finalize with a `no_provider_available`
        // reason so the caller knows to fall back to email.
        foreach ($remaining as $n) {
            if (! isset($finalResults[$n])) {
                $attemptIndex[$n]++;
                $finalResults[$n] = SmsResult::failed($n, $this->id(), 'no_provider_available');
                $this->appendAttempt($context['notification_id'] ?? null, $attemptIndex[$n], $finalResults[$n]);
            }
        }

        return $finalResults;
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
            $deferred = SmsResult::deferred($r, $this->id(), 'quiet_hours');
            $this->appendAttempt($context['notification_id'] ?? null, 1, $deferred);
            $results[$r] = $deferred;
        }

        return $results;
    }

    private function hasIntegrationFor(string $driverId, ?int $agencyId): bool
    {
        if ($driverId === 'log') {
            return true;
        }
        $providerKey = (string) $this->config->get(
            "sms.integration_providers.{$driverId}",
            "sms_{$driverId}",
        );

        return $this->integrations->find($agencyId, $providerKey) !== null;
    }

    private function appendAttempt(?int $notificationId, int $attempt, SmsResult $result): void
    {
        if (! $notificationId) {
            return;
        }
        // Insert into the normalised `notification_delivery_attempts`
        // table. The unique index on (provider, provider_message_id)
        // makes DLR webhook lookups O(1) and prevents substring
        // collisions across notifications. Inserting with the
        // notification's row locked guarantees a stable per-notification
        // attempt sequence under concurrent appends.
        DB::transaction(function () use ($notificationId, $attempt, $result): void {
            $notification = AppNotification::query()->lockForUpdate()->find($notificationId);
            if (! $notification) {
                return;
            }
            NotificationDeliveryAttempt::query()->create([
                'app_notification_id' => $notification->id,
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
            ]);
        });
    }
}
