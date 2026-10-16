<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-695 (piste P21.04) — la fiche du bail lit ses garants par `GET /api/leases/{id}/guarantors`.
 *
 * L'ajout attache le garant au pivot `lease_guarantor` sans écrire `leases.guarantor_id`, et
 * `GET /api/leases/{id}` n'émet aucun garant : cette route est la seule lecture. Ce test fige la
 * forme que le front lit (`LeaseGuarantor`, `src/lib/queries/leases.ts`).
 */
class LeaseGuarantorListTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $tenantUser;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $agency->id]);
        $this->tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $this->tenantUser->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
        ]);
    }

    public function test_un_garant_ajoute_est_rendu_par_la_liste_des_garants_du_bail(): void
    {
        Sanctum::actingAs($this->owner);

        $this->postJson("/api/leases/{$this->lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'phone' => '+221770000001',
            'email' => 'awa@exemple.sn',
        ])->assertSuccessful();
        $this->postJson("/api/leases/{$this->lease->id}/guarantors", [
            'first_name' => 'Moussa',
            'last_name' => 'Fall',
        ])->assertSuccessful();

        // La colonne historique reste vide : la fiche ne peut pas lire le garant par elle.
        $this->assertNull($this->lease->fresh()->guarantor_id);

        $response = $this->getJson("/api/leases/{$this->lease->id}/guarantors")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure(['data' => [['id', 'first_name', 'last_name', 'phone', 'email', 'role']]]);

        // La route ne trie pas : on cherche chaque garant par son prénom.
        $parPrenom = collect($response->json('data'))->keyBy('first_name');
        $this->assertSame(['Awa', 'Moussa'], $parPrenom->keys()->sort()->values()->all());
        $this->assertSame('Diop', $parPrenom['Awa']['last_name']);
        $this->assertSame('+221770000001', $parPrenom['Awa']['phone']);
        $this->assertSame('awa@exemple.sn', $parPrenom['Awa']['email']);
        $this->assertSame('Fall', $parPrenom['Moussa']['last_name']);
    }

    public function test_le_locataire_du_bail_lit_ses_garants_et_un_tiers_non(): void
    {
        Sanctum::actingAs($this->owner);
        $this->postJson("/api/leases/{$this->lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertSuccessful();

        Sanctum::actingAs($this->tenantUser);
        $this->getJson("/api/leases/{$this->lease->id}/guarantors")
            ->assertOk()
            ->assertJsonPath('data.0.first_name', 'Awa');

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/leases/{$this->lease->id}/guarantors")->assertForbidden();
    }
}
