<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use App\Services\Tags\TagCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-846 (P30.02) — un équipement du catalogue ne se fusionne pas dans un autre. La fusion
 * supprime la source, et `tags:sync-catalog`, joué à chaque déploiement, recrée tout nom du
 * catalogue absent : la fusion était défaite au déploiement suivant, l'équipement revenant dans
 * les listes sans bien. Une proposition se fusionne toujours, y compris dans le catalogue.
 */
class TagCatalogFusionTest extends TestCase
{
    use RefreshDatabase;

    private function equipement(string $nom): Tag
    {
        return Tag::query()->where('name', $nom)->firstOrFail();
    }

    public function test_la_fusion_d_un_equipement_du_catalogue_est_refusee_et_tient_au_deploiement(): void
    {
        app(TagCatalog::class)->synchroniser();
        $this->actingAsRole('super_admin');
        $ventilateurs = $this->equipement('Ventilateurs');
        $climatisation = $this->equipement('Climatisation');
        $bien = Property::factory()->create();
        $bien->tags()->attach($ventilateurs);

        $this->postJson("/api/admin/tags/{$ventilateurs->id}/merge", ['into_id' => $climatisation->id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'tags.catalog_merge_forbidden');

        $this->assertTrue(Tag::query()->whereKey($ventilateurs->id)->exists());
        $this->assertSame([$ventilateurs->id], $bien->refresh()->tags->pluck('id')->all());

        app(TagCatalog::class)->synchroniser();
        $this->assertSame(1, Tag::query()->where('name', 'Ventilateurs')->count());
        $this->assertSame($ventilateurs->id, $this->equipement('Ventilateurs')->id);
    }

    /** Le nom se compare comme `synchroniser()` : casse repliée. */
    public function test_un_nom_du_catalogue_a_la_casse_pres_est_refuse_aussi(): void
    {
        $this->actingAsRole('super_admin');
        $source = Tag::factory()->create(['name' => 'VENTILATEURS', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);
        $cible = Tag::factory()->create(['name' => 'Climatisation', 'type' => TagType::Amenity]);

        $this->postJson("/api/admin/tags/{$source->id}/merge", ['into_id' => $cible->id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'tags.catalog_merge_forbidden');
    }

    public function test_une_proposition_se_fusionne_toujours_dans_le_catalogue(): void
    {
        app(TagCatalog::class)->synchroniser();
        $this->actingAsRole('super_admin');
        $source = Tag::factory()->create(['name' => 'Clim', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);
        $climatisation = $this->equipement('Climatisation');

        $this->postJson("/api/admin/tags/{$source->id}/merge", ['into_id' => $climatisation->id])
            ->assertOk()
            ->assertJsonPath('data.id', $climatisation->id);

        $this->assertFalse(Tag::query()->whereKey($source->id)->exists());
    }
}
