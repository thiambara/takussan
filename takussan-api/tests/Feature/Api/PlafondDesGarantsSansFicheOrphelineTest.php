<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2113 (piste P213.01) — un garant neuf posté sur un bail qui en a déjà trois est refusé en
 * 422 `lease.max_guarantors`, et sa fiche n'est pas créée : la création se fait dans la
 * transaction qui juge le plafond, après lui.
 */
class PlafondDesGarantsSansFicheOrphelineTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $agency->id]);
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
        ]);
    }

    public function test_un_garant_neuf_au_dela_du_plafond_ne_laisse_aucune_fiche(): void
    {
        Sanctum::actingAs($this->owner);

        foreach (['G1', 'G2', 'G3'] as $prenom) {
            $this->postJson("/api/leases/{$this->lease->id}/guarantors", [
                'first_name' => $prenom,
                'last_name' => 'Diop',
            ])->assertSuccessful();
        }
        $this->assertSame(3, Guarantor::query()->count());

        $this->postJson("/api/leases/{$this->lease->id}/guarantors", [
            'first_name' => 'G4',
            'last_name' => 'Fall',
            'phone' => '+221770000004',
        ])->assertStatus(422)->assertJsonPath('code', 'lease.max_guarantors');

        $this->assertSame(3, Guarantor::query()->count());
        $this->assertFalse(Guarantor::query()->where('first_name', 'G4')->exists());
        $this->assertSame(3, $this->lease->guarantors()->count());
    }

    public function test_un_garant_neuf_sous_le_plafond_est_cree_et_rattache(): void
    {
        Sanctum::actingAs($this->owner);

        $id = $this->postJson("/api/leases/{$this->lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertSuccessful()
            ->assertJsonPath('data.guarantors_count', 1)
            ->json('data.guarantor_id');

        $garant = Guarantor::query()->findOrFail($id);
        $this->assertSame('Awa', $garant->first_name);
        $this->assertSame($this->lease->agency_id, $garant->agency_id);
        $this->assertSame($this->owner->id, $garant->added_by_id);
        $this->assertTrue($this->lease->guarantors()->whereKey($id)->exists());
    }

    public function test_un_garant_existant_deja_rattache_est_refuse(): void
    {
        Sanctum::actingAs($this->owner);

        $id = $this->postJson("/api/leases/{$this->lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertSuccessful()->json('data.guarantor_id');

        $this->postJson("/api/leases/{$this->lease->id}/guarantors", ['guarantor_id' => $id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'lease.guarantor_already_attached');

        $this->assertSame(1, Guarantor::query()->count());
        $this->assertSame(1, $this->lease->guarantors()->count());
    }
}
