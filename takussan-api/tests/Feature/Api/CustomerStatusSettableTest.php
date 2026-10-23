<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1753 (P147.06) — `blocked` et `deleted` ne se posent plus par l'édition d'une fiche : rien
 * ne les lit (seul `active` l'est, pipeline et rapprochement), et un client « supprimé » qui ne
 * l'est pas trompe l'agent ; la suppression a son geste, `destroy`. Une fiche qui les porte déjà
 * se modifie encore : son statut inchangé passe, pour ne réécrire aucune donnée.
 */
class CustomerStatusSettableTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function statutsRetires(): array
    {
        return ['blocked' => ['blocked'], 'deleted' => ['deleted']];
    }

    #[DataProvider('statutsRetires')]
    public function test_l_edition_refuse_de_poser_un_statut_retire(string $statut): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id, 'status' => 'active']);
        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}", ['status' => $statut])
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');

        $this->assertSame('active', $customer->fresh()->status->value);
    }

    public function test_l_edition_pose_active_et_inactive(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id, 'status' => 'active']);
        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}", ['status' => 'inactive'])
            ->assertOk()
            ->assertJsonPath('data.status', 'inactive');
        $this->patchJson("/api/customers/{$customer->id}", ['status' => 'active'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
    }

    #[DataProvider('statutsRetires')]
    public function test_une_fiche_qui_porte_deja_le_statut_se_modifie_encore(string $statut): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id, 'status' => $statut]);
        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}", ['status' => $statut, 'occupation' => 'Commerçante'])
            ->assertOk()
            ->assertJsonPath('data.status', $statut)
            ->assertJsonPath('data.occupation', 'Commerçante');

        $this->patchJson("/api/customers/{$customer->id}", ['status' => 'active'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
    }
}
