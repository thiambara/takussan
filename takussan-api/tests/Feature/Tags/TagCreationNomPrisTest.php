<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1104 (P92.05) — la création d'une étiquette par la console reprend les deux règles déjà
 * écrites : un nom pris à la casse près rend 409 `tags.name_taken` (comme le renommage,
 * `TagModeration::renommer`), et un nom distinct dont le slug est pris reçoit un slug suffixé
 * (`TagCatalog::slugLibre`, comme les propositions). Les trois cas rendaient 500.
 */
class TagCreationNomPrisTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);
    }

    private function creer(string $nom)
    {
        return $this->postJson('/api/tags', ['name' => $nom, 'type' => TagType::Amenity->value]);
    }

    public function test_un_nom_deja_pris_rend_409(): void
    {
        $this->creer('Piscine')->assertCreated();

        $this->creer('Piscine')->assertStatus(409)->assertJsonPath('code', 'tags.name_taken');
        $this->assertSame(1, Tag::query()->where('name', 'Piscine')->count());
    }

    public function test_un_nom_pris_a_la_casse_pres_rend_409(): void
    {
        $this->creer('Piscine')->assertCreated();

        $this->creer('piscine')->assertStatus(409)->assertJsonPath('code', 'tags.name_taken');
        $this->creer('ÉTAGE')->assertCreated();
        $this->creer('étage')->assertStatus(409)->assertJsonPath('code', 'tags.name_taken');
    }

    public function test_un_nom_distinct_de_meme_slug_recoit_un_slug_suffixe(): void
    {
        $this->creer('Vue mer')->assertCreated();

        $this->creer('Vue-mer')->assertCreated()->assertJsonPath('data.name', 'Vue-mer');

        $this->assertSame('vue-mer', Tag::query()->where('name', 'Vue mer')->value('slug'));
        $this->assertSame('vue-mer-2', Tag::query()->where('name', 'Vue-mer')->value('slug'));
    }
}
