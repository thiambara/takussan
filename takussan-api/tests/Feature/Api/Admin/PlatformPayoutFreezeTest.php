<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\PlatformPayout;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-594 (AC10, AC21) — une agence non active n'est pas payée, même clôturée quand elle l'était ;
 * une agence `standard` non vérifiée n'est pas approuvée ; la clôture globale ne s'arrête jamais
 * sur une agence.
 */
class PlatformPayoutFreezeTest extends TestCase
{
    use RefreshDatabase;

    private function eligible(Agency $agency, string $paidAt = '2026-09-15 10:00:00', int $amount = 100_000): BookingPayment
    {
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id, 'amount' => $amount,
            'status' => PaymentStatus::Paid, 'paid_at' => $paidAt,
        ]);
    }

    public function test_ac10_a_suspended_agency_gets_no_payout_and_is_listed_as_excluded(): void
    {
        $this->actingAsRole('super_admin');
        $active = Agency::factory()->create();
        $suspended = Agency::factory()->create(['status' => AgencyStatus::Suspended]);
        $this->eligible($active);
        $this->eligible($suspended);

        $response = $this->postJson('/api/admin/payouts/close-period', ['period_end' => '2026-09-30'])
            ->assertCreated();

        $this->assertSame([$active->id], array_column($response->json('data'), 'agency_id'));
        $this->assertContains(['agency_id' => $suspended->id, 'reason' => 'agency_not_active'], $response->json('excluded'));
        $this->assertSame(0, PlatformPayout::query()->where('agency_id', $suspended->id)->count());

        // Désignée explicitement, elle est refusée.
        $this->postJson('/api/admin/payouts/close-period', ['agency_id' => $suspended->id, 'period_end' => '2026-09-30'])
            ->assertStatus(422);
    }

    public function test_ac10_an_unverified_standard_agency_is_not_approved_an_individual_one_is(): void
    {
        $this->actingAsRole('super_admin');
        $standard = Agency::factory()->create(['is_verified' => false]);
        $individual = Agency::factory()->individual()->create(['is_verified' => false]);
        $a = PlatformPayout::factory()->create(['agency_id' => $standard->id]);
        $b = PlatformPayout::factory()->create(['agency_id' => $individual->id]);

        $this->postJson("/api/admin/payouts/{$a->id}/approve")
            ->assertStatus(422)
            ->assertJsonPath('message', __('money_out.platform.agency_unverified'));
        $this->postJson("/api/admin/payouts/{$b->id}/approve")->assertOk();
    }

    public function test_ac10_freeze_an_agency_suspended_after_closing_is_neither_approved_nor_paid(): void
    {
        $closer = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['is_verified' => true]);
        $this->eligible($agency);
        $this->postJson('/api/admin/payouts/close-period', ['agency_id' => $agency->id, 'period_end' => '2026-09-30'])
            ->assertCreated();
        $pending = PlatformPayout::query()->where('agency_id', $agency->id)->firstOrFail();
        $approved = PlatformPayout::factory()->create([
            'agency_id' => $agency->id, 'status' => PlatformPayoutStatus::Approved,
            'period_end' => '2026-08-31', 'approved_by' => $closer->id,
        ]);

        $agency->forceFill(['status' => AgencyStatus::Suspended])->save();
        $this->actingAsRole('super_admin');

        $this->postJson("/api/admin/payouts/{$pending->id}/approve")
            ->assertStatus(422)
            ->assertJsonPath('message', __('money_out.platform.agency_frozen'));
        $this->postJson("/api/admin/payouts/{$approved->id}/mark-paid", [
            'processed_at' => '2026-10-01T10:00:00Z',
            'payment_reference' => 'VIR-9',
        ])->assertStatus(422)->assertJsonPath('message', __('money_out.platform.agency_frozen'));

        $this->assertSame(PlatformPayoutStatus::Pending, $pending->fresh()->status);
        $this->assertSame(PlatformPayoutStatus::Approved, $approved->fresh()->status);
    }

    public function test_ac21_the_global_close_skips_an_already_closed_agency_and_goes_on(): void
    {
        $this->actingAsRole('super_admin');
        [$a, $b, $c] = Agency::factory()->count(3)->create()->sortBy('id')->values()->all();
        foreach ([$a, $b, $c] as $agency) {
            $this->eligible($agency);
        }
        $this->postJson('/api/admin/payouts/close-period', ['agency_id' => $b->id, 'period_end' => '2026-09-30'])
            ->assertCreated();
        // Un paiement tardif de B, encaissé dans la période déjà close.
        $this->eligible($b, '2026-09-20 10:00:00', 50_000);

        $response = $this->postJson('/api/admin/payouts/close-period', ['period_end' => '2026-09-30'])
            ->assertCreated();

        $created = array_column($response->json('data'), 'agency_id');
        sort($created);
        $this->assertSame([$a->id, $c->id], $created);
        $this->assertSame([['agency_id' => $b->id, 'reason' => 'already_closed']], $response->json('excluded'));
        $this->assertSame(1, PlatformPayout::query()->where('agency_id', $b->id)->count());
    }
}
