<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Laravel\Scout\EngineManager;
use Laravel\Scout\ModelObserver;
use Meilisearch\Client;
use Tests\TestCase;

/**
 * TCK-1101 (P90.06) — la synchronisation de Scout coupée (suite hors recherche, seed sous moteur
 * coupé), les équipements d'un bien ne touchent pas l'index, comme `GeoReindexation` et
 * `BoostLifecycle::writeProperty`. Le moteur est rebranché sur un port fermé : toute écriture
 * lèverait, et la route rendrait 500.
 */
class TagSyncSynchronisationCoupeeTest extends TestCase
{
    use RefreshDatabase;

    private Property $bien;

    private Tag $piscine;

    protected function setUp(): void
    {
        parent::setUp();
        $proprietaire = User::factory()->create();
        $this->piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        $this->bien = Property::factory()->published()->create(['user_id' => $proprietaire->id]);
        Sanctum::actingAs($proprietaire);

        $this->assertTrue(ModelObserver::syncingDisabledFor(Property::class), 'témoin : `Tests\TestCase` coupe la synchronisation');
        config(['scout.meilisearch.host' => 'http://127.0.0.1:9']);
        $this->app->forgetInstance(Client::class);
        $this->app->forgetInstance(EngineManager::class);
    }

    public function test_synchroniser_les_equipements_n_ecrit_pas_dans_l_index(): void
    {
        $this->postJson("/api/properties/{$this->bien->id}/tags", ['tag_ids' => [$this->piscine->id]])->assertOk();
    }

    public function test_retirer_un_equipement_n_ecrit_pas_dans_l_index(): void
    {
        $this->bien->tags()->attach($this->piscine->id);

        $this->deleteJson("/api/properties/{$this->bien->id}/tags/{$this->piscine->id}")->assertNoContent();
    }
}
