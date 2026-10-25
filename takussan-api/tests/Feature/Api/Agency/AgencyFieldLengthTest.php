<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1106 (P91.01) — `agencies.phone` est un `varchar(30)`, `name` et `license_number` des
 * `varchar(255)`. Les voies d'écriture (modification, ouverture par la console) les bornent à la
 * colonne : une valeur trop longue rend 422 sur sa clé, et non le 500 de PostgreSQL (22001). Une
 * valeur à la borne passe. La création par `POST /api/agencies` est retirée (TCK-2311, P225.06).
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

    public function test_ouvrir_une_agence_a_la_console_avec_un_telephone_trop_long_rend_422(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/agencies', $this->onboarding(str_repeat('1', 31)))
            ->assertStatus(422)
            ->assertJsonValidationErrors('agency.phone');

        $this->assertSame(0, Agency::query()->where('slug', 'sunu-gestion')->count());

        // Témoin : 30 caractères, la largeur de la colonne, passent.
        $this->postJson('/api/admin/agencies', $this->onboarding(str_repeat('1', 30)))
            ->assertCreated();
    }

    /** @return array<string, array<string, string>> */
    private function onboarding(string $phone): array
    {
        return [
            'agency' => ['name' => 'Sunu Gestion', 'slug' => 'sunu-gestion', 'phone' => $phone],
            'admin' => ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'email' => 'admin@sunu.test'],
        ];
    }
}
