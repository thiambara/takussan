<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-2064 (P178.01, décision du porteur du 2026-10-23, option stricte) — une pièce soldée par la
 * plateforme n'est reversable au bailleur qu'une fois son `PlatformPayout` `paid`. Les agences
 * `individual` restent hors règle (ADR-0039 § 2).
 *
 * Avant : un loyer encaissé par l'intégration globale, que la plateforme n'avait encore rien reversé
 * à l'agence, était proposé à la préparation, puis accepté et versé au bailleur.
 */
class ReversementApresLaPlateformeTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    /** @return list<int> */
    private function preparedIds(int $landlordId): array
    {
        return array_column(
            $this->getJson("/api/payouts/preparation?landlord_id={$landlordId}&period_start=2026-09-01&period_end=2026-09-30")
                ->assertOk()->json('data.lines.lease_payments'),
            'id',
        );
    }

    private function closedBy(LeasePayment|BookingPayment $payment, Agency $agency, PlatformPayoutStatus $status): PlatformPayout
    {
        $payout = PlatformPayout::factory()->create(['agency_id' => $agency->id, 'status' => $status]);
        $payment->forceFill(['platform_payout_id' => $payout->id])->save();

        return $payout;
    }

    public function test_a_rent_settled_by_the_platform_is_neither_offered_nor_accepted_before_the_platform_paid(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $online = $this->soldeParLaPlateforme($this->leasePayment($lease, 150_000));
        $cash = $this->leasePayment($lease, 20_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->assertSame([$cash->id], $this->preparedIds($landlord->id));
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$online->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['lease_payment_ids']);

        // Clôturée mais pas encore payée par la plateforme : toujours en attente.
        $platformPayout = $this->closedBy($online, $agency, PlatformPayoutStatus::Approved);
        $this->assertSame([$cash->id], $this->preparedIds($landlord->id));
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$online->id]])
            ->assertStatus(422);

        $platformPayout->forceFill(['status' => PlatformPayoutStatus::Paid, 'processed_at' => now()])->save();
        $this->assertEqualsCanonicalizing([$online->id, $cash->id], $this->preparedIds($landlord->id));
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$online->id, $cash->id]])
            ->assertCreated()->assertJsonPath('data.gross_amount', 170000);
    }

    public function test_a_rent_settled_by_the_agencys_own_integration_stays_eligible(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $own = $this->soldeParLAgence($this->leasePayment($this->leaseOf($agency, $landlord, 10), 150_000), $agency);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->assertSame([$own->id], $this->preparedIds($landlord->id));
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$own->id]])->assertCreated();
    }

    public function test_a_booking_deposit_settled_by_the_platform_waits_for_the_platform_too(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id, 'status' => BookingStatus::Confirmed]);
        $deposit = $this->soldeParLaPlateforme(BookingPayment::factory()->create([
            'booking_id' => $booking->id, 'amount' => 50_000, 'status' => PaymentStatus::Paid, 'paid_at' => '2026-09-10 10:00:00',
        ]));
        Sanctum::actingAs($this->agencyAgent($agency));

        $prepare = fn () => array_column($this->getJson("/api/payouts/preparation?landlord_id={$landlord->id}&period_start=2026-09-01&period_end=2026-09-30")
            ->assertOk()->json('data.lines.booking_payments'), 'id');
        $this->assertSame([], $prepare());
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'booking_payment_ids' => [$deposit->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['booking_payment_ids']);

        $this->closedBy($deposit, $agency, PlatformPayoutStatus::Paid);
        $this->assertSame([$deposit->id], $prepare());
    }

    public function test_an_individual_agency_stays_outside_the_rule(): void
    {
        $agency = $this->moneyAgency(['kind' => AgencyKind::Individual]);
        $host = $this->landlordOf($agency);
        $online = $this->soldeParLaPlateforme($this->leasePayment($this->leaseOf($agency, $host, 10), 150_000));
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->assertSame([$online->id], $this->preparedIds($host->id));
    }
}
