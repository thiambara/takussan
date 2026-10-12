<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §7) — renommer ou fusionner un équipement RÉINDEXE ses biens : la recherche
 * filtre sur les NOMS des étiquettes (`Property::toSearchableArray`, `tags` filtrable). Sans
 * réindexation, les biens resteraient trouvables sous l'ancien nom et introuvables sous le nouveau.
 *
 * DEUX biens par cas, et non un : une réindexation qui ne traiterait que le premier bien resterait
 * verte sur un seul (relevé de la re-vérification du lot D).
 */
class TagModerationSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @return list<int> */
    private function biensEquipesDe(string $nom): array
    {
        return Property::search('')->where('tags', $nom)->keys()->map(fn ($k) => (int) $k)->sort()->values()->all();
    }

    /** @return list<int> deux biens publiés qui portent l'étiquette */
    private function deuxBiensAvec(Tag $tag): array
    {
        $ids = [];
        foreach ([1, 2] as $_) {
            $bien = Property::factory()->published()->create();
            // Le cas réel : la proposition rattachée par son AUTEUR — la seule attache d'une
            // proposition en attente que la recherche indexe (`Property::tagsVisibles`, D9).
            $bien->tags()->attach($tag->id, ['attached_by_id' => $tag->created_by_id]);
            $ids[] = $bien->id;
        }
        sort($ids);

        return $ids;
    }

    private function proposition(string $nom): Tag
    {
        return Tag::factory()->create(['name' => $nom, 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);
    }

    public function test_un_renommage_rend_les_biens_trouvables_sous_le_nouveau_nom(): void
    {
        $this->actingAsRole('super_admin');
        $tag = $this->proposition('Piscinne');
        $biens = $this->deuxBiensAvec($tag);
        $this->indexProperties();
        $this->assertSame($biens, $this->biensEquipesDe('Piscinne'));

        $this->patchJson("/api/admin/tags/{$tag->id}", ['name' => 'Piscine chauffée'])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame($biens, $this->biensEquipesDe('Piscine chauffée'));
        $this->assertSame([], $this->biensEquipesDe('Piscinne'));
    }

    /**
     * La page catalogue du super-admin renomme par `PATCH /api/tags/{id}` (`TagController`), pas
     * par la file de modération : même effet attendu sur l'index (re-vérification 3 du lot D).
     */
    public function test_un_renommage_par_le_catalogue_reindexe_aussi(): void
    {
        $this->actingAsRole('super_admin');
        $tag = Tag::factory()->create(['name' => 'Piscinne', 'type' => TagType::Amenity]);
        $biens = $this->deuxBiensAvec($tag);
        $this->indexProperties();
        $this->assertSame($biens, $this->biensEquipesDe('Piscinne'));

        $this->patchJson("/api/tags/{$tag->id}", ['name' => 'Piscine chauffée'])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame($biens, $this->biensEquipesDe('Piscine chauffée'));
        $this->assertSame([], $this->biensEquipesDe('Piscinne'));
    }

    public function test_un_renommage_par_le_catalogue_sur_un_nom_pris_rend_409(): void
    {
        $this->actingAsRole('super_admin');
        Tag::factory()->create(['name' => 'Jacuzzi', 'type' => TagType::Amenity]);
        $tag = Tag::factory()->create(['name' => 'Jacuzi', 'type' => TagType::Amenity]);

        $this->patchJson("/api/tags/{$tag->id}", ['name' => 'JACUZZI'])->assertStatus(409);
        $this->assertSame('Jacuzi', $tag->refresh()->name);
    }

    /** `tags:sync-catalog` approuve une proposition qui porte un nom du catalogue : ses biens deviennent trouvables partout. */
    public function test_le_catalogue_qui_approuve_une_proposition_reindexe_ses_biens(): void
    {
        $tag = $this->proposition('Piscine');
        $bien = Property::factory()->published()->create();
        $bien->tags()->attach($tag->id, ['attached_by_id' => User::factory()->create()->id]);
        $this->indexProperties();
        $this->assertSame([], $this->biensEquipesDe('Piscine'), 'témoin : rattachée par un tiers, invisible tant qu\'elle attend');

        $this->artisan('tags:sync-catalog')->assertSuccessful();
        $this->waitForMeilisearch();

        $this->assertSame(ReferentialStatus::Approved, $tag->refresh()->status);
        $this->assertSame([$bien->id], $this->biensEquipesDe('Piscine'));
    }

    public function test_une_fusion_rend_les_biens_trouvables_sous_le_nom_de_la_cible(): void
    {
        $this->actingAsRole('super_admin');
        $source = $this->proposition('Jacuzi');
        $cible = Tag::factory()->create(['name' => 'Jacuzzi', 'type' => TagType::Amenity]);
        $biens = $this->deuxBiensAvec($source);
        $this->indexProperties();
        $this->assertSame($biens, $this->biensEquipesDe('Jacuzi'));

        $this->postJson("/api/admin/tags/{$source->id}/merge", ['into_id' => $cible->id])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame($biens, $this->biensEquipesDe('Jacuzzi'));
        $this->assertSame([], $this->biensEquipesDe('Jacuzi'));
    }

    /** Un refus retire le nom de l'index : un texte que la modération a écarté n'est plus trouvable. */
    public function test_un_refus_rend_les_biens_introuvables_sous_ce_nom(): void
    {
        $this->actingAsRole('super_admin');
        $tag = $this->proposition('Puits privé');
        $biens = $this->deuxBiensAvec($tag);
        $this->indexProperties();
        $this->assertSame($biens, $this->biensEquipesDe('Puits privé'));

        $this->postJson("/api/admin/tags/{$tag->id}/reject")->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([], $this->biensEquipesDe('Puits privé'));
    }
}
