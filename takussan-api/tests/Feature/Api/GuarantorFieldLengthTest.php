<?php

namespace Tests\Feature\Api;

use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1108 (P91.03) — `guarantors.phone` est un `varchar(30)`, et `first_name`, `last_name`,
 * `occupation`, `employer` et `relationship_to_tenant` des `varchar(255)`. Les trois voies
 * d'écriture d'un garant (création, modification, ajout d'un garant neuf à un bail) les bornent à
 * la colonne : au-delà, 422 sur la clé, et non le 500 de PostgreSQL (22001).
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

    public function test_modifier_un_garant_avec_un_champ_trop_long_rend_422(): void
    {
        $user = User::factory()->create();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $user->id, 'first_name' => 'Avant']);
        Sanctum::actingAs($user);

        foreach (self::tropLongs() as $cle => $valeur) {
            $this->putJson("/api/guarantors/{$guarantor->id}", [$cle => $valeur])
                ->assertStatus(422)
                ->assertJsonValidationErrors($cle);
        }

        $this->assertSame('Avant', $guarantor->fresh()->first_name);

        $this->putJson("/api/guarantors/{$guarantor->id}", self::aLaBorne())->assertOk();
    }

    public function test_ajouter_un_garant_neuf_a_un_bail_avec_un_champ_trop_long_rend_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'landlord_id' => $owner->id]);
        Sanctum::actingAs($owner);

        foreach (self::tropLongs() as $cle => $valeur) {
            $this->postJson("/api/leases/{$lease->id}/guarantors", array_merge(['first_name' => 'Awa', 'last_name' => 'Diop'], [$cle => $valeur]))
                ->assertStatus(422)
                ->assertJsonValidationErrors($cle);
        }

        $this->assertSame(0, $lease->guarantors()->count());

        $this->postJson("/api/leases/{$lease->id}/guarantors", self::aLaBorne())->assertCreated();
    }
}
