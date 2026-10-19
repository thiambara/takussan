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
 * défaut, une ville envoyée à `null` ne le prend pas. Les voies d'écriture d'une adresse
 * rendaient 500 (`SQLSTATE[23502]`) sur un `null` explicite ; elles rendent 422.
 *
 * Les cas « ville omise » gardent ce qui marchait : la règle refuse le `null`, pas l'absence.
 *
 * TCK-812 (P17.05) — il n'en reste que deux : la création et la modification du bien. La troisième,
 * `PUT` et `DELETE /api/properties/{property}/address`, n'avait aucun appelant et des règles plus
 * lâches que la création (255 caractères, ni ville ni quartier du référentiel) ; elle est retirée.
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

    /**
     * TCK-976 (P54.01) — `addresses.country` est `NOT NULL DEFAULT 'SN'`, même forme que la ville :
     * un pays `null` rend 422 sur les deux voies, un pays omis prend le défaut ou reste inchangé.
     */
    public function test_la_creation_refuse_un_pays_nul(): void
    {
        $this->creer(['street' => '12 rue Carnot', 'country' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.country');

        $this->assertSame(0, Property::query()->count());
    }

    public function test_la_creation_sans_pays_prend_toujours_le_defaut(): void
    {
        $id = $this->creer(['street' => '12 rue Carnot'])->assertCreated()->json('data.id');

        $this->assertSame('SN', Property::query()->findOrFail($id)->address()->firstOrFail()->country);
    }

    public function test_la_modification_refuse_un_pays_nul(): void
    {
        $bien = $this->bienAvecAdresse();
        $avant = $bien->address()->firstOrFail()->country;

        $this->patchJson("/api/properties/{$bien->id}", ['address' => ['country' => null]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.country');

        $this->assertSame($avant, $bien->address()->firstOrFail()->country);
    }

    /**
     * TCK-812 — la route à part ne revient pas : une adresse ne s'écrit plus qu'avec son bien, sous
     * les règles de la création. Le bien a une adresse, pour qu'un 404 ne vienne pas d'elle.
     */
    public function test_l_adresse_ne_s_ecrit_plus_par_une_route_a_part(): void
    {
        $bien = $this->bienAvecAdresse();

        $this->putJson("/api/properties/{$bien->id}/address", ['street' => '14 rue Carnot'])->assertNotFound();
        $this->deleteJson("/api/properties/{$bien->id}/address")->assertNotFound();

        $this->assertSame('12 rue Carnot', $bien->address()->firstOrFail()->street);
    }
}
