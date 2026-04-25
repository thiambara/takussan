<?php

namespace Tests\Feature\Notifications;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use App\Notifications\LeaseDepositRefundNotification;
use App\Services\Lease\DepositRefundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-088 — Verifies that the tenant's User receives a
 * `LeaseDepositRefundNotification` after a refund, and that the payload
 * carries the refund/retention split + media attachment URLs.
 */
class LeaseDepositRefundNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_notification_is_sent_to_tenant_user_with_attachments(): void
    {
        Storage::fake('public');
        Notification::fake();

        $tenantUser = User::factory()->create();
        $tenantCustomer = Customer::factory()->create([
            'user_id' => $tenantUser->id,
        ]);
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenantCustomer->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        $lease->addMedia(UploadedFile::fake()->image('damage.jpg'))
            ->toMediaCollection('lease_deposit_refund');

        app(DepositRefundService::class)->refund($lease, $landlord, [
            'amount' => 300000,
            'reason' => 'Réparations',
        ]);

        Notification::assertSentTo(
            $tenantUser,
            LeaseDepositRefundNotification::class,
            function (LeaseDepositRefundNotification $notification) {
                $payload = $notification->toArray((object) []);

                return $payload['refunded'] === 300000.0
                    && $payload['retained'] === 200000.0
                    && $payload['reason'] === 'Réparations'
                    && count($payload['attachments']) === 1;
            }
        );
    }

    public function test_no_notification_when_tenant_has_no_user(): void
    {
        Notification::fake();

        $tenantCustomer = Customer::factory()->create(['user_id' => null]);
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenantCustomer->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        app(DepositRefundService::class)->refund($lease, $landlord, ['amount' => 500000]);

        Notification::assertNothingSent();
    }
}
