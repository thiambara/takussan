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

class LeaseGuarantorTest extends TestCase
{
    use RefreshDatabase;

    private function ownedLease(): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
        ]);

        return [$owner, $lease];
    }

    public function test_owner_can_attach_new_guarantor_inline(): void
    {
        [$owner, $lease] = $this->ownedLease();
        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'phone' => '+221771234567',
            'role' => 'primary',
        ])->assertCreated()
            ->assertJsonPath('data.guarantors_count', 1);

        $this->assertSame(1, $lease->guarantors()->count());
    }

    public function test_owner_can_attach_existing_guarantor_by_id(): void
    {
        [$owner, $lease] = $this->ownedLease();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'guarantor_id' => $guarantor->id,
        ])->assertCreated()
            ->assertJsonPath('data.guarantor_id', $guarantor->id);
    }

    public function test_cannot_attach_more_than_three_guarantors(): void
    {
        [$owner, $lease] = $this->ownedLease();
        Sanctum::actingAs($owner);

        foreach (range(1, 3) as $i) {
            $this->postJson("/api/leases/{$lease->id}/guarantors", [
                'first_name' => "G{$i}",
                'last_name' => 'Ndiaye',
            ])->assertCreated();
        }

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'G4',
            'last_name' => 'Ndiaye',
        ])->assertStatus(422);
    }

    public function test_duplicate_attach_is_rejected(): void
    {
        [$owner, $lease] = $this->ownedLease();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'guarantor_id' => $guarantor->id,
        ])->assertCreated();
        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'guarantor_id' => $guarantor->id,
        ])->assertStatus(422);
    }

    public function test_owner_can_detach_guarantor(): void
    {
        [$owner, $lease] = $this->ownedLease();
        Sanctum::actingAs($owner);

        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);
        $lease->guarantors()->attach($guarantor->id);

        $this->deleteJson("/api/leases/{$lease->id}/guarantors/{$guarantor->id}")
            ->assertOk()
            ->assertJsonPath('data.guarantors_count', 0);
    }

    public function test_random_user_cannot_attach_guarantor(): void
    {
        [, $lease] = $this->ownedLease();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Ali',
            'last_name' => 'Test',
        ])->assertForbidden();
    }

    /**
     * TCK-695 (ex-LeaseGuarantorListTest, TCK-3017) — la fiche du bail lit ses garants par cette route seule :
     * l'ajout attache au pivot sans écrire `leases.guarantor_id`. La forme est celle que lit le front.
     */
    public function test_un_garant_ajoute_est_rendu_par_la_liste_des_garants_du_bail(): void
    {
        [$owner, $tenantUser, $lease] = $this->bailAvecLocataire();

        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'phone' => '+221770000001',
            'email' => 'awa@exemple.sn',
        ])->assertSuccessful();
        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Moussa',
            'last_name' => 'Fall',
        ])->assertSuccessful();

        // La colonne historique reste vide : la fiche ne peut pas lire le garant par elle.
        $this->assertNull($lease->fresh()->guarantor_id);

        $response = $this->getJson("/api/leases/{$lease->id}/guarantors")
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
        [$owner, $tenantUser, $lease] = $this->bailAvecLocataire();

        Sanctum::actingAs($owner);
        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertSuccessful();

        Sanctum::actingAs($tenantUser);
        $this->getJson("/api/leases/{$lease->id}/guarantors")
            ->assertOk()
            ->assertJsonPath('data.0.first_name', 'Awa');

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/leases/{$lease->id}/guarantors")->assertForbidden();
    }

    /** @return array{0: User, 1: User, 2: Lease} */
    private function bailAvecLocataire(): array
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
        ]);

        return [$owner, $tenantUser, $lease];
    }
}
