<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\PayoutMethod;
use App\Models\PlatformPayout;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-1205 (P95.01) — une réponse d'écriture d'un reversement ne rend pas `null` une valeur que le
 * `show` rend. Avant : `payout_method_masked` sortait nul sur `store`, `approve`, `markProcessed`,
 * `markFailed` et `cancel` (la relation n'était chargée que par `show`), et `breakdown` sortait nul
 * sur les écritures des reversements de la plateforme.
 */
class PayoutWriteResponseTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    public function test_les_ecritures_d_un_reversement_rendent_la_destination_et_l_emetteur_du_show(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);
        $agent = $this->agencyAgent($agency);
        $method = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))->create([
            'user_id' => $landlord->id,
            'account_identifier' => '+221771111111',
            'masked_identifier' => PayoutMethod::mask('+221771111111'),
        ]);

        $this->actingWithStepUp($issuer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);
        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'payout_method_id' => $method->id,
            'payment_method' => 'wave',
        ])->assertCreated()
            ->assertJsonPath('data.payout_method_masked', '•••• 1111')
            ->assertJsonPath('data.issuer.id', $issuer->id)
            ->json('data.id');

        $show = $this->getJson("/api/payouts/{$id}")->assertOk()->json('data');
        $this->assertSame('•••• 1111', $show['payout_method_masked']);

        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk()
            ->assertJsonPath('data.payout_method_masked', $show['payout_method_masked'])
            ->assertJsonPath('data.issuer', $show['issuer']);

        $this->actingWithStepUp($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'wave', 'transaction_id' => 'W-1'])
            ->assertOk()
            ->assertJsonPath('data.payout_method_masked', '•••• 1111')
            ->assertJsonPath('data.issuer.id', $issuer->id);
    }

    public function test_l_annulation_rend_la_destination_du_show(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $agent = $this->agencyAgent($agency);
        $method = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))->create([
            'user_id' => $landlord->id,
            'account_identifier' => '+221772222222',
            'masked_identifier' => PayoutMethod::mask('+221772222222'),
        ]);

        $this->actingWithStepUp($issuer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 50_000);
        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'payout_method_id' => $method->id,
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/payouts/{$id}/cancel")->assertOk()
            ->assertJsonPath('data.payout_method_masked', '•••• 2222')
            ->assertJsonPath('data.issuer.id', $issuer->id);
    }

    public function test_les_ecritures_d_un_reversement_de_la_plateforme_rendent_la_ventilation_du_show(): void
    {
        $sa2 = $this->actingAsRole('super_admin');
        $sa1 = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['is_verified' => true]);
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
        ]);
        $this->soldeParLaPlateforme(BookingPayment::factory()->create([
            'booking_id' => $booking->id, 'amount' => 100_000,
            'status' => PaymentStatus::Paid, 'paid_at' => '2026-09-15 10:00:00',
        ]));

        $cloture = $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-09-30',
        ])->assertCreated()->json('data.0');
        // La clôture ne calcule pas la ventilation : la clé est absente, pas nulle.
        $this->assertArrayNotHasKey('breakdown', $cloture);

        $payout = PlatformPayout::query()->where('agency_id', $agency->id)->firstOrFail();
        $show = $this->getJson("/api/admin/payouts/{$payout->id}")->assertOk()->json('data.breakdown');
        $this->assertIsArray($show);
        $this->assertSame(1, $show['booking']['count']);

        $this->actingAs($sa2);
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertOk()
            ->assertJsonPath('data.breakdown', $show);
    }
}
