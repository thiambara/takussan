<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1109 (P91.04) — `customers.first_name`, `last_name` et `occupation` sont des `varchar(255)`.
 * La création et la modification d'une fiche les bornent à la colonne, comme leur voisin
 * `emergency_contact_name` : au-delà, 422 sur la clé, et non le 500 de PostgreSQL (22001).
 *
 * TCK-3015 (ADR-0140 § 4) — la borne de CHAQUE voie est tenue par le recensement
 * `Validation\BornesMaxFaceAuSchemaTest` ; ce fichier n'en garde qu'un témoin HTTP, la preuve que la requête
 * bornée est bien celle que la route reçoit.
 */
class CustomerFieldLengthTest extends TestCase
{
    use RefreshDatabase;

    private const CLES = ['first_name', 'last_name', 'occupation'];

    public function test_creer_une_fiche_avec_un_champ_trop_long_rend_422(): void
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', Agency::factory()->create());
        Sanctum::actingAs($user);

        foreach (self::CLES as $cle) {
            $this->postJson('/api/customers', array_merge(
                ['first_name' => 'Amadou', 'last_name' => 'Diop'],
                [$cle => str_repeat('a', 256)],
            ))->assertStatus(422)->assertJsonValidationErrors($cle);
        }

        $this->assertSame(0, Customer::query()->count());

        // Témoin : à la borne de la colonne, la fiche se crée.
        $this->postJson('/api/customers', array_fill_keys(self::CLES, str_repeat('a', 255)))
            ->assertCreated();
    }
}
