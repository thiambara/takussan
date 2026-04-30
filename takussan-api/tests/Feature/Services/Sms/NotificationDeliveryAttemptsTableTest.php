<?php

namespace Tests\Feature\Services\Sms;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-110 — The normalised `notification_delivery_attempts` table
 * with a unique `(provider, provider_message_id)` index is the new
 * source of truth for DLR webhook lookups. This suite covers:
 *
 *   - O(1) DLR lookup by exact match (no LIKE substring).
 *   - The `mtg-77` vs `mtg-770` substring case that broke the old
 *     JSON-column scan.
 *   - Unique-index dedup of the same provider message id.
 *   - Backfill idempotency via the `sms:backfill-delivery-attempts`
 *     command — re-running it on a partially-populated table is safe.
 */
class NotificationDeliveryAttemptsTableTest extends TestCase
{
    use RefreshDatabase;

    private function notification(): AppNotification
    {
        $user = User::factory()->create();

        return AppNotification::factory()->create(['user_id' => $user->id]);
    }

    public function test_dlr_lookup_does_not_match_substring_provider_ids(): void
    {
        $shortIdNotif = $this->notification();
        $longIdNotif = $this->notification();
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $shortIdNotif->id,
            'attempt' => 1,
            'provider' => 'mtarget',
            'provider_message_id' => 'mtg-77',
            'status' => SmsResult::STATUS_SENT,
        ]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $longIdNotif->id,
            'attempt' => 1,
            'provider' => 'mtarget',
            'provider_message_id' => 'mtg-770',
            'status' => SmsResult::STATUS_SENT,
        ]);

        $updater = $this->app->make(DeliveryAttemptUpdater::class);
        $updater->applyStatus(
            provider: 'mtarget',
            providerMessageId: 'mtg-77',
            newStatus: SmsResult::STATUS_DELIVERED,
        );

        $short = NotificationDeliveryAttempt::query()
            ->where('provider_message_id', 'mtg-77')
            ->first();
        $long = NotificationDeliveryAttempt::query()
            ->where('provider_message_id', 'mtg-770')
            ->first();

        $this->assertSame(SmsResult::STATUS_DELIVERED, $short->status);
        // Critical: the substring `mtg-77` MUST NOT have flipped
        // `mtg-770` to `delivered`.
        $this->assertSame(SmsResult::STATUS_SENT, $long->status);
    }

    public function test_unique_index_blocks_duplicate_provider_message_ids(): void
    {
        $a = $this->notification();
        $b = $this->notification();
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $a->id,
            'attempt' => 1,
            'provider' => 'orange',
            'provider_message_id' => 'orange-1',
            'status' => SmsResult::STATUS_SENT,
        ]);

        $this->expectException(UniqueConstraintViolationException::class);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $b->id,
            'attempt' => 1,
            'provider' => 'orange',
            'provider_message_id' => 'orange-1',
            'status' => SmsResult::STATUS_SENT,
        ]);
    }

    public function test_unique_index_allows_same_id_for_different_providers(): void
    {
        $a = $this->notification();
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $a->id,
            'attempt' => 1,
            'provider' => 'orange',
            'provider_message_id' => 'shared-id',
            'status' => SmsResult::STATUS_SENT,
        ]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $a->id,
            'attempt' => 2,
            'provider' => 'mtarget',
            'provider_message_id' => 'shared-id',
            'status' => SmsResult::STATUS_SENT,
        ]);

        $this->assertSame(2, NotificationDeliveryAttempt::query()->count());
    }

    public function test_backfill_command_imports_legacy_json_attempts_idempotently(): void
    {
        // Seed a notification with the legacy JSON `delivery_attempts`
        // payload — bypasses the production write path which now
        // targets the new table.
        $user = User::factory()->create();
        $notification = AppNotification::factory()->create([
            'user_id' => $user->id,
            'delivery_attempts' => [
                [
                    'attempt' => 1,
                    'provider' => 'orange',
                    'provider_message_id' => 'orange-legacy-1',
                    'to' => '+221771111111',
                    'status' => SmsResult::STATUS_SENT,
                    'sent_at' => now()->toAtomString(),
                    'segments_count' => 1,
                ],
                [
                    'attempt' => 2,
                    'provider' => 'lafricamobile',
                    'provider_message_id' => 'lam-legacy-1',
                    'to' => '+221771111111',
                    'status' => SmsResult::STATUS_DELIVERED,
                    'sent_at' => now()->toAtomString(),
                    'delivered_at' => now()->toAtomString(),
                ],
            ],
        ]);

        $this->artisan('sms:backfill-delivery-attempts')->assertExitCode(0);

        $rows = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $notification->id)
            ->orderBy('attempt')
            ->get();
        $this->assertCount(2, $rows);
        $this->assertSame('orange-legacy-1', $rows[0]->provider_message_id);
        $this->assertSame('lam-legacy-1', $rows[1]->provider_message_id);
        $this->assertSame(SmsResult::STATUS_DELIVERED, $rows[1]->status);

        // Re-running is idempotent: unique index swallows the duplicate
        // insert, command exits cleanly.
        $this->artisan('sms:backfill-delivery-attempts')->assertExitCode(0);
        $this->assertSame(2, NotificationDeliveryAttempt::query()->count());
    }
}
