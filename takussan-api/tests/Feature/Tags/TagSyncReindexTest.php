<?php

namespace Tests\Feature\Tags;

use App\Models\Address;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 (lot E, décision 4 du porteur) — le filtre Équipements de la recherche lit l'INDEX. Les
 * équipements d'un bien s'écrivent par leur propre route (`POST /api/properties/{id}/tags`, après
 * la création du bien par l'assistant), qui ne touche pas la ligne `properties` : sans
 * réindexation explicite, un bien neuf restait introuvable par ses équipements jusqu'à son
 * prochain enregistrement.
 */
class TagSyncReindexTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private User $proprietaire;

    private Property $bien;

    private Tag $piscine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->proprietaire = User::factory()->create();
        $this->piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        $this->bien = Property::factory()->published()->create([
            'user_id' => $this->proprietaire->id,
            'featured' => false,
            'published_at' => now()->subHour(),
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $this->bien->id,
            'country' => 'SN',
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'latitude' => 14.7,
            'longitude' => -17.45,
        ]);
        $this->indexProperties();
        Sanctum::actingAs($this->proprietaire);
    }

    /** @return list<int> */
    private function idsFiltresParPiscine(): array
    {
        $reponse = $this->getJson('/api/public/properties/search?'.http_build_query(['tags' => 'Piscine', 'per_page' => 100]))->assertOk();

        return array_values(array_map('intval', array_column($reponse->json('data') ?? [], 'id')));
    }

    public function test_rattacher_un_equipement_rend_le_bien_trouvable_par_lui(): void
    {
        $this->assertSame([], $this->idsFiltresParPiscine(), 'témoin : pas encore d\'équipement');

        $this->postJson("/api/properties/{$this->bien->id}/tags", ['tag_ids' => [$this->piscine->id]])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([$this->bien->id], $this->idsFiltresParPiscine());
    }

    public function test_retirer_un_equipement_rend_le_bien_introuvable_par_lui(): void
    {
        $this->postJson("/api/properties/{$this->bien->id}/tags", ['tag_ids' => [$this->piscine->id]])->assertOk();
        $this->waitForMeilisearch();
        $this->assertSame([$this->bien->id], $this->idsFiltresParPiscine(), 'témoin');

        $this->deleteJson("/api/properties/{$this->bien->id}/tags/{$this->piscine->id}")->assertNoContent();
        $this->waitForMeilisearch();

        $this->assertSame([], $this->idsFiltresParPiscine());
    }
}
