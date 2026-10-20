<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\Tag;
use App\Models\User;
use App\Services\Search\PropertySearchService;
use App\Support\SavedSearchCriteria;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-1081 (P67.03) — renommer ou fusionner un équipement réécrit `criteria.tags` des recherches
 * sauvegardées (nom source → nom cible), dans la même transaction.
 *
 * Le filtre `tags` est une égalité sur le NOM indexé, une clause par équipement : une alerte qui
 * portait l'ancien nom ne rendait plus rien, et une alerte à deux équipements se taisait entière.
 */
class TagModerationSavedSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_renommer_et_fusionner_reecrivent_les_criteres_et_l_alerte_retrouve_le_bien(): void
    {
        $this->actingAsRole('super_admin');
        $jacuzzi = $this->approuve('Jacuzzi');
        $pool = $this->approuve('Pool');
        $bassin = $this->approuve('Bassin');
        $piscine = $this->approuve('Piscine');

        $avecJacuzzi = $this->bienAvec($jacuzzi);
        $avecPoolEtPiscine = $this->bienAvec($pool, $piscine);

        $liste = $this->recherche(['tags' => ['Jacuzzi']]);
        $chaine = $this->recherche(['tags' => 'Piscine,Pool', 'furnished' => false]);
        $doublon = $this->recherche(['tags' => ['Pool', 'Bassin']]);
        $sansTags = $this->recherche(['price_max' => 500_000]);
        $autre = $this->recherche(['tags' => ['Piscine']]);
        $this->indexProperties();
        $this->assertSame([$avecJacuzzi->id], $this->alerte($liste));
        $this->assertSame([$avecPoolEtPiscine->id], $this->alerte($chaine));

        $this->patchJson("/api/admin/tags/{$jacuzzi->id}", ['name' => 'Jacuzzi extérieur'])->assertOk();
        $this->postJson("/api/admin/tags/{$pool->id}/merge", ['into_id' => $bassin->id])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame(['tags' => ['Jacuzzi extérieur']], $liste->refresh()->criteria);
        // La forme est gardée : une chaîne reste une chaîne, l'ordre et les autres clés aussi.
        $this->assertSame(['tags' => 'Piscine,Bassin', 'furnished' => false], $chaine->refresh()->criteria);
        $this->assertSame(['tags' => ['Bassin']], $doublon->refresh()->criteria);
        $this->assertSame(['price_max' => 500_000], $sansTags->refresh()->criteria);
        $this->assertSame(['tags' => ['Piscine']], $autre->refresh()->criteria);

        $this->assertSame([$avecJacuzzi->id], $this->alerte($liste));
        $this->assertSame([$avecPoolEtPiscine->id], $this->alerte($chaine));
        $this->assertSame([$avecPoolEtPiscine->id], $this->alerte($doublon));
    }

    private function approuve(string $nom): Tag
    {
        return Tag::factory()->create([
            'name' => $nom,
            'type' => TagType::Amenity,
            'status' => ReferentialStatus::Approved,
            'created_by_id' => User::factory()->create()->id,
        ]);
    }

    private function bienAvec(Tag ...$tags): Property
    {
        $bien = Property::factory()->published()->create(['featured' => false, 'furnished' => false, 'published_at' => now()->subHour()]);
        foreach ($tags as $tag) {
            $bien->tags()->attach($tag->id, ['attached_by_id' => $tag->created_by_id]);
        }

        return $bien;
    }

    /** @param  array<string, mixed>  $criteres */
    private function recherche(array $criteres): SavedSearch
    {
        return SavedSearch::factory()->create(['criteria' => $criteres]);
    }

    /** @return list<int> */
    private function alerte(SavedSearch $recherche): array
    {
        $resultat = app(PropertySearchService::class)->alertMatches(
            SavedSearchCriteria::toSearchParams($recherche->refresh()->criteria),
            null,
            now(),
        );

        return $resultat['properties']->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }
}
