<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-2365 (P251.02, décision du porteur du 2026-10-25) — la console demande, facultatif, le
 * numéro du gérant, cherché parmi les numéros VÉRIFIÉS : s'il appartient à un compte, la création
 * est refusée en 409, comme pour l'e-mail.
 *
 * Avant : le numéro était ignoré, et le gérant qui avait déjà un compte créé par numéro, sans
 * adresse, en recevait un second que rien ne voyait.
 */
class NumeroDuGerantALaCreationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->actingAsRole('super_admin');
    }

    /** @return array<string, mixed> */
    private function payload(?string $phone): array
    {
        return [
            'agency' => ['name' => 'Sunu Gestion'],
            'admin' => array_filter([
                'first_name' => 'Awa',
                'last_name' => 'Ndiaye',
                'email' => 'gerant@sunu.test',
                'phone' => $phone,
            ]),
        ];
    }

    public function test_le_numero_verifie_d_un_compte_existant_refuse_la_creation(): void
    {
        User::factory()->create(['email' => null, 'phone' => '+221771112233', 'phone_verified_at' => now()]);
        $comptes = User::query()->count();

        // Saisi comme on le tape, espaces compris : la recherche compare la forme canonique.
        $this->postJson('/api/admin/agencies', $this->payload('+221 77 111 22 33'))
            ->assertStatus(409)
            ->assertJsonPath('code', 'agency.admin_phone_taken');

        $this->assertSame($comptes, User::query()->count());
        $this->assertSame(0, Agency::query()->where('name', 'Sunu Gestion')->count());
    }

    public function test_un_numero_saisi_mais_non_verifie_ne_refuse_rien(): void
    {
        User::factory()->create(['phone' => '+221771112233', 'phone_verified_at' => null]);

        $this->postJson('/api/admin/agencies', $this->payload('+221771112233'))->assertCreated();
    }

    public function test_sans_numero_la_creation_reste_ouverte(): void
    {
        $this->postJson('/api/admin/agencies', $this->payload(null))->assertCreated();
    }

    public function test_un_numero_qui_ne_ressemble_a_rien_est_refuse_en_422(): void
    {
        $this->postJson('/api/admin/agencies', $this->payload(str_repeat('9', 40)))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['admin.phone']);
    }
}
