<?php

namespace Tests\Feature\Notifications;

use App\Events\Lease\LeaseRenewed;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\LeaseRenewedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class LeaseRenewedNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_event_triggers_notification_to_tenant_user(): void
    {
        Notification::fake();
        [$parent, $child, $tenantUser] = $this->scaffold();

        event(new LeaseRenewed($parent, $child, []));

        Notification::assertSentTo($tenantUser, LeaseRenewedNotification::class);
    }

    public function test_via_respects_email_preference_off(): void
    {
        [$parent, $child, $tenantUser] = $this->scaffold();

        NotificationPreference::updateOrCreate(
            [
                'user_id' => $tenantUser->id,
                'event_type' => LeaseRenewedNotification::EVENT_TYPE,
                'channel' => 'email',
            ],
            ['enabled' => false],
        );

        $channels = (new LeaseRenewedNotification($parent, $child, []))->via($tenantUser);

        $this->assertContains('database', $channels);
        $this->assertNotContains('mail', $channels);
    }

    public function test_via_includes_email_by_default(): void
    {
        [$parent, $child, $tenantUser] = $this->scaffold();

        $channels = (new LeaseRenewedNotification($parent, $child, []))->via($tenantUser);

        $this->assertContains('database', $channels);
        $this->assertContains('mail', $channels);
    }

    /**
     * @return array{0: Lease, 1: Lease, 2: User}
     */
    private function scaffold(): array
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $parent = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => LeaseStatus::Renewed,
        ]);
        $child = Lease::factory()->active()->create([
            'tenant_id' => $tenant->id,
            'renewed_from_lease_id' => $parent->id,
        ]);

        return [$parent->fresh(), $child->fresh(), $tenantUser];
    }
}
