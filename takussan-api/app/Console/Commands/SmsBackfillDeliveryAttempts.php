<?php

namespace App\Console\Commands;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-110 — Backfill the normalised `notification_delivery_attempts`
 * table from the legacy `app_notifications.delivery_attempts` JSON
 * column. Idempotent thanks to the unique index on
 * `(provider, provider_message_id)`: re-running the command after a
 * partial run is safe and only inserts the missing rows.
 *
 * The JSON column itself is dropped by a separate migration that runs
 * once this backfill has been validated in production.
 */
class SmsBackfillDeliveryAttempts extends Command
{
    protected $signature = 'sms:backfill-delivery-attempts {--chunk=200}';

    protected $description = 'Backfill notification_delivery_attempts from the legacy JSON column (TCK-110)';

    public function handle(): int
    {
        if (! Schema::hasColumn('app_notifications', 'delivery_attempts')) {
            $this->info('No legacy column to backfill — done.');

            return self::SUCCESS;
        }

        $chunk = max(1, (int) $this->option('chunk'));
        $totalInserted = 0;
        $totalNotifications = 0;

        AppNotification::query()
            ->whereNotNull('delivery_attempts')
            ->orderBy('id')
            ->chunkById($chunk, function ($notifications) use (&$totalInserted, &$totalNotifications): void {
                foreach ($notifications as $notification) {
                    $attempts = (array) ($notification->getAttribute('delivery_attempts') ?? []);
                    if (empty($attempts)) {
                        continue;
                    }
                    $totalNotifications++;
                    foreach ($attempts as $entry) {
                        $row = $this->normalize($notification->id, $entry);
                        if ($row === null) {
                            continue;
                        }
                        // Idempotent: the unique index on
                        // (provider, provider_message_id) blocks dups
                        // when the command is re-run. We swallow the
                        // unique-constraint violation rather than
                        // upserting so the existing row's status
                        // (potentially already updated by a DLR) is
                        // preserved.
                        try {
                            NotificationDeliveryAttempt::query()->create($row);
                            $totalInserted++;
                        } catch (UniqueConstraintViolationException) {
                            // already backfilled
                        }
                    }
                }
            });

        $this->info("Backfilled {$totalInserted} attempts across {$totalNotifications} notifications.");

        return self::SUCCESS;
    }

    /**
     * @param  array<string,mixed>  $entry
     * @return array<string,mixed>|null
     */
    private function normalize(int $notificationId, array $entry): ?array
    {
        $provider = (string) ($entry['provider'] ?? '');
        if ($provider === '') {
            return null;
        }
        $providerMessageId = $entry['provider_message_id'] ?? null;
        if ($providerMessageId !== null) {
            $providerMessageId = (string) $providerMessageId;
            if ($providerMessageId === '') {
                $providerMessageId = null;
            }
        }
        // Empty-string provider_message_ids must NOT collide on the
        // unique index — store them as NULL so the index can hold many.
        $sentAt = $this->parseDate($entry['sent_at'] ?? null);
        $deliveredAt = $this->parseDate($entry['delivered_at'] ?? null);

        return [
            'app_notification_id' => $notificationId,
            'attempt' => (int) ($entry['attempt'] ?? 1),
            'provider' => $provider,
            'provider_message_id' => $providerMessageId,
            'to' => isset($entry['to']) ? (string) $entry['to'] : null,
            'status' => (string) ($entry['status'] ?? 'sent'),
            'failure_reason' => isset($entry['failure_reason']) && $entry['failure_reason'] !== null
                ? (string) $entry['failure_reason']
                : null,
            'cost_estimate' => isset($entry['cost_estimate']) && $entry['cost_estimate'] !== null
                ? (float) $entry['cost_estimate']
                : null,
            'segments_count' => isset($entry['segments_count']) && $entry['segments_count'] !== null
                ? (int) $entry['segments_count']
                : null,
            'sent_at' => $sentAt,
            'delivered_at' => $deliveredAt,
            'created_at' => $sentAt ?? DB::raw('CURRENT_TIMESTAMP'),
            'updated_at' => $deliveredAt ?? $sentAt ?? DB::raw('CURRENT_TIMESTAMP'),
        ];
    }

    private function parseDate(mixed $raw): ?string
    {
        if (! is_string($raw) || $raw === '') {
            return null;
        }
        try {
            return CarbonImmutable::parse($raw)->toDateTimeString();
        } catch (\Throwable) {
            return null;
        }
    }
}
