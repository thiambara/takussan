<?php

namespace Tests\Feature\Owners;

use App\Models\Address;
use App\Models\Enums\PaymentStatus;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;

/**
 * TCK-2909 (AC3) — la fiche du bailleur compte les encaissements du mois (`figures.collections_count`)
 * sur les lignes du MÊME relevé que `collected` : un loyer en attente, un loyer d'un autre mois ou d'un
 * autre bailleur n'y entrent pas. Et `contact.address`, l'adresse du compte.
 */
class OwnerDetailCollectionsCountTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    public function test_neuf_loyers_encaisses_dans_le_mois_font_neuf_encaissements(): void
    {
        Notification::fake();
        $this->travelTo('2026-09-20 10:00:00');
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        foreach (range(1, 3) as $i) {
            $lease = $this->leaseOf($agency, $landlord);
            foreach (range(1, 3) as $j) {
                $this->leasePayment($lease, 100_000, paidAt: "2026-09-0{$j} 10:00:00");
            }
        }
        $other = $this->leaseOf($agency, $landlord);
        $this->leasePayment($other, 100_000, status: PaymentStatus::Pending);
        $this->leasePayment($other, 100_000, paidAt: '2026-08-10 10:00:00');
        $this->leasePayment($this->leaseOf($agency, $this->landlordOf($agency)), 100_000);
        Address::query()->create([
            'addressable_type' => $landlord->getMorphClass(), 'addressable_id' => $landlord->id,
            'street' => 'Rue 10', 'neighborhood' => 'Point E', 'city' => 'Dakar', 'country' => 'SN',
        ]);
        $profile = OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->firstOrFail();

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $data = $this->apiGet("/api/owners/{$profile->id}")->assertOk()->json('data');

        $this->assertSame(9, $data['figures']['collections_count']);
        $this->assertEquals(900_000, $data['figures']['collected']);
        $this->assertSame('Rue 10, Point E, Dakar, SN', $data['contact']['address']);

        // Un autre mois : son propre compte.
        $this->assertSame(1, $this->apiGet("/api/owners/{$profile->id}?period=2026-08")->json('data.figures.collections_count'));
    }

    public function test_sans_adresse_ni_encaissement(): void
    {
        $agency = $this->moneyAgency();
        $profile = OwnerProfile::query()->where('user_id', $this->landlordOf($agency)->id)->firstOrFail();

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $data = $this->apiGet("/api/owners/{$profile->id}")->assertOk()->json('data');

        $this->assertSame(0, $data['figures']['collections_count']);
        $this->assertNull($data['contact']['address']);
        $this->assertNull($data['mandate_document']);
        $this->assertSame(['starts_on' => null, 'ends_on' => null, 'payout_method' => null, 'payout_day' => null, 'referent' => null], $data['mandate']);
    }
}
