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

    public function test_modifier_une_fiche_avec_un_champ_trop_long_rend_422(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id, 'first_name' => 'Avant']);
        Sanctum::actingAs($user);

        foreach (self::CLES as $cle) {
            $this->putJson("/api/customers/{$customer->id}", [$cle => str_repeat('a', 256)])
                ->assertStatus(422)
                ->assertJsonValidationErrors($cle);
        }

        $this->assertSame('Avant', $customer->fresh()->first_name);

        $this->putJson("/api/customers/{$customer->id}", array_fill_keys(self::CLES, str_repeat('a', 255)))
            ->assertOk();
    }
}
