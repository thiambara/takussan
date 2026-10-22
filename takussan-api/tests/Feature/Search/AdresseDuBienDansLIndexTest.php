<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * P122.01, P122.02 (TCK-1262) — l'adresse d'un bien s'écrit APRÈS le bien, et l'observateur de
 * Scout indexe au `saved` du bien : sous `SCOUT_AFTER_COMMIT=false` (défaut de `config/scout.php`,
 * réglage de la suite), le document gardait l'adresse d'avant, ou aucune. Le bien est réindexé
 * après l'écriture de son adresse, à la création comme à la modification.
 */
class AdresseDuBienDansLIndexTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $this->agency->id]);
        $this->agent->forceFill([
            'first_name' => 'Awa',
            'phone' => '+221770000122',
            'phone_verified_at' => now(),
            'terms_accepted_at' => now(),
        ])->save();
    }

    /** @return array<string, mixed>|null */
    private function document(Property $bien): ?array
    {
        $this->waitForMeilisearch();
        $resultat = Property::search('')->where('id', $bien->id)->raw();

        return $resultat['hits'][0] ?? null;
    }

    /** @param  array<string, mixed>  $champs */
    private function creer(array $champs): TestResponse
    {
        return $this->postJson('/api/properties', array_merge([
            'title' => 'Appartement F3',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
            'agency_id' => $this->agency->id,
        ], $champs));
    }

    /** Un bien public en ligne, indexé, sans adresse ou avec celle donnée. */
    private function bienPublic(?array $adresse = null): Property
    {
        $id = $this->creer(array_filter(['address' => $adresse]))->assertCreated()->json('data.id');
        $bien = Property::query()->findOrFail($id);
        $bien->forceFill(['status' => 'available', 'visibility' => 'public', 'published_at' => now()])->save();
        $bien->refresh()->load('address')->searchable();

        return $bien;
    }

    public function test_une_adresse_ajoutee_a_un_bien_en_ligne_entre_dans_l_index(): void
    {
        $bien = $this->bienPublic();
        $this->assertNull($this->document($bien)['city'] ?? null);

        $this->patchJson("/api/properties/{$bien->id}", [
            'address' => ['city' => 'Thies', 'neighborhood' => 'Randoulene', 'latitude' => 14.79, 'longitude' => -16.93],
        ])->assertOk();

        $document = $this->document($bien);
        $this->assertSame('Thies', $document['city'] ?? null);
        $this->assertSame(['lat' => 14.79, 'lng' => -16.93], $document['_geo'] ?? null);
    }

    public function test_une_adresse_changee_remplace_l_ancienne_dans_l_index(): void
    {
        $bien = $this->bienPublic(['city' => 'Dakar', 'neighborhood' => 'Almadies']);
        $this->assertSame('Dakar', $this->document($bien)['city'] ?? null);

        $this->patchJson("/api/properties/{$bien->id}", [
            'address' => ['city' => 'Thies', 'neighborhood' => 'Randoulene'],
        ])->assertOk();

        $document = $this->document($bien);
        $this->assertSame('Thies', $document['city'] ?? null);
        $this->assertSame('Randoulene', $document['neighborhood'] ?? null);
    }

    public function test_un_bien_cree_public_est_indexe_avec_son_adresse(): void
    {
        $id = $this->creer([
            'visibility' => 'public',
            'status' => 'available',
            'accept_terms' => true,
            'address' => ['city' => 'Thies', 'neighborhood' => 'Randoulene', 'latitude' => 14.79, 'longitude' => -16.93],
        ])->assertCreated()->json('data.id');

        $document = $this->document(Property::query()->findOrFail($id));
        $this->assertNotNull($document, 'le bien créé public est dans l\'index');
        $this->assertSame('Thies', $document['city'] ?? null);
        $this->assertSame(['lat' => 14.79, 'lng' => -16.93], $document['_geo'] ?? null);
    }
}
