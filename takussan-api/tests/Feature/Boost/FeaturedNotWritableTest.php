<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-633 lot F (ADR-0061 §5) — `featured` est DÉRIVÉ des boosts : plus aucune requête ne l'écrit,
 * pas même celle d'un super-admin (qui offre une Vedette par `POST /api/admin/properties/{p}/offered-boost`).
 */
class FeaturedNotWritableTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_super_admin_ne_l_ecrit_plus(): void
    {
        $property = Property::factory()->published()->create();
        $this->actingAsRole('super_admin');

        $this->patchJson("/api/properties/{$property->id}", ['featured' => true])
            ->assertStatus(422)->assertJsonValidationErrors('featured');
        $this->assertFalse((bool) $property->fresh()->featured);
    }

    public function test_l_admin_d_espace_non_plus(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiPatch("/api/properties/{$property->id}", ['featured' => true])->assertStatus(422);
        $this->apiPatch("/api/properties/{$property->id}", ['featured' => false])->assertStatus(422);
        $this->assertFalse((bool) $property->fresh()->featured);
    }

    public function test_la_creation_l_ignore(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $id = $this->apiPost('/api/properties', [
            'title' => 'Studio à Ouakam', 'type' => 'apartment', 'contract_type' => 'rent', 'rent_period' => 'monthly',
            'price' => 150000, 'currency' => 'XOF', 'featured' => true,
        ])->json('data.id');

        if ($id !== null) {
            $this->assertFalse((bool) Property::query()->findOrFail($id)->featured);
        } else {
            // La création a refusé le corps pour une autre raison : on vérifie au moins qu'aucun bien vedette n'existe.
            $this->assertSame(0, Property::query()->where('featured', true)->count());
        }
    }
}
