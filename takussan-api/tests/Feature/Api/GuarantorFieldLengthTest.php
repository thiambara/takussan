<?php

namespace Tests\Feature\Api;

use App\Models\Guarantor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1108 (P91.03) — `guarantors.phone` est un `varchar(30)`, et `first_name`, `last_name`,
 * `occupation`, `employer` et `relationship_to_tenant` des `varchar(255)`. Les trois voies
 * d'écriture d'un garant (création, modification, ajout d'un garant neuf à un bail) les bornent à
 * la colonne : au-delà, 422 sur la clé, et non le 500 de PostgreSQL (22001).
 *
 * TCK-3015 (ADR-0140 § 4) — la borne de CHAQUE voie est tenue par le recensement
 * `Validation\BornesMaxFaceAuSchemaTest` ; ce fichier n'en garde qu'un témoin HTTP, la preuve que la requête
 * bornée est bien celle que la route reçoit.
 */
class GuarantorFieldLengthTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, string> */
    private static function tropLongs(): array
    {
        return [
            // Deux numéros saisis dans le même champ : 31 caractères.
            'phone' => '+221 77 000 00 01 / 78 000 00 02',
            'first_name' => str_repeat('a', 256),
            'last_name' => str_repeat('a', 256),
            'occupation' => str_repeat('a', 256),
            'employer' => str_repeat('a', 256),
            'relationship_to_tenant' => str_repeat('a', 256),
        ];
    }

    /** @return array<string, string> */
    private static function aLaBorne(): array
    {
        return [
            'phone' => str_repeat('1', 30),
            'first_name' => str_repeat('a', 255),
            'last_name' => str_repeat('a', 255),
            'occupation' => str_repeat('a', 255),
            'employer' => str_repeat('a', 255),
            'relationship_to_tenant' => str_repeat('a', 255),
        ];
    }

    public function test_creer_un_garant_avec_un_champ_trop_long_rend_422(): void
    {
        Sanctum::actingAs(User::factory()->create());

        foreach (self::tropLongs() as $cle => $valeur) {
            $this->postJson('/api/guarantors', array_merge(['first_name' => 'Jean', 'last_name' => 'Dupont'], [$cle => $valeur]))
                ->assertStatus(422)
                ->assertJsonValidationErrors($cle);
        }

        $this->assertSame(0, Guarantor::query()->count());

        $this->postJson('/api/guarantors', self::aLaBorne())->assertCreated();
    }
}
