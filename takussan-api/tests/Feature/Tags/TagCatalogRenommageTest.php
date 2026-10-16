<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use App\Services\Tags\TagCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-729 (P30.01) — un équipement du catalogue ne se renomme pas. Le front le traduit par son
 * slug, et `tags:sync-catalog` le cherche par son nom : renommé, il gardait son ancien libellé à
 * l'écran, et le déploiement suivant recréait l'ancien nom sous `<slug>-2`, sans traduction.
 * Seules les propositions (tout équipement hors de `TagCatalog::EQUIPEMENTS`) se renomment.
 */
class TagCatalogRenommageTest extends TestCase
{
    use RefreshDatabase;

    private function piscine(): Tag
    {
        app(TagCatalog::class)->synchroniser();

        return Tag::query()->where('name', 'Piscine')->firstOrFail();
    }

    public function test_la_file_de_moderation_refuse_de_renommer_un_equipement_du_catalogue(): void
    {
        $this->actingAsRole('super_admin');
        $tag = $this->piscine();

        $this->patchJson("/api/admin/tags/{$tag->id}", ['name' => 'Piscine privée'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'tags.catalog_rename_forbidden');

        $this->assertSame('Piscine', $tag->refresh()->name);
        app(TagCatalog::class)->synchroniser();
        $this->assertSame(['Piscine|piscine'], $this->lignesDuSlug('piscine'));
    }

    public function test_la_page_catalogue_refuse_aussi(): void
    {
        $this->actingAsRole('super_admin');
        $tag = $this->piscine();

        $this->putJson("/api/tags/{$tag->id}", ['name' => 'Piscine chauffée'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'tags.catalog_rename_forbidden');

        $this->assertSame('Piscine', $tag->refresh()->name);
        app(TagCatalog::class)->synchroniser();
        $this->assertSame(['Piscine|piscine'], $this->lignesDuSlug('piscine'));
    }

    /** Le nom se compare comme l'index `tags_name_lower_unique` : casse repliée, accents gardés. */
    public function test_une_proposition_qui_porte_un_nom_du_catalogue_a_la_casse_pres_est_refusee_aussi(): void
    {
        $this->actingAsRole('super_admin');
        $tag = Tag::factory()->create(['name' => 'SÈCHE-LINGE', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);

        $this->patchJson("/api/admin/tags/{$tag->id}", ['name' => 'Sèche linge'])->assertStatus(409)->assertJsonPath('code', 'tags.catalog_rename_forbidden');
    }

    public function test_une_proposition_se_renomme_toujours(): void
    {
        $this->actingAsRole('super_admin');
        $this->piscine();
        $tag = Tag::factory()->create(['name' => 'Piscinne', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Approved, 'created_by_id' => User::factory()->create()->id]);

        $this->patchJson("/api/admin/tags/{$tag->id}", ['name' => 'Piscine à débordement'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Piscine à débordement');
    }

    /** @return list<string> */
    private function lignesDuSlug(string $slug): array
    {
        return Tag::query()->where('slug', 'like', $slug.'%')->orderBy('slug')->get()
            ->map(fn (Tag $t) => $t->name.'|'.$t->slug)->all();
    }
}
