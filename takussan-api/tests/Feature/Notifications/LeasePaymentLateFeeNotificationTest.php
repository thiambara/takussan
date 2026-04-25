<?php

namespace Tests\Feature\Notifications;

use App\Events\Lease\LeasePaymentLateFeeApplied;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\LeasePaymentLateFeeNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class LeasePaymentLateFeeNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_event_triggers_notification_to_tenant_user(): void
    {
        Notification::fake();

        [$payment, $tenantUser] = $this->scaffold();

        event(new LeasePaymentLateFeeApplied($payment, 5000.0, 5.0, 100_000.0));

        Notification::assertSentTo($tenantUser, LeasePaymentLateFeeNotification::class);
    }

    public function test_via_respects_email_preference_off(): void
    {
        [$payment, $tenantUser] = $this->scaffold();

        NotificationPreference::updateOrCreate(
            [
                'user_id' => $tenantUser->id,
                'event_type' => LeasePaymentLateFeeNotification::EVENT_TYPE,
                'channel' => 'email',
            ],
            ['enabled' => false],
        );

        $notification = new LeasePaymentLateFeeNotification($payment, 5000.0, 5.0, 100_000.0);
        $channels = $notification->via($tenantUser);

        $this->assertContains('database', $channels);
        $this->assertNotContains('mail', $channels);
    }

    public function test_via_includes_email_by_default(): void
    {
        [$payment, $tenantUser] = $this->scaffold();

        $channels = (new LeasePaymentLateFeeNotification($payment, 5000.0, 5.0, 100_000.0))->via($tenantUser);

        $this->assertContains('database', $channels);
        $this->assertContains('mail', $channels);
    }

    /**
     * @return array{0: LeasePayment, 1: User}
     */
    private function scaffold(): array
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Late,
            'late_fee_amount' => 5000,
            'late_fee_applied_at' => now(),
        ]);

        return [$payment->fresh(), $tenantUser];
    }
}
