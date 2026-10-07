<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\PlatformPayout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-594 (AC9) — les quatre yeux de la chaîne plateforme : SA1 clôture, SA2 approuve, SA1 paie.
 * Avant : un seul super-admin passait les trois gestes.
 */
class PlatformPayoutSegregationTest extends TestCase
{
    use RefreshDatabase;

    private function closeOne(Agency $agency): PlatformPayout
    {
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
        ]);
        BookingPayment::factory()->create([
            'booking_id' => $booking->id, 'amount' => 100_000,
            'status' => PaymentStatus::Paid, 'paid_at' => '2026-09-15 10:00:00',
        ]);

        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-09-30',
        ])->assertCreated();

        return PlatformPayout::query()->where('agency_id', $agency->id)->firstOrFail();
    }

    public function test_ac9_close_approve_and_pay_are_held_by_two_super_admins_alternately(): void
    {
        $sa2 = $this->actingAsRole('super_admin');
        $sa1 = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['is_verified' => true]);

        $payout = $this->closeOne($agency);
        $this->assertSame($sa1->id, $payout->closed_by_id);

        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertForbidden();
        $this->assertSame(PlatformPayoutStatus::Pending, $payout->fresh()->status);

        $this->actingAs($sa2);
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertOk();
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", [
            'processed_at' => '2026-10-01T10:00:00Z',
            'payment_reference' => 'VIR-1',
        ])->assertForbidden();

        $this->actingAs($sa1);
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", [
            'processed_at' => '2026-10-01T10:00:00Z',
        ])->assertStatus(422)->assertJsonValidationErrors(['payment_reference']);
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", [
            'processed_at' => '2026-10-01T10:00:00Z',
            'payment_reference' => '   ',
        ])->assertStatus(422);
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", [
            'processed_at' => '2026-10-01T10:00:00Z',
            'payment_reference' => 'VIR-2026-0042',
        ])->assertOk();

        $payout->refresh();
        $this->assertSame(
            [$sa1->id, $sa2->id, $sa1->id, 'VIR-2026-0042', PlatformPayoutStatus::Paid],
            [$payout->closed_by_id, $payout->approved_by, $payout->paid_by_id, $payout->payment_reference, $payout->status],
        );
        $this->assertNotNull($payout->approved_at);
    }

    public function test_a_super_admin_who_is_staff_of_the_agency_neither_approves_nor_pays_it(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['is_verified' => true]);
        $payout = $this->closeOne($agency);

        $member = $this->actingAsRole('super_admin');
        AgencyAdminProfile::factory()->create(['user_id' => $member->id, 'agency_id' => $agency->id]);
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertForbidden();

        $founder = $this->actingAsRole('super_admin');
        $agency->forceFill(['primary_admin_id' => $founder->id])->save();
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertForbidden();

        $this->assertSame(PlatformPayoutStatus::Pending, $payout->fresh()->status);
    }

    public function test_an_approval_is_not_replayed(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['is_verified' => true]);
        $payout = $this->closeOne($agency);

        $approver = $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertOk();
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertStatus(422);

        $this->assertSame($approver->id, $payout->fresh()->approved_by);
        $this->assertInstanceOf(User::class, User::find($approver->id));
    }
}
