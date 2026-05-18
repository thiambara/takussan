<?php

namespace Tests\Feature\Services;

use App\Events\Lease\LeaseRentReviewed;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Services\Lease\RentReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class RentReviewServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The listener calls Notification::send($tenant.user, …). Faking
        // here keeps the listener body exercised without requiring the
        // (intentionally absent) `notifications` table.
        Notification::fake();
        // Permissions registered by the seeder are required for
        // `givePermissionTo('leases.rent_review_force')` to resolve.
    }

    public function test_review_updates_rent_and_writes_activity_log(): void
    {
        Event::fake();
        [$service, $lease, $actor] = $this->scaffold();

        $result = $service->review($lease, $actor, [
            'new_rent' => 220_000,
            'reason' => 'Annual indexation',
        ]);

        $this->assertSame(220_000.0, (float) $result->monthly_rent);

        $log = Activity::query()
            ->where('subject_type', Lease::class)
            ->where('subject_id', $lease->id)
            ->where('event', 'lease_rent_reviewed')
            ->firstOrFail();

        $this->assertSame(200_000.0, (float) $log->properties['old_rent']);
        $this->assertSame(220_000.0, (float) $log->properties['new_rent']);
        $this->assertSame('Annual indexation', $log->properties['reason']);
        $this->assertSame(now()->toDateString(), $log->properties['effective_date']);
        $this->assertSame(10.0, (float) $log->properties['variation_pct']);
        $this->assertFalse($log->properties['forced']);

        Event::assertDispatched(LeaseRentReviewed::class);
    }

    public function test_review_rejects_when_reason_too_short(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        $this->expectException(ValidationException::class);
        $service->review($lease, $actor, [
            'new_rent' => 210_000,
            'reason' => 'no',
        ]);
    }

    public function test_review_rejects_excessive_variation_without_force(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        // 200_000 → 260_000 = 30 % variation, default cap 20 %.
        $this->expectException(ValidationException::class);
        $service->review($lease, $actor, [
            'new_rent' => 260_000,
            'reason' => 'Substantial increase',
        ]);
    }

    public function test_review_accepts_excessive_variation_when_forced_with_permission(): void
    {
        [$service, $lease, $actor] = $this->scaffold();
        // TCK-278 — `leases.rent_review_force` reste réservé au super_admin
        // (bypass via Gate::before). Promouvoir l'actor.
        $this->materializeRoleProfile($actor, 'super_admin');

        $result = $service->review($lease, $actor, [
            'new_rent' => 260_000,
            'reason' => 'Substantial increase',
            'force' => true,
        ]);

        $this->assertSame(260_000.0, (float) $result->monthly_rent);

        $log = Activity::query()
            ->where('event', 'lease_rent_reviewed')
            ->orderByDesc('id')->first();
        $this->assertTrue($log->properties['forced']);
    }

    public function test_review_rejects_when_status_not_active(): void
    {
        [$service, $lease, $actor] = $this->scaffold();
        $lease->forceFill(['status' => LeaseStatus::Draft])->save();

        $this->expectException(ValidationException::class);
        $service->review($lease->fresh(), $actor, [
            'new_rent' => 210_000,
            'reason' => 'Test',
        ]);
    }

    public function test_review_rejects_back_dating(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        $this->expectException(ValidationException::class);
        $service->review($lease, $actor, [
            'new_rent' => 210_000,
            'reason' => 'Back-dated',
            'effective_date' => now()->subDay()->toDateString(),
        ]);
    }

    public function test_review_uses_setting_for_max_pct_when_present(): void
    {
        [$service, $lease, $actor] = $this->scaffold();
        Setting::query()->create([
            'key' => RentReviewService::SETTING_KEY,
            'value' => ['value' => 50],
            'scope' => 'global',
        ]);

        // 40 % variation should now pass without force.
        $result = $service->review($lease, $actor, [
            'new_rent' => 280_000,
            'reason' => 'Within elevated threshold',
        ]);
        $this->assertSame(280_000.0, (float) $result->monthly_rent);
    }

    public function test_review_force_without_permission_still_rejects(): void
    {
        [$service, $lease, $actor] = $this->scaffold();
        // No permission granted.

        $this->expectException(ValidationException::class);
        $service->review($lease, $actor, [
            'new_rent' => 260_000,
            'reason' => 'Trying to force',
            'force' => true,
        ]);
    }

    /**
     * @return array{0: RentReviewService, 1: Lease, 2: User}
     */
    private function scaffold(): array
    {
        $service = app(RentReviewService::class);
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 200_000,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        return [$service, $lease, $landlord];
    }
}
