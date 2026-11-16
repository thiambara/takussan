<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2863 (AC2) — le locataire dont le bail est clôturé depuis moins de 90 jours est invité à le
 * noter (`lease_closed` de `GET /api/me/review-opportunities`) ; son avis posté, l'invitation part.
 */
class LeaseClosedReviewOpportunityTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $tenant;

    private Customer $customer;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-11-10 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->tenant = User::factory()->create();
        $this->customer = Customer::factory()->create(['user_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function lease(string $status, string $endDate, ?string $terminatedAt = null): Lease
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'F3, Sacré-Cœur 3']);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => $this->customer->id,
            'status' => $status,
            'start_date' => '2025-11-01',
            'end_date' => $endDate,
            'terminated_at' => $terminatedAt,
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function closed(): array
    {
        $this->actingAsApi($this->tenant);

        return $this->getJson('/api/me/review-opportunities')->assertOk()->json('lease_closed');
    }

    public function test_ac2_un_bail_clos_le_31_octobre_est_propose_puis_disparait_apres_l_avis(): void
    {
        $lease = $this->lease(LeaseStatus::Expired->value, '2026-10-31');

        $items = $this->closed();
        $this->assertCount(1, $items);
        $this->assertSame('lease_closed', $items[0]['kind']);
        $this->assertSame(['id' => $lease->id, 'end_date' => '2026-10-31', 'property_title' => 'F3, Sacré-Cœur 3'], $items[0]['lease']);
        $this->assertSame('property', $items[0]['target']['type']);
        $this->assertSame($lease->property_id, $items[0]['target']['subject']['id']);
        $this->assertSame(['type' => 'lease', 'id' => $lease->id], $items[0]['target']['context']);

        // La cible se poste telle quelle, par la règle de dépôt existante.
        $this->postJson("/api/properties/{$lease->property_id}/reviews", ['rating' => 4])->assertCreated();

        $this->assertSame([], $this->closed());
    }

    public function test_un_bail_resilie_il_y_a_10_jours_est_date_de_sa_resiliation(): void
    {
        $lease = $this->lease(LeaseStatus::Terminated->value, '2027-10-31', '2026-10-31 15:00:00');

        $items = $this->closed();
        $this->assertCount(1, $items);
        $this->assertSame($lease->id, $items[0]['lease']['id']);
        $this->assertSame('2026-10-31', $items[0]['lease']['end_date']);
    }

    public function test_un_bail_clos_depuis_200_jours_n_est_plus_propose(): void
    {
        $this->lease(LeaseStatus::Expired->value, '2026-04-24');

        $this->assertSame([], $this->closed());
    }

    public function test_un_bail_en_cours_ou_en_preavis_n_est_pas_clos(): void
    {
        $this->lease(LeaseStatus::Active->value, '2026-10-31');
        $this->lease(LeaseStatus::Terminating->value, '2026-11-30');

        $this->assertSame([], $this->closed());
    }

    public function test_le_bail_d_un_autre_locataire_n_est_pas_propose(): void
    {
        $this->lease(LeaseStatus::Expired->value, '2026-10-31');

        $this->actingAsApi(User::factory()->create());
        $this->getJson('/api/me/review-opportunities')->assertOk()->assertJsonPath('lease_closed', []);
    }
}
