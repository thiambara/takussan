<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2911 (ADR-0120 § 4) — « Depuis janvier » du bailleur du profil actif : les interventions de ses
 * biens dans l'agence de ce profil, signalées depuis `since` (défaut : le 1er janvier), hors
 * annulées ; les closes ; ce qui est à sa charge (refacturable, validé ou payé).
 */
class OwnerMaintenanceSummaryTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-15 12:00:00');
        $this->agency = Agency::factory()->create();
        $this->landlord = $this->landlordOf($this->agency);
    }

    private function property(?Agency $agency = null, ?User $owner = null): Property
    {
        return Property::factory()->create(['user_id' => ($owner ?? $this->landlord)->id, 'agency_id' => ($agency ?? $this->agency)->id]);
    }

    private function intervention(Property $property, MaintenanceStatus $status, string $at = '2026-03-10 09:00:00'): MaintenanceRequest
    {
        $mr = MaintenanceRequest::factory()->create(['property_id' => $property->id, 'assigned_to' => null, 'status' => $status]);
        $mr->forceFill(['created_at' => $at])->save();

        return $mr;
    }

    private function bill(MaintenanceRequest $mr, float $amount, ServiceProviderBillStatus $status, bool $rechargeable = true): void
    {
        ServiceProviderBill::factory()->create([
            'maintenance_request_id' => $mr->id,
            'agency_id' => $mr->property->agency_id,
            'property_id' => $mr->property_id,
            'amount' => $amount,
            'status' => $status,
            'rechargeable_to_landlord' => $rechargeable,
        ]);
    }

    public function test_ac1_douze_interventions_neuf_closes_et_1_521_000_a_sa_charge(): void
    {
        [$villa, $studio] = [$this->property(), $this->property()];
        $closes = [];
        foreach (range(1, 6) as $i) {
            $closes[] = $this->intervention($villa, MaintenanceStatus::Closed);
        }
        foreach (range(1, 3) as $i) {
            $closes[] = $this->intervention($studio, MaintenanceStatus::Closed);
        }
        $this->intervention($villa, MaintenanceStatus::InProgress);
        $this->intervention($studio, MaintenanceStatus::Open, '2026-01-01 00:00:00');
        $this->intervention($studio, MaintenanceStatus::Completed);

        // À sa charge : refacturables, validées ou payées.
        $this->bill($closes[0], 1_000_000, ServiceProviderBillStatus::Validated);
        $this->bill($closes[1], 400_000, ServiceProviderBillStatus::Paid);
        $this->bill($closes[6], 121_000, ServiceProviderBillStatus::Validated);
        // Pas à sa charge : non refacturable, brouillon, en attente, rejetée.
        $this->bill($closes[2], 200_000, ServiceProviderBillStatus::Validated, rechargeable: false);
        $this->bill($closes[3], 300_000, ServiceProviderBillStatus::Draft);
        $this->bill($closes[4], 50_000, ServiceProviderBillStatus::PendingValidation);
        $this->bill($closes[5], 70_000, ServiceProviderBillStatus::Rejected);

        // Hors du compte : avant janvier, annulée, le bien d'un autre bailleur de l'agence.
        $avant = $this->intervention($villa, MaintenanceStatus::Closed, '2025-12-31 23:00:00');
        $this->bill($avant, 900_000, ServiceProviderBillStatus::Paid);
        $this->intervention($villa, MaintenanceStatus::Cancelled);
        $this->intervention($this->property(owner: $this->landlordOf($this->agency)), MaintenanceStatus::Closed);

        Sanctum::actingAs($this->landlord);
        $data = $this->getJson('/api/owner/maintenance-summary')->assertOk()->json('data');

        $this->assertSame('2026-01-01', $data['since']);
        $this->assertSame(12, $data['total']);
        $this->assertSame(9, $data['closed']);
        $this->assertEquals(1_521_000, $data['charged_amount']);
        $this->assertSame($data['total'], array_sum(array_column($data['by_property'], 'total')));
        $parBien = collect($data['by_property'])->keyBy('property.id');
        $this->assertSame([7, 6, 1_400_000.0], [$parBien[$villa->id]['total'], $parBien[$villa->id]['closed'], (float) $parBien[$villa->id]['charged_amount']]);
        $this->assertSame([5, 3, 121_000.0], [$parBien[$studio->id]['total'], $parBien[$studio->id]['closed'], (float) $parBien[$studio->id]['charged_amount']]);
    }

    public function test_since_deplace_le_debut_de_la_periode(): void
    {
        $villa = $this->property();
        $this->intervention($villa, MaintenanceStatus::Closed, '2026-03-10 09:00:00');
        $this->intervention($villa, MaintenanceStatus::Closed, '2026-10-02 09:00:00');

        Sanctum::actingAs($this->landlord);
        $this->getJson('/api/owner/maintenance-summary?since=2026-10-01')->assertOk()
            ->assertJsonPath('data.since', '2026-10-01')
            ->assertJsonPath('data.total', 1);
        $this->getJson('/api/owner/maintenance-summary?since=01/10/2026')->assertUnprocessable()->assertJsonValidationErrors('since');
        $this->getJson('/api/owner/maintenance-summary?since[]=2026-10-01')->assertUnprocessable();
    }

    /** Le bien du bailleur dans une AUTRE agence ne compte pas sous le profil de celle-ci. */
    public function test_une_autre_agence_du_bailleur_ne_compte_pas(): void
    {
        $this->intervention($this->property(), MaintenanceStatus::Closed);
        $autre = Agency::factory()->create();
        $profilB = OwnerProfile::query()->create(['user_id' => $this->landlord->id, 'agency_id' => $autre->id]);
        $this->intervention($this->property($autre), MaintenanceStatus::Closed);
        $this->intervention($this->property($autre), MaintenanceStatus::Closed);

        $profilA = OwnerProfile::query()->where('user_id', $this->landlord->id)->where('agency_id', $this->agency->id)->sole();
        Sanctum::actingAs($this->landlord);
        $this->withHeader('X-Profile-Id', "owner:{$profilA->id}")
            ->getJson('/api/owner/maintenance-summary')->assertOk()->assertJsonPath('data.total', 1);
        $this->withHeader('X-Profile-Id', "owner:{$profilB->id}")
            ->getJson('/api/owner/maintenance-summary')->assertOk()->assertJsonPath('data.total', 2);
    }

    public function test_un_non_bailleur_recoit_403(): void
    {
        foreach ([$this->agentOf($this->agency), $this->providerFor($this->agency), User::factory()->create()] as $intrus) {
            Sanctum::actingAs($intrus);
            $this->getJson('/api/owner/maintenance-summary')->assertForbidden();
        }
    }
}
