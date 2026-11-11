<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Notifications\SavedSearchMatchesNotification;
use App\Services\Search\PropertySearchService;
use App\Support\SavedSearchCriteria;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2607 — le chercheur qui coche Mermoz, Almadies et Ngor repart avec UNE alerte qui le
 * prévient pour ces trois quartiers : `criteria.locations`, 2 à 12 quartiers en OU, exclusive de
 * `location` (un quartier seul garde sa clé et son comportement).
 */
class SavedSearchLocationsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const TROIS = ['Mermoz', 'Almadies', 'Ngor'];

    public function test_une_alerte_sur_trois_quartiers_est_creee_et_relue(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $id = $this->postJson('/api/saved-searches', ['name' => 'Bord de mer', 'criteria' => ['locations' => self::TROIS]])
            ->assertCreated()
            ->assertJsonPath('data.criteria.locations', self::TROIS)
            ->json('data.id');

        $this->assertSame(['locations' => self::TROIS], SavedSearch::find($id)->criteria);
    }

    /** AC3 — `location` et `locations` ensemble : 422, à la création comme à la modification. */
    public function test_location_et_locations_ensemble_sont_refusees(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/saved-searches', [
            'name' => 'Les deux',
            'criteria' => ['location' => 'Mermoz', 'locations' => ['Ngor', 'Yoff']],
        ])->assertUnprocessable()->assertJsonValidationErrors('criteria.locations');
        $this->assertDatabaseCount('saved_searches', 0);

        $id = $this->postJson('/api/saved-searches', ['name' => 'Un seul', 'criteria' => ['location' => 'Mermoz']])
            ->assertCreated()->json('data.id');
        $this->patchJson("/api/saved-searches/{$id}", ['criteria' => ['location' => 'Mermoz', 'locations' => ['Ngor', 'Yoff']]])
            ->assertUnprocessable()->assertJsonValidationErrors('criteria.locations');
        $this->assertSame(['location' => 'Mermoz'], SavedSearch::find($id)->criteria);

        // Un `location` vide n'est pas un quartier : la liste passe.
        $this->patchJson("/api/saved-searches/{$id}", ['criteria' => ['location' => null, 'locations' => ['Ngor', 'Yoff']]])
            ->assertOk();
    }

    /** 2 à 12 quartiers, chacun de 100 caractères au plus. */
    public function test_les_bornes_de_la_liste(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $douze = array_map(fn (int $i) => "Quartier {$i}", range(1, 12));

        $this->postJson('/api/saved-searches', ['name' => 'Treize', 'criteria' => ['locations' => [...$douze, 'Quartier 13']]])
            ->assertUnprocessable()->assertJsonValidationErrors('criteria.locations');
        $this->postJson('/api/saved-searches', ['name' => 'Un', 'criteria' => ['locations' => ['Mermoz']]])
            ->assertUnprocessable()->assertJsonValidationErrors('criteria.locations');
        $this->postJson('/api/saved-searches', ['name' => 'Long', 'criteria' => ['locations' => ['Mermoz', str_repeat('a', 101)]]])
            ->assertUnprocessable()->assertJsonValidationErrors('criteria.locations.1');
        $this->postJson('/api/saved-searches', ['name' => 'Objet', 'criteria' => ['locations' => ['Mermoz', ['Ngor']]]])
            ->assertUnprocessable();
        $this->assertDatabaseCount('saved_searches', 0);

        $this->postJson('/api/saved-searches', ['name' => 'Douze', 'criteria' => ['locations' => $douze]])->assertCreated();
    }

    /** L'alerte prévient pour chacun des quartiers listés, et pour eux seuls. */
    public function test_l_alerte_capte_chacun_des_quartiers_et_eux_seuls(): void
    {
        $mermoz = $this->bien('Mermoz');
        $almadies = $this->bien('Almadies');
        $ngor = $this->bien('Ngor');
        $this->bien('Médina');
        $this->indexProperties();

        $alerte = app(PropertySearchService::class)->alertMatches(
            SavedSearchCriteria::toSearchParams(['locations' => self::TROIS]),
            null,
            now(),
            10,
        );

        $ids = $alerte['properties']->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $attendus = [$mermoz->id, $almadies->id, $ngor->id];
        sort($attendus);
        $this->assertSame($attendus, $ids);
        $this->assertSame(3, $alerte['total']);
    }

    /** « Voir les N biens » : la liste à virgules que lit la page publique, pas `locations[0]=`. */
    public function test_le_lien_de_l_alerte_porte_la_liste_a_virgules(): void
    {
        $user = User::factory()->create(['preferred_language' => 'fr']);
        $search = SavedSearch::query()->create([
            'user_id' => $user->id,
            'name' => 'Bord de mer',
            'criteria' => ['locations' => self::TROIS, 'contract_type' => 'rent'],
        ]);

        $texte = (new SavedSearchMatchesNotification($search, new Collection, 3))->toWhatsapp($user);

        $this->assertStringContainsString('locations=Mermoz%2CAlmadies%2CNgor', $texte);
        $this->assertStringNotContainsString('locations%5B', $texte);
    }

    private function bien(string $quartier): Property
    {
        $bien = Property::factory()->published()->create(['featured' => false, 'published_at' => now()->subHour()]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            'city' => 'Dakar',
            'neighborhood' => $quartier,
            'latitude' => 14.7,
            'longitude' => -17.45,
        ]);

        return $bien;
    }
}
