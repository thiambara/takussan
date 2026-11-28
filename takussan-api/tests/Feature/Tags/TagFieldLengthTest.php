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
 *
 * TCK-3015 (ADR-0140 § 4) — la borne de CHAQUE voie est tenue par le recensement
 * `Validation\BornesMaxFaceAuSchemaTest` ; ce fichier n'en garde qu'un témoin HTTP, la preuve que la requête
 * bornée est bien celle que la route reçoit.
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
}
