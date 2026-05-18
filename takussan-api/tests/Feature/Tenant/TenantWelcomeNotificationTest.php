<?php

namespace Tests\Feature\Tenant;

use App\Events\Lease\LeaseActivated;
use App\Listeners\Lease\SendTenantWelcomeNotification;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use App\Notifications\TenantWelcomeNotification;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-265 — Coverage for the welcome notification chain:
 *   activate() → LeaseActivated → SendTenantWelcomeNotification
 *     → TenantWelcomeNotification + activity log + tenant_welcomed_at stamp.
 */
class TenantWelcomeNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_activating_a_lease_dispatches_the_event(): void
    {
        Event::fake([LeaseActivated::class]);

        [$service, $lease] = $this->scaffoldDraft();
        $service->activate($lease);

        Event::assertDispatched(LeaseActivated::class, function (LeaseActivated $event) use ($lease) {
            return $event->lease->id === $lease->id;
        });
    }

    public function test_listener_sends_welcome_notification_to_tenant_user(): void
    {
        Notification::fake();
        [, $lease, $tenantUser] = $this->scaffoldDraftWithTenantUser();

        (new SendTenantWelcomeNotification)->handle(new LeaseActivated($lease));

        Notification::assertSentTo($tenantUser, TenantWelcomeNotification::class);

        $fresh = $lease->fresh();
        $this->assertNotNull($fresh->tenant_welcomed_at, 'tenant_welcomed_at should be stamped');
    }

    public function test_listener_is_idempotent_when_tenant_welcomed_at_is_set(): void
    {
        Notification::fake();
        [, $lease, $tenantUser] = $this->scaffoldDraftWithTenantUser();

        // First pass — sends the notification.
        (new SendTenantWelcomeNotification)->handle(new LeaseActivated($lease->fresh()));
        Notification::assertSentTo($tenantUser, TenantWelcomeNotification::class);

        // Second pass — must be a no-op even though the event fires again
        // (e.g. lease re-activated after a manual ops bounce).
        Notification::fake();
        (new SendTenantWelcomeNotification)->handle(new LeaseActivated($lease->fresh()));
        Notification::assertNothingSent();
    }

    public function test_listener_logs_activity_with_lease_id(): void
    {
        Notification::fake();
        [, $lease, $tenantUser] = $this->scaffoldDraftWithTenantUser();

        (new SendTenantWelcomeNotification)->handle(new LeaseActivated($lease));

        $entry = Activity::query()
            ->where('description', 'tenant_welcomed')
            ->latest('id')
            ->first();

        $this->assertNotNull($entry, 'an activity log entry should be created');
        $this->assertSame($tenantUser->id, $entry->causer_id);
        $this->assertSame(Lease::class, $entry->subject_type);
        $this->assertSame($lease->id, (int) $entry->subject_id);
        $this->assertSame($lease->id, (int) ($entry->properties['lease_id'] ?? 0));
    }

    public function test_listener_no_ops_when_tenant_has_no_user_account_yet(): void
    {
        Notification::fake();

        $tenant = Customer::factory()->create(['user_id' => null]);
        $lease = Lease::factory()->active()->create([
            'tenant_id' => $tenant->id,
            'tenant_welcomed_at' => null,
        ]);

        (new SendTenantWelcomeNotification)->handle(new LeaseActivated($lease));

        Notification::assertNothingSent();
        // The sentinel is still stamped so we don't retry forever.
        $this->assertNotNull($lease->fresh()->tenant_welcomed_at);
    }

    /**
     * @return array{0: LeaseService, 1: Lease}
     */
    private function scaffoldDraft(): array
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => LeaseStatus::Draft,
        ]);

        return [app(LeaseService::class), $lease->fresh()];
    }

    /**
     * @return array{0: LeaseService, 1: Lease, 2: User}
     */
    private function scaffoldDraftWithTenantUser(): array
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->active()->create([
            'tenant_id' => $tenant->id,
            'tenant_welcomed_at' => null,
        ]);

        return [app(LeaseService::class), $lease->fresh(), $tenantUser];
    }
}
