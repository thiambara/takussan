<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2866 — AC2 : la lecture des impayés (`GET /api/payments/history`, `filter[days_late_min]=1`)
 * triée par MONTANT DÛ (`sort=-remaining_amount`) rend le plus gros reste dû en premier — et non le
 * plus gros montant facial : une échéance de 400 000 dont 350 000 sont réglés doit 50 000.
 *
 * La coupe compte : le tri se fait en SQL avant la limite (`PaymentHistory::orderForCut`), sans quoi
 * une page d'une ligne rendrait une ligne arbitraire.
 */
class OverdueSortByAmountTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-15 10:00:00');
        $agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($agency);
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);

        // [montant facial, déjà réglé, jours de retard]
        foreach ([[50_000, 0, 60], [300_000, 0, 5], [120_000, 0, 30], [400_000, 350_000, 90]] as [$amount, $paid, $days]) {
            LeasePayment::factory()->create([
                'lease_id' => $lease->id,
                'payer_id' => $lease->tenant_id,
                'payment_type' => LeasePaymentType::Rent,
                'status' => $paid > 0 ? PaymentStatus::PartiallyPaid : PaymentStatus::Pending,
                'amount' => $amount,
                'metadata' => $paid > 0 ? ['paid_amount' => $paid] : null,
                'due_date' => now()->subDays($days)->toDateString(),
                'paid_at' => null,
            ]);
        }
    }

    /** @return list<float> */
    private function remaining(string $sort, int $perPage = 20): array
    {
        $response = $this->actingAsApi($this->admin)
            ->apiGet("/api/payments/history?filter[days_late_min]=1&sort={$sort}&per_page={$perPage}")
            ->assertOk();

        return array_map(fn (array $row): float => (float) $row['remaining_amount'], $response->json('data'));
    }

    public function test_le_plus_gros_reste_du_vient_en_premier(): void
    {
        $this->assertSame([300_000.0, 120_000.0, 50_000.0, 50_000.0], $this->remaining('-remaining_amount'));
    }

    public function test_le_tri_croissant_rend_le_plus_petit_en_premier(): void
    {
        $this->assertSame([50_000.0, 50_000.0, 120_000.0, 300_000.0], $this->remaining('remaining_amount'));
    }

    public function test_une_page_d_une_ligne_rend_le_plus_gros_impaye(): void
    {
        $this->assertSame([300_000.0], $this->remaining('-remaining_amount', 1));
    }
}
