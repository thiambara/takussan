<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\TagType;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1107 (P91.02) — `tags.color` est un `varchar(7)` (taillé pour `#rrggbb`), `tags.icon` un
 * `varchar(255)`. La création et la modification les bornent à la colonne : au-delà, 422 sur la
 * clé, et non le 500 de PostgreSQL (22001). Le format de la couleur n'est pas jugé ici.
 */
class TagFieldLengthTest extends TestCase
{
    use RefreshDatabase;

    public function test_creer_une_etiquette_avec_une_couleur_ou_une_icone_trop_longue_rend_422(): void
    {
        $this->actingAsRole('super_admin');

        foreach (['color' => '#ff0000ff00', 'icon' => str_repeat('i', 256)] as $cle => $valeur) {
            $this->postJson('/api/tags', ['name' => 'Piscine', 'type' => TagType::Amenity->value, $cle => $valeur])
                ->assertStatus(422)
                ->assertJsonValidationErrors($cle);
        }

        $this->assertFalse(Tag::query()->where('name', 'Piscine')->exists());

        // Témoin : à la borne de la colonne, l'étiquette se crée.
        $this->postJson('/api/tags', [
            'name' => 'Piscine',
            'type' => TagType::Amenity->value,
            'color' => '#ff0000',
            'icon' => str_repeat('i', 255),
        ])->assertCreated();
    }

    public function test_modifier_une_etiquette_avec_une_couleur_ou_une_icone_trop_longue_rend_422(): void
    {
        $this->actingAsRole('super_admin');
        $tag = Tag::factory()->create(['color' => '#000000', 'icon' => 'avant']);

        foreach (['color' => 'turquoise', 'icon' => str_repeat('i', 256)] as $cle => $valeur) {
            $this->patchJson("/api/tags/{$tag->id}", [$cle => $valeur])
                ->assertStatus(422)
                ->assertJsonValidationErrors($cle);
        }

        $tag->refresh();
        $this->assertSame('#000000', $tag->color);
        $this->assertSame('avant', $tag->icon);

        // Témoin : à la borne de la colonne, la modification passe.
        $this->patchJson("/api/tags/{$tag->id}", ['color' => '#ffffff', 'icon' => str_repeat('i', 255)])
            ->assertOk();
    }
}
