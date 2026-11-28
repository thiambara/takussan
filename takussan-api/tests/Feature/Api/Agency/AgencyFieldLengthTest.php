<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1106 (P91.01) — `agencies.phone` est un `varchar(30)`, `name` et `license_number` des
 * `varchar(255)`. Les voies d'écriture (modification, ouverture par la console) les bornent à la
 * colonne : une valeur trop longue rend 422 sur sa clé, et non le 500 de PostgreSQL (22001). Une
 * valeur à la borne passe. La création par `POST /api/agencies` est retirée (TCK-2311, P225.06).
 *
 * TCK-3015 (ADR-0140 § 4) — la borne de CHAQUE voie est tenue par le recensement
 * `Validation\BornesMaxFaceAuSchemaTest` ; ce fichier n'en garde qu'un témoin HTTP, la preuve que la requête
 * bornée est bien celle que la route reçoit.
 */
class AgencyFieldLengthTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_modifier_une_agence_avec_un_champ_trop_long_rend_422(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id, 'name' => 'Avant']);
        Sanctum::actingAs($admin);

        foreach ([
            'phone' => str_repeat('1', 31),
            'name' => str_repeat('a', 256),
            'license_number' => str_repeat('L', 256),
        ] as $cle => $valeur) {
            $this->patchJson("/api/agencies/{$agency->id}", [$cle => $valeur])
                ->assertStatus(422)
                ->assertJsonValidationErrors($cle);
        }

        $this->assertSame('Avant', $agency->fresh()->name);

        // Témoin : à la borne de la colonne, la modification passe.
        $this->patchJson("/api/agencies/{$agency->id}", [
            'name' => str_repeat('a', 255),
            'phone' => str_repeat('1', 30),
            'license_number' => str_repeat('L', 255),
        ])->assertOk();
    }
}
