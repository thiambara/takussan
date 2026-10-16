<?php

namespace Tests\Feature\Geo;

use App\Models\Agency;
use App\Models\GeoCity;
use App\Models\GeoRegion;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-703 (P17.01) — `addresses.city` est `NOT NULL DEFAULT 'Dakar'` : une ville OMISE prend le
 * défaut, une ville envoyée à `null` ne le prend pas. Les trois voies d'écriture d'une adresse
 * rendaient 500 (`SQLSTATE[23502]`) sur un `null` explicite ; elles rendent 422.
 *
 * Les cas « ville omise » gardent ce qui marchait : la règle refuse le `null`, pas l'absence.
 */
class AdresseSansVilleTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->actingAsRole('agent', ['agency_id' => $this->agency->id]);
    }

    /** @param  array<string, mixed>|null  $adresse */
    private function creer(?array $adresse): TestResponse
    {
        return $this->postJson('/api/properties', array_filter([
            'title' => 'Appartement F3',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
            'agency_id' => $this->agency->id,
            'address' => $adresse,
        ], fn ($v) => $v !== null));
    }

    private function bienAvecAdresse(): Property
    {
        $id = $this->creer(['street' => '12 rue Carnot', 'city' => 'Thiès'])->assertCreated()->json('data.id');

        return Property::query()->findOrFail($id);
    }

    public function test_la_creation_refuse_une_ville_nulle(): void
    {
        $this->creer(['street' => '12 rue Carnot', 'city' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.city');

        $this->assertSame(0, Property::query()->count());
    }

    public function test_la_creation_refuse_une_ville_nulle_meme_avec_une_ville_du_referentiel(): void
    {
        $region = GeoRegion::factory()->create(['code' => 'SN-DK', 'slug' => 'dakar', 'name' => 'Dakar']);
        $dakar = GeoCity::factory()->for($region, 'region')->create(['slug' => 'dakar', 'name' => 'Dakar']);

        $this->creer(['geo_city_id' => $dakar->id, 'city' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.city');
    }

    public function test_la_creation_sans_ville_prend_toujours_le_defaut(): void
    {
        $id = $this->creer(['street' => '12 rue Carnot'])->assertCreated()->json('data.id');

        $this->assertSame('Dakar', Property::query()->findOrFail($id)->address()->firstOrFail()->city);
    }

    public function test_la_modification_refuse_une_ville_nulle(): void
    {
        $bien = $this->bienAvecAdresse();

        $this->patchJson("/api/properties/{$bien->id}", ['address' => ['city' => null]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.city');

        $this->assertSame('Thiès', $bien->address()->firstOrFail()->city);
    }

    public function test_la_modification_sans_ville_garde_la_ville(): void
    {
        $bien = $this->bienAvecAdresse();

        $this->patchJson("/api/properties/{$bien->id}", ['address' => ['street' => '14 rue Carnot']])
            ->assertOk();

        $adresse = $bien->address()->firstOrFail();
        $this->assertSame('14 rue Carnot', $adresse->street);
        $this->assertSame('Thiès', $adresse->city);
    }

    public function test_l_upsert_refuse_une_ville_nulle_a_la_creation_comme_a_la_modification(): void
    {
        $sansAdresse = $this->creer(null)->assertCreated()->json('data.id');

        $this->putJson("/api/properties/{$sansAdresse}/address", ['street' => '12 rue Carnot', 'city' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('city');

        $bien = $this->bienAvecAdresse();

        $this->putJson("/api/properties/{$bien->id}/address", ['city' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('city');

        $this->assertSame('Thiès', $bien->address()->firstOrFail()->city);
    }

    public function test_l_upsert_sans_ville_prend_le_defaut(): void
    {
        $sansAdresse = $this->creer(null)->assertCreated()->json('data.id');

        $this->putJson("/api/properties/{$sansAdresse}/address", ['street' => '12 rue Carnot'])
            ->assertCreated()
            ->assertJsonPath('data.city', 'Dakar');
    }
}
