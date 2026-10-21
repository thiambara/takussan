<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use App\Services\Geo\GeoNeighborhoodModeration;
use App\Services\Tags\TagModeration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Scout\EngineManager;
use Meilisearch\Client;
use Meilisearch\Exceptions\CommunicationException;
use Tests\TestCase;

/**
 * TCK-1098 (P90.03) — Meilisearch injoignable : un geste de modération validé en base lève à la
 * réindexation, comme avant, mais sa ligne `activity_log` est écrite AVANT. Sans elle, le
 * super-admin recevait une 500 pour un geste fait, et rien ne le traçait.
 *
 * Ce que ce test NE garde pas : que le geste réponde 200 malgré l'index (reste de la piste, au
 * porteur).
 */
class ModerationMoteurInjoignableTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create();
    }

    /** Synchronisation rallumée (sinon `GeoReindexation` ne fait rien), moteur sur un port fermé. */
    private function moteurInjoignable(): void
    {
        Property::enableSearchSyncing();
        config(['scout.meilisearch.host' => 'http://127.0.0.1:9']);
        $this->app->forgetInstance(Client::class);
        $this->app->forgetInstance(EngineManager::class);
    }

    private function journalise(string $evenement): int
    {
        return DB::table('activity_log')->where('event', $evenement)->count();
    }

    private function leveCommunication(callable $geste): void
    {
        try {
            $geste();
            $this->fail('le geste devait lever : l\'index est injoignable');
        } catch (CommunicationException) {
            $this->addToAssertionCount(1);
        }
    }

    private function propositionSurUnBien(string $nom): Tag
    {
        $tag = Tag::factory()->create(['name' => $nom, 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);
        Property::factory()->published()->create()->tags()->attach($tag->id, ['attached_by_id' => $tag->created_by_id]);

        return $tag;
    }

    public function test_approuver_un_equipement_journalise_meme_si_l_index_echoue(): void
    {
        $tag = $this->propositionSurUnBien('Piscinne');
        $this->moteurInjoignable();

        $this->leveCommunication(fn () => app(TagModeration::class)->approuver($tag, $this->admin));

        $this->assertSame(ReferentialStatus::Approved, $tag->refresh()->status);
        $this->assertSame(1, $this->journalise('super_admin_tag_approved'));
    }

    public function test_rejeter_un_equipement_journalise_meme_si_l_index_echoue(): void
    {
        $tag = $this->propositionSurUnBien('Piscinne');
        $this->moteurInjoignable();

        $this->leveCommunication(fn () => app(TagModeration::class)->rejeter($tag, $this->admin));

        $this->assertSame(1, $this->journalise('super_admin_tag_rejected'));
    }

    public function test_renommer_un_equipement_journalise_meme_si_l_index_echoue(): void
    {
        $tag = $this->propositionSurUnBien('Piscinne');
        $this->moteurInjoignable();

        $this->leveCommunication(fn () => app(TagModeration::class)->renommer($tag, 'Piscine chauffée', $this->admin));

        $this->assertSame(1, $this->journalise('super_admin_tag_renamed'));
    }

    public function test_fusionner_un_equipement_journalise_meme_si_l_index_echoue(): void
    {
        $source = $this->propositionSurUnBien('Piscinne');
        $cible = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Approved]);
        $this->moteurInjoignable();

        $this->leveCommunication(fn () => app(TagModeration::class)->fusionner($source, $cible, $this->admin));

        $this->assertSame(1, $this->journalise('super_admin_tag_merged'));
    }

    public function test_modifier_un_tag_du_catalogue_journalise_meme_si_l_index_echoue(): void
    {
        $this->actingAsRole('super_admin');
        $tag = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Property::factory()->published()->create()->tags()->attach($tag->id);
        $this->moteurInjoignable();

        // `type` change la visibilité de l'étiquette dans l'index : les biens sont réindexés.
        $this->putJson("/api/tags/{$tag->id}", ['type' => TagType::Label->value])->assertStatus(500);

        $this->assertSame(TagType::Label, $tag->refresh()->type);
        $this->assertSame(1, $this->journalise('super_admin_tag_updated'));
    }

    private function quartierSurUnBien(GeoCity $ville, string $nom, string $slug): GeoNeighborhood
    {
        $quartier = GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => $nom, 'slug' => $slug]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => Property::factory()->published()->create()->id,
            'geo_city_id' => $ville->id,
            'geo_neighborhood_id' => $quartier->id,
            'city' => $ville->name,
            'neighborhood' => $nom,
        ]);

        return $quartier;
    }

    public function test_renommer_un_quartier_journalise_meme_si_l_index_echoue(): void
    {
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $quartier = $this->quartierSurUnBien($ville, 'Mermos', 'mermos');
        $this->moteurInjoignable();

        $this->leveCommunication(fn () => app(GeoNeighborhoodModeration::class)->renommer($quartier, 'Mermoz', $this->admin));

        $this->assertSame('Mermoz', $quartier->refresh()->name);
        $this->assertSame(1, $this->journalise('super_admin_geo_neighborhood_renamed'));
    }

    public function test_fusionner_un_quartier_journalise_meme_si_l_index_echoue(): void
    {
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $source = $this->quartierSurUnBien($ville, 'Mermos', 'mermos');
        $cible = GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => 'Mermoz', 'slug' => 'mermoz']);
        $this->moteurInjoignable();

        $this->leveCommunication(fn () => app(GeoNeighborhoodModeration::class)->fusionner($source, $cible, $this->admin));

        $this->assertSame($cible->id, $source->refresh()->merged_into_id);
        $this->assertSame(1, $this->journalise('super_admin_geo_neighborhood_merged'));
    }
}
