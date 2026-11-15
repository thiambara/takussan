<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2643 (contre-vérification, r1-bis) — `POST /api/leases` exige `leases.create` du personnel de
 * l'agence du bien (`LeasePolicy::createOn`, que lit aussi `GET /api/leases/defaults`). Aucun test du
 * POST ne voyait la capacité retirée de la policy. Le témoin (l'agent qui la tient crée le bail) garde
 * le refus d'être celui d'un corps invalide.
 */
class CreationDeBailExigeLaCapaciteTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private Customer $locataire;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create();
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agence->id]);
        $this->bien = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agence->id]);
        $this->locataire = Customer::factory()->create(['agency_id' => $this->agence->id, 'added_by_id' => $bailleur->id]);
    }

    private function creer(User $qui): TestResponse
    {
        $this->actingAsApi($qui);

        return $this->postJson('/api/leases', [
            'property_id' => $this->bien->id,
            'tenant_id' => $this->locataire->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'monthly_rent' => 670000,
            'deposit_amount' => 1340000,
            'currency' => 'XOF',
        ]);
    }

    public function test_l_agent_qui_tient_la_capacite_cree_le_bail(): void
    {
        $this->creer($this->agencyAgent($this->agence))->assertCreated();

        $this->assertSame(1, Lease::query()->count());
    }

    public function test_l_agent_de_l_agence_sans_la_capacite_est_refuse_et_rien_n_est_cree(): void
    {
        $this->creer($this->agentWithout($this->agence, Capability::LeasesCreate))->assertForbidden();

        $this->assertSame(0, Lease::query()->count());
    }
}
