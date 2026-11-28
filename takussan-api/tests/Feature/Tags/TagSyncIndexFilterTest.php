<?php

namespace Tests\Feature\Tags;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\TagType;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-1099 (P90.01) — synchroniser les équipements d'un bien le réindexe, mais seulement s'il
 * doit l'être (`Property::shouldBeSearchable()`, ADR-0048) : `searchable()` d'un modèle ne le
 * juge pas. Un brouillon privé entrait dans l'index, et un bien d'agence `inactive` y revenait,
 * compté par la recherche publique (`meta.total = 1`, `data = []`).
 */
class TagSyncIndexFilterTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private User $proprietaire;

    private Tag $piscine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->proprietaire = User::factory()->create();
        $this->piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Sanctum::actingAs($this->proprietaire);
    }

    /** @return list<int> */
    private function indexes(): array
    {
        return Property::search('')->keys()->map(fn ($k) => (int) $k)->values()->all();
    }

    public function test_un_brouillon_prive_n_entre_pas_dans_l_index_par_ses_equipements(): void
    {
        $bien = Property::factory()->create([
            'user_id' => $this->proprietaire->id,
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
        ]);
        $this->indexProperties();
        $this->assertSame([], $this->indexes(), 'témoin : le brouillon n\'est pas indexé');

        $this->postJson("/api/properties/{$bien->id}/tags", ['tag_ids' => [$this->piscine->id]])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([], $this->indexes());
    }

    public function test_un_bien_d_agence_inactive_ne_revient_pas_dans_la_recherche_publique(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Inactive]);
        // TCK-1705 (P153.01) — sur un bien d'agence, `user_id` ne vaut titre que pour qui a un
        // profil dans l'agence : le propriétaire y est bailleur.
        OwnerProfile::factory()->create(['user_id' => $this->proprietaire->id, 'agency_id' => $agence->id]);
        $bien = Property::factory()->published()->create([
            'user_id' => $this->proprietaire->id,
            'agency_id' => $agence->id,
            'published_at' => now()->subHour(),
        ]);
        $this->piscine->properties()->attach($bien->id);
        $this->indexProperties();
        $this->getJson('/api/public/properties/search')->assertOk()->assertJsonPath('meta.total', 0);

        $this->postJson("/api/properties/{$bien->id}/tags", ['tag_ids' => []])->assertOk();
        $this->waitForMeilisearch();

        $this->getJson('/api/public/properties/search')->assertOk()
            ->assertJsonPath('meta.total', 0)
            ->assertJsonCount(0, 'data');
        $this->assertSame([], $this->indexes());
    }

    public function test_retirer_un_equipement_d_un_bien_d_agence_inactive_ne_l_indexe_pas(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Inactive]);
        // TCK-1705 (P153.01) — sur un bien d'agence, `user_id` ne vaut titre que pour qui a un
        // profil dans l'agence : le propriétaire y est bailleur.
        OwnerProfile::factory()->create(['user_id' => $this->proprietaire->id, 'agency_id' => $agence->id]);
        $bien = Property::factory()->published()->create([
            'user_id' => $this->proprietaire->id,
            'agency_id' => $agence->id,
            'published_at' => now()->subHour(),
        ]);
        $this->piscine->properties()->attach($bien->id);
        $this->indexProperties();

        $this->deleteJson("/api/properties/{$bien->id}/tags/{$this->piscine->id}")->assertNoContent();
        $this->waitForMeilisearch();

        $this->assertSame([], $this->indexes());
    }

    // --- TCK-633 lot E (ex-`TagSyncReindexTest`, versé par TCK-3017) : le témoin public, jugé par le filtre `tags` de la
    // recherche publique et non par la seule présence dans l'index — un bien déjà indexé à sa création y serait resté
    // sans que la synchronisation le réindexe. ---------------------------------------------------------------

    private function bienPublicADakar(): Property
    {
        $bien = Property::factory()->published()->create([
            'user_id' => $this->proprietaire->id,
            'featured' => false,
            'published_at' => now()->subHour(),
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'latitude' => 14.7,
            'longitude' => -17.45,
        ]);
        $this->indexProperties();

        return $bien;
    }

    /** @return list<int> */
    private function idsFiltresParPiscine(): array
    {
        $reponse = $this->getJson('/api/public/properties/search?'.http_build_query(['tags' => 'Piscine', 'per_page' => 100]))->assertOk();

        return array_values(array_map('intval', array_column($reponse->json('data') ?? [], 'id')));
    }

    public function test_rattacher_un_equipement_rend_le_bien_public_trouvable_par_lui(): void
    {
        $bien = $this->bienPublicADakar();
        $this->assertSame([], $this->idsFiltresParPiscine(), 'témoin : pas encore d\'équipement');

        $this->postJson("/api/properties/{$bien->id}/tags", ['tag_ids' => [$this->piscine->id]])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([$bien->id], $this->idsFiltresParPiscine());
        $this->assertSame([$bien->id], $this->indexes());
    }

    public function test_retirer_un_equipement_rend_le_bien_introuvable_par_lui(): void
    {
        $bien = $this->bienPublicADakar();
        $this->postJson("/api/properties/{$bien->id}/tags", ['tag_ids' => [$this->piscine->id]])->assertOk();
        $this->waitForMeilisearch();
        $this->assertSame([$bien->id], $this->idsFiltresParPiscine(), 'témoin');

        $this->deleteJson("/api/properties/{$bien->id}/tags/{$this->piscine->id}")->assertNoContent();
        $this->waitForMeilisearch();

        $this->assertSame([], $this->idsFiltresParPiscine());
    }
}
