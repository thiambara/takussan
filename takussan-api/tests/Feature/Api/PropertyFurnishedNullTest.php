<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Geo\AdresseSansVilleTest;
use Tests\TestCase;

/**
 * TCK-981 (P54.06) — `properties.furnished` est `NOT NULL DEFAULT false` : un `furnished` omis prend
 * le défaut, un `furnished: null` ne le prend pas et rendait 500 (`SQLSTATE[23502]`). La création
 * le refuse en 422, comme `UpdatePropertyRequest` le faisait déjà, et comme la ville et le pays
 * de l'adresse ({@see AdresseSansVilleTest}).
 */
class PropertyFurnishedNullTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->actingAsRole('agent', ['agency_id' => $this->agency->id]);
    }

    /** @param  array<string, mixed>  $extra */
    private function creer(array $extra): TestResponse
    {
        return $this->postJson('/api/properties', [
            'title' => 'Appartement F3',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
            'agency_id' => $this->agency->id,
            ...$extra,
        ]);
    }

    public function test_la_creation_refuse_un_meuble_nul(): void
    {
        $this->creer(['furnished' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('furnished');

        $this->assertSame(0, Property::query()->count());
    }

    public function test_la_creation_sans_meuble_prend_toujours_le_defaut(): void
    {
        $id = $this->creer([])->assertCreated()->json('data.id');

        $this->assertFalse(Property::query()->findOrFail($id)->furnished);
    }

    public function test_la_creation_garde_un_meuble_explicite(): void
    {
        $id = $this->creer(['furnished' => true])->assertCreated()->json('data.id');

        $this->assertTrue(Property::query()->findOrFail($id)->furnished);
    }
}
