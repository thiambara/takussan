<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2204 (P226.02) — une demande d'intervention n'accepte que le bail de son propre bien. Le bail
 * rattaché n'était jugé que par `can('view')` : un bailleur de deux biens rattachait à une demande
 * sur P1 le bail de P2 (201). Règle de TCK-576 (« un bail et un bien rattachés ensemble vont
 * ensemble »), refus de TCK-1070 (le bail d'un autre bien reçoit la réponse du bail invisible).
 */
class BailDuMemeBienTest extends TestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private User $bailleur;

    private Property $p1;

    private Lease $bailDeP2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bailleur = User::factory()->create();
        $this->p1 = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => null]);
        $p2 = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => null]);
        $this->bailDeP2 = Lease::factory()->create([
            'property_id' => $p2->id,
            'agency_id' => null,
            'landlord_id' => $this->bailleur->id,
            'status' => LeaseStatus::Active,
        ]);
        Sanctum::actingAs($this->bailleur);
    }

    private function demande(int $propertyId, int $leaseId): TestResponse
    {
        return $this->postJson('/api/maintenance-requests', [
            'property_id' => $propertyId,
            'lease_id' => $leaseId,
            'title' => 'Fuite',
            'description' => 'Sous l’évier',
            'category' => MaintenanceCategory::cases()[0]->value,
        ]);
    }

    public function test_le_bail_d_un_autre_bien_recoit_le_refus_du_bail_absent(): void
    {
        $autreBien = $this->demande($this->p1->id, $this->bailDeP2->id);
        $absent = $this->demande($this->p1->id, self::ABSENT);

        $this->assertSame(403, $autreBien->status());
        $this->assertSame([$absent->status(), $absent->json()], [$autreBien->status(), $autreBien->json()]);
        $this->assertDatabaseCount('maintenance_requests', 0);
    }

    /** Témoin : le bail du bien de la demande reste accepté. */
    public function test_le_bail_du_bien_de_la_demande_est_accepte(): void
    {
        $this->demande($this->bailDeP2->property_id, $this->bailDeP2->id)->assertCreated();

        $this->assertDatabaseHas('maintenance_requests', [
            'property_id' => $this->bailDeP2->property_id,
            'lease_id' => $this->bailDeP2->id,
        ]);
    }
}
