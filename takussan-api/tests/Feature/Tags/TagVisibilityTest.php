<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 — la liste des étiquettes : un équipement proposé n'apparaît qu'à son auteur (et à la
 * console) ; un refusé, à la console seulement. Le type `feature` ne se crée plus.
 */
class TagVisibilityTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function noms(): array
    {
        return collect($this->getJson('/api/tags?filter[type]=amenity&per_page=100')->assertOk()->json('data'))->pluck('name')->sort()->values()->all();
    }

    public function test_un_agent_voit_les_approuves_et_ses_propositions(): void
    {
        $moi = $this->actingAsRole('agent');
        $autre = $this->actingAsRole('agent');
        Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Tag::factory()->create(['name' => 'Puits', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $moi->id]);
        Tag::factory()->create(['name' => 'Hammam', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $autre->id]);
        Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->actingAs($moi);

        $this->assertSame(['Piscine', 'Puits'], $this->noms());
        $this->assertSame('pending', collect($this->getJson('/api/tags?filter[type]=amenity')->json('data'))->firstWhere('name', 'Puits')['status']);
    }

    public function test_la_console_voit_tout(): void
    {
        Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);
        $this->actingAsRole('super_admin');

        $this->assertSame(['Garage', 'Piscine'], $this->noms());
    }

    public function test_le_type_feature_ne_se_cree_plus(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/tags', ['name' => 'Cheminée', 'type' => 'feature'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);
        $this->patchJson("/api/tags/{$tag->id}", ['type' => 'feature'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');
    }
}
